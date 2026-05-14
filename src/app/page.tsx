'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SceneFrame } from '@/components/scene/SceneFrame';
import { LetterCard } from '@/components/home/LetterCard';
import { Bunny } from '@/components/bunny/Bunny';
import { Door, Ladder } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { Course } from '@/types/course';

const LETTER_SPOTS = [
  { x: 0.18, y: 0.65, rotate: -8 },
  { x: 0.42, y: 0.72, rotate: 5 },
  { x: 0.62, y: 0.66, rotate: -3 },
  { x: 0.82, y: 0.74, rotate: 10 },
];

export default function HomePage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    fetch('/api/courses')
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then(setCourses)
      .catch(() => setError(true));
  };
  useEffect(load, []);

  if (error) {
    return (
      <main className="w-screen h-screen">
        <SceneFrame variant="yard">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
            <Bunny pose="sit" mood="idle" size={220} />
            <p className="font-zh text-xl text-bunny-ink">信件好像还没送到,过一会儿再来吧</p>
            <Button onClick={load}>重试</Button>
          </div>
        </SceneFrame>
      </main>
    );
  }

  return (
    <main className="w-screen h-screen relative">
      <SceneFrame variant="yard">
        <button
          type="button"
          onClick={() => router.push('/parents')}
          aria-label="进入阁楼(家长后台)"
          className="absolute top-32 right-[28%] w-16 h-32 z-10 flex items-center justify-center text-bunny-wood-deep/60 hover:text-bunny-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink rounded"
        >
          <Ladder width={48} height={96} />
        </button>

        <button
          type="button"
          onClick={() => router.push('/journal')}
          aria-label="进入储物间(小词典)"
          className="absolute top-1/2 right-12 -translate-y-1/2 w-20 h-32 z-10 rounded-bunny-md flex items-center justify-center bg-bunny-wood/40 hover:bg-bunny-pink-soft text-bunny-wood-deep shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bunny-pink"
        >
          <Door width={56} height={96} />
        </button>

        <div className="absolute bottom-12 left-12 z-10">
          <Bunny pose="sit" mood="idle" size={220} />
        </div>

        {courses
          ? courses.slice(0, LETTER_SPOTS.length).map((c, i) => {
              const spot = LETTER_SPOTS[i];
              return (
                <LetterCard
                  key={c.id}
                  course={c}
                  position={{
                    x: typeof window !== 'undefined' ? window.innerWidth * spot.x : 200,
                    y: typeof window !== 'undefined' ? window.innerHeight * spot.y : 400,
                    rotate: spot.rotate,
                  }}
                  onClick={() => router.push(`/lesson/${c.id}`)}
                />
              );
            })
          : LETTER_SPOTS.map((spot, i) => (
              <div
                key={i}
                className="absolute w-56 h-32 rounded-bunny-md bg-bunny-bg-warmpaper/60 shadow-soft animate-pulse"
                style={{
                  left: typeof window !== 'undefined' ? window.innerWidth * spot.x : 200,
                  top: typeof window !== 'undefined' ? window.innerHeight * spot.y : 400,
                  transform: `rotate(${spot.rotate}deg)`,
                }}
              />
            ))}
      </SceneFrame>
    </main>
  );
}
