'use client';

import { useState } from 'react';
import type { ProgressSnapshot, CourseProgress } from '@/types/progress';
import { Cat, PaperBg, PaperButton, PictureCard, Star } from '@/components/magic';

interface JournalPageProps {
  snapshot: ProgressSnapshot | null;
  error?: boolean;
  onBack: () => void;
  onRetry: () => void;
}

export function JournalPage({ snapshot, error = false, onBack, onRetry }: JournalPageProps) {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const hasPractice = snapshot?.courses.some(hasCoursePractice) ?? false;
  const defaultChapter = snapshot?.courses.find(hasCoursePractice) ?? snapshot?.courses[0] ?? null;
  const activeChapter = snapshot?.courses.find((course) => course.courseId === selectedCourseId) ?? defaultChapter;
  const totalCollected = snapshot?.totalWordsMastered ?? 0;

  return (
    <PaperBg tone="paperDeep" className="h-screen w-screen">
      <main className="h-full px-12 py-6 text-ink">
        <header className="flex items-center justify-between border-b border-dashed border-inkPale pb-4">
          <div className="flex items-center gap-4">
            <PaperButton size="sm" color="paper" onClick={onBack}>回大厅</PaperButton>
            <h1 className="font-display text-[30px] leading-none">我的魔法书</h1>
            <span className="font-en-script text-lg text-inkSoft">My Spellbook</span>
          </div>
          <div className="font-zh text-base text-inkSoft">
            已收集 <b className="font-en text-[22px] text-ink">{totalCollected}</b> 个词
          </div>
        </header>

        {error && (
          <div className="flex h-[calc(100%-72px)] flex-col items-center justify-center gap-5">
            <Cat size={180} mood="think" />
            <p className="font-zh text-xl">魔法书暂时打不开</p>
            <PaperButton onClick={onRetry}>重试</PaperButton>
          </div>
        )}

        {!error && !snapshot && (
          <div className="grid h-[calc(100%-72px)] grid-cols-2 gap-6 py-8">
            <div className="animate-pulse rounded-l-paper-lg border-2 border-inkPale bg-paper/60" />
            <div className="animate-pulse rounded-r-paper-lg border-2 border-inkPale bg-paper/60" />
          </div>
        )}

        {!error && snapshot && !hasPractice && (
          <div className="flex h-[calc(100%-72px)] flex-col items-center justify-center gap-5">
            <Cat size={190} mood="idle" />
            <p className="font-zh text-xl">先去大厅上一节课,魔法书就会亮起来。</p>
            <PaperButton onClick={onBack}>去大厅</PaperButton>
          </div>
        )}

        {!error && snapshot && hasPractice && activeChapter && (
          <div className="grid h-[calc(100%-72px)] grid-cols-2 gap-5 py-7">
            <BookPage side="left">
              <div className="mb-5">
                <div className="font-display text-[30px] leading-none">目录</div>
                <div className="mt-1 font-en-script text-lg text-inkSoft">Chapters</div>
              </div>
              {snapshot.courses.map((course) => (
                <ChapterRow
                  key={course.courseId}
                  course={course}
                  active={course.courseId === activeChapter.courseId}
                  onSelect={() => setSelectedCourseId(course.courseId)}
                />
              ))}
              <div className="mt-8 rotate-[-1deg] rounded-paper-lg border-2 border-ink bg-butter p-4 shadow-paper">
                <div className="flex items-center gap-2 font-display text-[22px]">
                  <Star size={24} />
                  {snapshot.totalWordsMastered} 个掌握词
                </div>
              </div>
              <div className="absolute bottom-7 right-8 rotate-[-4deg]">
                <Cat size={120} mood="happy" />
              </div>
            </BookPage>

            <BookPage side="right">
              <div className="mb-5 flex items-baseline justify-between">
                <div>
                  <div className="font-display text-[28px] leading-none">{activeChapter.courseTitle}</div>
                  <div className="mt-1 font-en-script text-base text-inkSoft">
                    {activeChapter.masteredWords} of {activeChapter.totalWords} collected
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {activeChapter.words.map((word) => (
                  <PictureCard
                    key={word.word}
                    size="chip"
                    state={word.masteryStars > 0 ? 'correct' : 'idle'}
                    dimmed={word.masteryStars === 0}
                    badgeKind={word.masteryStars === 0 ? 'locked' : undefined}
                    card={{
                      kind: 'word',
                      en: word.word,
                      zh: word.zh,
                      imageUrl: word.imageUrl,
                      emoji: word.emoji,
                      tone: activeChapter.courseTone,
                    }}
                  />
                ))}
              </div>
            </BookPage>
          </div>
        )}
      </main>
    </PaperBg>
  );
}

function hasWordPractice(word: CourseProgress['words'][number]) {
  return word.attempts > 0 || word.correct > 0 || word.masteryStars > 0 || word.lastPracticed !== null;
}

function hasCoursePractice(course: CourseProgress) {
  return course.words.some(hasWordPractice);
}

function BookPage({ side, children }: { side: 'left' | 'right'; children: React.ReactNode }) {
  const radius = side === 'left' ? 'rounded-l-[24px] rounded-r' : 'rounded-r-[24px] rounded-l';
  const insetShadow = side === 'left' ? 'inset -8px 0 18px -10px rgba(61,51,38,0.18)' : 'inset 8px 0 18px -10px rgba(61,51,38,0.18)';
  return (
    <section
      className={`relative overflow-hidden border-2 border-ink bg-paper p-7 shadow-paper ${radius}`}
      style={{ boxShadow: `4px 5px 0 #E8DDC0, ${insetShadow}` }}
    >
      {children}
    </section>
  );
}

function ChapterRow({ course, active, onSelect }: { course: CourseProgress; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`查看课程:${course.courseTitle}`}
      onClick={onSelect}
      className={[
        'mb-3 flex w-full items-center justify-between rounded-paper-md border px-4 py-3 text-left',
        active ? 'border-ink bg-peach' : 'border-dashed border-inkPale bg-transparent',
      ].join(' ')}
    >
      <div>
        <div className="font-display text-xl">{course.courseTitle}</div>
        <div className="font-en text-sm text-inkSoft">{course.masteredWords} / {course.totalWords}</div>
      </div>
      <span className="font-en-script text-2xl text-inkSoft">p. {course.masteredWords + 1}</span>
    </button>
  );
}
