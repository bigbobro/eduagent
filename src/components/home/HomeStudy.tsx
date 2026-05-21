'use client';

import type { Course } from '@/types/course';
import { Cat, PaperBg, PaperButton, Sparkle, Star, palette } from '@/components/magic';

interface HomeStudyProps {
  courses: Course[] | null;
  error?: boolean;
  onRetry: () => void;
  onCourseStart: (courseId: string) => void;
  onJournal: () => void;
  onParents: () => void;
  stats?: { stars: number; streak: number };
}

const bookRotation = [-1.2, 0.8, -0.6, 1.1];

export function HomeStudy({
  courses,
  error = false,
  onRetry,
  onCourseStart,
  onJournal,
  onParents,
  stats = { stars: 0, streak: 0 },
}: HomeStudyProps) {
  return (
    <PaperBg tone="paperDeep" className="h-screen w-screen">
      <main className="relative h-full w-full overflow-hidden px-10 py-8 text-ink">
        <header className="relative z-10 flex items-center justify-between">
          <div>
            <h1 className="font-display text-[34px] leading-none">魔法书房</h1>
            <p className="mt-2 font-zh text-base text-inkSoft">今天也和麻吉一起读一本咒语书</p>
          </div>
          <div className="flex items-center gap-5 rounded-paper-pill border-2 border-ink bg-paper px-5 py-3 shadow-paper">
            <span className="inline-flex items-center gap-2 font-zh text-sm">
              <Star size={22} />
              <b className="font-en text-xl">{stats.stars}</b>
            </span>
            <span className="font-zh text-sm text-inkSoft">连续 {stats.streak} 天</span>
          </div>
        </header>

        <section className="relative z-10 mt-8 grid h-[calc(100%-112px)] grid-cols-[1.35fr_1fr] gap-8">
          <div className="flex min-h-0 flex-col justify-center">
            <div className="grid max-h-full max-w-3xl grid-cols-2 gap-4 overflow-y-auto pr-2">
              {error && (
                <div className="col-span-2 rounded-paper-lg border-[2.4px] border-ink bg-paper p-8 text-center shadow-paper-hero">
                  <p className="font-zh text-xl text-ink">咒语书暂时没有送到</p>
                  <PaperButton className="mt-5" onClick={onRetry}>重试</PaperButton>
                </div>
              )}

              {!error && courses === null && [0, 1, 2, 3].map((i) => (
                <div key={i} className="h-44 animate-pulse rounded-paper-lg border-2 border-inkPale bg-paper/60 shadow-paper" />
              ))}

              {!error && courses?.map((course, index) => (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => onCourseStart(course.id)}
                  aria-label={`开始课程:${course.title}`}
                  className="group relative h-32 rounded-paper-lg border-[2.4px] border-ink bg-paper p-5 text-left shadow-paper-hero transition-all duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-butterDeep focus-visible:ring-offset-2"
                  style={{ transform: `rotate(${bookRotation[index % bookRotation.length]}deg)` }}
                >
                  <div
                    className="absolute bottom-0 left-0 top-0 w-10 rounded-l-[26px] border-r-2 border-ink"
                    style={{ background: palette[course.tone] }}
                    aria-hidden="true"
                  />
                  <div className="ml-12 flex h-full flex-col justify-between">
                    <div>
                      <div className="font-display text-[26px] leading-tight text-ink">{course.title}</div>
                      <div className="mt-2 font-en text-base text-inkSoft">{course.id}</div>
                    </div>
                    <div className="font-zh text-sm text-inkSoft">{course.cards.filter((card) => card.kind === 'word').length} 个词</div>
                  </div>
                  <Sparkle className="absolute right-5 top-5 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>

          <aside className="relative flex items-center justify-center">
            <div className="absolute left-8 top-16 h-40 w-40 rounded-paper-lg border-2 border-ink bg-sky/70 shadow-paper" aria-hidden="true" />
            <div className="absolute bottom-14 h-20 w-full rounded-[50%] bg-peach/50" aria-hidden="true" />
            <div className="relative z-10 flex flex-col items-center gap-4">
              <Cat size={250} mood="happy" />
              <div className="max-w-[320px] rotate-[-1deg] rounded-paper-lg border-2 border-ink bg-butter px-5 py-4 text-center font-zh text-lg leading-snug shadow-paper">
                选一本书,我们就开始今天的魔法英语。
              </div>
              <div className="flex gap-3">
                <PaperButton color="mint" size="sm" onClick={onJournal}>魔法书</PaperButton>
                <PaperButton color="lilac" size="sm" onClick={onParents}>家长阁楼</PaperButton>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </PaperBg>
  );
}
