'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Check } from 'lucide-react';
import type { Course } from '@/types/course';
import type { CourseProgress } from '@/types/progress';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tag } from '@/components/ui/Tag';
import './home.css';

interface CourseHomeProps {
  courses: Course[] | null;
  progress: CourseProgress[] | null;
  learnerId: string;
  error: boolean;
  onRetry: () => void;
  onCourseStart: (id: string) => void;
}

export function courseGroup(status?: CourseProgress): '接着学' | '学完了' | '新课' {
  if (status?.completed) return '学完了';
  if (status?.hasResume || (status?.timesStarted ?? 0) > 0) return '接着学';
  return '新课';
}
function courseName(title: string) {
  const split = title.search(/[A-Za-z]/);
  return split < 0 ? { zh: title, en: '' } : { zh: title.slice(0, split).trim(), en: title.slice(split) };
}
export function lastPracticeLabel(words: CourseProgress['words'], now = new Date()): string | null {
  const times = words.map(word => word.lastPracticed ? new Date(word.lastPracticed).getTime() : NaN).filter(Number.isFinite);
  if (!times.length) return null;
  const date = new Date(Math.max(...times));
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(midnight); yesterday.setDate(yesterday.getDate() - 1);
  const day = date >= midnight ? '今天' : date >= yesterday ? '昨天' : `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${day} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function selectionKey(learnerId: string) { return `eduagent.selectedCourse.${learnerId}`; }
function readSelection(learnerId: string) { try { return localStorage.getItem(selectionKey(learnerId)); } catch { return null; } }

export function HomeSkeleton() {
  return <div className="home-layout" aria-label="正在读取课程"><aside className="home-side">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} label="正在读取课程列表" className="home-row-skeleton" />)}</aside><main className="home-detail"><Skeleton label="正在读取课程详情" className="home-hero-skeleton" /><div className="home-wall">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} label="正在读取单词" />)}</div></main></div>;
}

// Remounted by learnerId, so a child's remembered choice never leaks to another child.
export function CourseHome({ courses, progress, learnerId, error, onRetry, onCourseStart }: CourseHomeProps) {
  const [selected, setSelected] = useState(() => readSelection(learnerId));
  if (error) return <main className="home-state"><EmptyState title="暂时读不到课程" action={<Button onClick={onRetry}>重试</Button>}>请重试读取课程和学习进度。</EmptyState></main>;
  if (!courses || !progress) return <HomeSkeleton />;
  if (!courses.length) return <main className="home-state"><EmptyState title="还没有课程" action={<Button onClick={onRetry}>重试</Button>} /></main>;
  const statuses = new Map(progress.map(item => [item.courseId, item]));
  const groups = (['接着学', '学完了', '新课'] as const).map(label => ({ label, courses: courses.filter(course => courseGroup(statuses.get(course.id)) === label) }));
  const course = courses.find(item => item.id === selected) ?? groups[0].courses[0] ?? courses[0];
  const status = statuses.get(course.id);
  const group = courseGroup(status);
  const name = courseName(course.title);
  const words = course.cards.filter(card => card.kind === 'word');
  const mastery = new Map(status?.words.map(word => [word.word, word]));
  // Same as the done-page mastery scale: >= 2 stars means learned, not clearedCardIds.
  const learned = words.filter(word => (mastery.get(word.english)?.masteryStars ?? 0) >= 2).length;
  const last = status && status.timesStarted > 0 ? lastPracticeLabel(status.words) : null;
  return <div className="home-layout"><nav className="home-side" aria-label="课程列表">{groups.map(group => <section key={group.label} aria-label={group.label}><h2>{group.label} · {group.courses.length}</h2>{group.courses.map(item => {
    const title = courseName(item.title);
    return <button type="button" key={item.id} className="home-course" aria-label={item.title} aria-pressed={item.id === course.id} onClick={() => { setSelected(item.id); try { localStorage.setItem(selectionKey(learnerId), item.id); } catch { /* Selection remains usable without storage. */ } }}><span><b>{title.zh}</b><small>{title.en}</small></span><ProgressBar label={`${item.title}进度`} value={statuses.get(item.id)?.progressPercent ?? 0} /></button>;
  })}</section>)}</nav><main className="home-detail"><header className="home-hero"><div className="home-heading"><Tag tone={group === '学完了' ? 'mint' : group === '新课' ? 'grey' : 'purple'}>{group === '学完了' ? '已学完' : group}</Tag><h1>{name.zh}<span>{name.en}</span></h1><p>{course.description}</p><div className="home-progress"><ProgressBar label="单词掌握进度" value={words.length ? learned / words.length * 100 : 0} /><span>已会 {learned} 个 · 还剩 {words.length - learned} 个{last && ` · 上次 ${last}`}</span></div></div><div className="home-actions"><Button size="lg" onClick={() => onCourseStart(course.id)}>{group === '新课' ? '开始上课' : '继续上课'}</Button></div></header><div className="home-wall" aria-label="本课单词">{words.map(word => {
    const result = mastery.get(word.english);
    const stars = result?.masteryStars ?? 0;
    return <article key={word.id} className={`home-word ${!result?.attempts ? 'home-unpracticed' : ''}`}>{stars >= 2 && <span className="home-check" aria-label="已掌握"><Check size={13} strokeWidth={3} aria-hidden="true" /></span>}<Image src={word.imageUrl} alt="" width={512} height={512} draggable={false} /><div className="home-word-label"><b title={word.english}>{word.english}</b><small>{word.chinese}</small></div><div className="home-mastery" aria-label={`${word.english}掌握 ${stars} 星`}>{[0, 1, 2].map(i => <i key={i} className={i < stars ? 'on' : ''} />)}</div></article>;
  })}</div></main></div>;
}
