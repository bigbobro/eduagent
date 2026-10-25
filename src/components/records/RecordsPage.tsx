'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import maji from '../../../desktop/build-resources/icon-source.png';
import type { CourseProgress, ProgressSnapshot, SessionSummary, StatsSnapshot } from '@/types/progress';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { CourseWordsSheet } from './CourseWordsSheet';
import { Heatmap } from './Heatmap';
import './records.css';

interface RecordsPageProps {
  name: string;
  progress: ProgressSnapshot | null;
  stats: StatsSnapshot | null;
  sessions: SessionSummary[] | null;
  error?: boolean;
  onRetry: () => void;
  onStart: () => void;
}

function latestActivity(course: CourseProgress, recent: Map<string, number>) {
  const practiced = course.words.map(word => (word.lastPracticed ? Date.parse(word.lastPracticed) || 0 : 0));
  return Math.max(recent.get(course.courseId) ?? 0, ...practiced);
}

function sessionWhen(startTime: string) {
  const date = new Date(startTime);
  const clock = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date.getMonth() + 1}/${date.getDate()} ${clock}`;
}

export function RecordsPage({ name, progress, stats, sessions, error, onRetry, onStart }: RecordsPageProps) {
  const [opened, setOpened] = useState<CourseProgress | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  if (error) {
    return (
      <div className="records-state">
        <EmptyState title="暂时读不到学习记录" action={<Button onClick={onRetry}>重试</Button>} />
      </div>
    );
  }
  if (!progress || !stats || !sessions) {
    return (
      <div className="records-loading">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} label="正在读取学习记录" />)}
      </div>
    );
  }
  if (!stats.totalSessions) {
    return (
      <div className="records-state">
        <EmptyState
          title="上完第一节课,这里就会有记录"
          action={<Button onClick={onStart}>去上课</Button>}
          illustration={<Image src={maji} alt="麻吉" width={132} height={132} />}
        />
      </div>
    );
  }

  const recent = new Map<string, number>();
  sessions.forEach(session => {
    recent.set(session.courseId, Math.max(recent.get(session.courseId) ?? 0, Date.parse(session.startTime)));
  });
  const courses = progress.courses
    .filter(course => course.timesStarted > 0)
    .sort((a, b) => latestActivity(b, recent) - latestActivity(a, recent));
  const words = progress.courses.flatMap(course => course.words);
  const practice = words.filter(word => word.attempts > 0 && word.masteryStars <= 1).slice(0, 5);
  const days = stats.lastDays ?? stats.last7Days;
  const months = Array.from(new Set(days.map(day => Number(day.date.slice(5, 7)))));
  const learnedWords = words.filter(word => word.masteryStars >= 2).length;
  const recentMinutes = stats.last7Days.reduce((sum, day) => sum + day.minutes, 0);
  const hours = Math.floor(stats.totalMinutes / 60);
  const minutes = stats.totalMinutes % 60;
  const openCourse = (course: CourseProgress, opener: HTMLButtonElement) => {
    openerRef.current = opener;
    setOpened(course);
  };
  const closeCourse = () => setOpened(null);

  return (
    <main className="records-page">
      <h1>
        {name}的学习记录
        <small>上过 {stats.totalSessions} 节课 · 共 {hours} 小时 {minutes} 分钟</small>
      </h1>
      <section className="records-panel">
        <h2>
          最近 13 周
          <small>颜色越深,那天学得越久</small>
        </h2>
        <Heatmap days={days} months={months} />
      </section>
      <section className="records-panel">
        <h2>
          各课程掌握情况
          <small>按最近上课排序</small>
        </h2>
        <div className="records-bars">
          {courses.map(course => {
            const learned = course.words.filter(word => word.masteryStars >= 2).length;
            const open = opened?.courseId === course.courseId;
            return (
              <div key={course.courseId} className="records-course">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={open}
                  aria-controls={open ? 'records-course-sheet' : undefined}
                  onClick={event => openCourse(course, event.currentTarget)}
                  onKeyDown={event => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openCourse(course, event.currentTarget);
                  }}
                >
                  <span>{course.courseTitle.split(/\s+[A-Za-z]/)[0]}</span>
                  <ProgressBar value={learned / course.totalWords * 100} label={`${course.courseTitle}掌握情况`} />
                  <span>{learned}/{course.totalWords}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>
      <section className="records-panel">
        <div className="records-stats">
          {[
            [learnedWords, '个', '会说的单词'],
            [stats.totalSessions, '节', '上过的课'],
            [recentMinutes, '分钟', '最近 7 天'],
          ].map(([value, unit, label]) => (
            <div key={label}>
              <b>{value}<small>{unit}</small></b>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <h2>最近几节课</h2>
        <div className="records-sessions">
          {sessions.slice(0, 4).map(session => (
            <div key={session.lessonId}>
              <span>{sessionWhen(session.startTime)}</span>
              <span>{session.courseTitle}</span>
              <span>{Math.round(session.durationMs / 60000)} 分钟</span>
              <span>{session.wordsMastered} 个词</span>
            </div>
          ))}
        </div>
      </section>
      <section className="records-panel">
        <h2>
          需要多练的词
          <small>练过但还没掌握</small>
        </h2>
        {practice.length ? (
          <div className="records-practice">
            {practice.map((word, index) => (
              <div key={`${word.word}-${index}`}>
                {word.imageUrl && <Image src={word.imageUrl} width={160} height={160} alt="" />}
                <b title={word.word}>{word.word}</b>
                <small>{word.zh}</small>
              </div>
            ))}
          </div>
        ) : <p>暂无需要多练的词</p>}
      </section>
      {opened && (
        <CourseWordsSheet
          course={opened}
          returnFocus={openerRef.current}
          onClose={closeCourse}
        />
      )}
    </main>
  );
}
