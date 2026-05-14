'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SceneFrame } from '@/components/scene/SceneFrame';
import { Bunny } from '@/components/bunny/Bunny';
import { Button } from '@/components/ui/Button';
import { StickerWord } from '@/components/done/StickerWord';
import type { ProgressSnapshot } from '@/types/progress';
import type { Course } from '@/types/course';

interface Props {
  courseId: string;
}

export function LessonDoneClient({ courseId }: Props) {
  const router = useRouter();
  const [snap, setSnap] = useState<ProgressSnapshot | null>(null);
  const [, setCourse] = useState<Course | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/progress').then((r) => r.json()),
      fetch('/api/courses').then((r) => r.json()),
    ])
      .then(([p, courses]: [ProgressSnapshot, Course[]]) => {
        setSnap(p);
        setCourse(courses.find((c) => c.id === courseId) ?? null);
      })
      .catch(() => {
        setSnap({ courses: [], totalWordsMastered: 0, generatedAt: '' });
      });
  }, [courseId]);

  useEffect(() => {
    const t = setTimeout(() => router.push('/'), 8000);
    return () => clearTimeout(t);
  }, [router]);

  const masteredThisCourse =
    snap?.courses.find((c) => c.courseId === courseId)?.words.filter((w) => w.masteryStars >= 2) ??
    [];
  const totalNew = masteredThisCourse.length;

  return (
    <main className="w-screen h-screen relative">
      <SceneFrame variant="grass" enterFrom="cabin">
        <div className="absolute left-1/2 bottom-20 -translate-x-1/2 z-10">
          <Bunny pose="hold-flower" mood="speaking" size={260} />
        </div>

        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-10 max-w-xl text-center">
          {totalNew > 0 ? (
            <p className="font-zh text-3xl text-bunny-ink">
              今天你认识了 <span className="font-en text-bunny-pink">{totalNew}</span> 个新朋友!
            </p>
          ) : (
            <p className="font-zh text-2xl text-bunny-ink">我们一起又练了一次,下回继续加油!</p>
          )}
        </div>

        {masteredThisCourse.slice(0, 8).map((w, i) => {
          const cols = 4;
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x =
            typeof window !== 'undefined' ? window.innerWidth * (0.18 + col * 0.16) : 200 + col * 200;
          const y =
            typeof window !== 'undefined' ? window.innerHeight * (0.45 + row * 0.18) : 400 + row * 100;
          const rot = i % 2 === 0 ? -5 + (i * 3) % 15 : 5 - (i * 4) % 15;
          return (
            <StickerWord
              key={w.word}
              index={i}
              english={w.word}
              chinese={w.zh}
              position={{ x, y, rotate: rot }}
            />
          );
        })}

        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4 z-20">
          <Button variant="ghost" onClick={() => router.push('/journal')}>
            看看小词典
          </Button>
          <Button onClick={() => router.push('/')}>再选一封信</Button>
        </div>
      </SceneFrame>
    </main>
  );
}
