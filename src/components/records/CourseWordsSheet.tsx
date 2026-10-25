'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { CourseProgress } from '@/types/progress';
import { HomeWordCard } from '@/components/home/HomeWordCard';

function titleParts(title: string) {
  const split = title.search(/[A-Za-z]/);
  if (split < 0) return { zh: title, en: '' };
  return { zh: title.slice(0, split).trim(), en: title.slice(split).trim() };
}

interface CourseWordsSheetProps {
  course: CourseProgress;
  returnFocus: HTMLElement | null;
  onClose: () => void;
}

export function CourseWordsSheet({ course, returnFocus, onClose }: CourseWordsSheetProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef(returnFocus);
  onCloseRef.current = onClose;
  const learned = course.words.filter(word => word.masteryStars >= 2).length;
  const remaining = course.words.length - learned;
  const name = titleParts(course.courseTitle);

  useEffect(() => {
    const returnTo = returnFocusRef.current;
    closeRef.current?.focus();
    document.body.classList.add('records-sheet-open');
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('records-sheet-open');
      window.removeEventListener('keydown', onKey);
      returnTo?.focus();
    };
  }, []);

  const sheet = (
    <div
      className="records-mask"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        id="records-course-sheet"
        className="records-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key !== 'Tab') return;
          event.preventDefault();
          closeRef.current?.focus();
        }}
      >
        <header className="records-sheet-head">
          <div>
            <h2 id={titleId}>
              {name.zh || name.en}
              {name.zh && name.en && <span>{name.en}</span>}
            </h2>
            <p>已会 {learned} 个 · 还剩 {remaining} 个</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="records-sheet-close"
            aria-label="关闭"
            onClick={() => onCloseRef.current()}
          >
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>
        <div className="records-sheet-wall" aria-label={`${course.courseTitle}逐词掌握`}>
          {course.words.map(word => (
            <HomeWordCard
              key={word.word}
              english={word.word}
              chinese={word.zh}
              imageUrl={word.imageUrl}
              stars={word.masteryStars}
              attempts={word.attempts}
            />
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
