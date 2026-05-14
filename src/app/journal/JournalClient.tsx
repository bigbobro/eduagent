'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SceneFrame } from '@/components/scene/SceneFrame';
import { Bunny } from '@/components/bunny/Bunny';
import { Button } from '@/components/ui/Button';
import { ArrowLeft } from '@/components/ui/icons';
import { BookShelf } from '@/components/journal/BookShelf';
import type { ProgressSnapshot } from '@/types/progress';

export function JournalClient() {
  const router = useRouter();
  const [snap, setSnap] = useState<ProgressSnapshot | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    fetch('/api/progress')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then(setSnap)
      .catch(() => setError(true));
  };
  useEffect(load, []);

  const isEmpty =
    snap &&
    snap.totalWordsMastered === 0 &&
    snap.courses.every((c) => c.words.every((w) => w.attempts === 0));

  return (
    <main className="w-screen h-screen relative">
      <SceneFrame variant="storage" enterFrom="yard">
        <header className="absolute top-0 left-0 right-0 h-14 px-6 flex items-center justify-between z-20 bg-gradient-to-b from-bunny-bg-cream/80 to-transparent">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-2 px-3 py-2 rounded-bunny-md text-bunny-ink hover:bg-bunny-pink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink"
            aria-label="返回院子"
          >
            <ArrowLeft width={20} height={20} />
            <span className="font-zh text-sm">返回院子</span>
          </button>
          <h1 className="font-zh text-xl text-bunny-ink">Bunny 的小词典</h1>
          <div className="w-32" />
        </header>

        <div className="absolute inset-0 top-14 overflow-y-auto px-12 py-8">
          {error && (
            <div className="text-center mt-32">
              <Bunny pose="read" mood="thinking" size={200} />
              <p className="font-zh text-xl mt-4 text-bunny-ink">小词典还没整理好</p>
              <Button onClick={load} className="mt-4">
                重试
              </Button>
            </div>
          )}
          {!error && !snap && (
            <div className="space-y-6">
              {[1, 2].map((i) => (
                <div key={i} className="rounded-bunny-lg bg-bunny-wood/20 h-40 animate-pulse" />
              ))}
            </div>
          )}
          {!error && snap && isEmpty && (
            <div className="text-center mt-32">
              <Bunny pose="read" mood="idle" size={200} />
              <p className="font-zh text-xl mt-4 text-bunny-ink">
                还没有小词典 — 先去院子选一封信开始第一课吧
              </p>
              <Button onClick={() => router.push('/')} className="mt-4">
                去院子
              </Button>
            </div>
          )}
          {!error && snap && !isEmpty && snap.courses.map((c) => <BookShelf key={c.courseId} course={c} />)}
        </div>

        <div className="absolute bottom-4 right-4 z-10 opacity-60 pointer-events-none">
          <Bunny pose="read" mood="idle" size={140} />
        </div>
      </SceneFrame>
    </main>
  );
}
