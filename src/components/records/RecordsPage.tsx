'use client';
import { useState } from 'react';
import Image from 'next/image';
import maji from '../../../desktop/build-resources/icon-source.png';
import type { ProgressSnapshot, SessionSummary, StatsSnapshot } from '@/types/progress';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { WordMastery } from './WordMastery';
import './records.css';
interface Props { name: string; progress: ProgressSnapshot | null; stats: StatsSnapshot | null; sessions: SessionSummary[] | null; error?: boolean; onRetry: () => void; onStart: () => void }
export function RecordsPage({ name, progress, stats, sessions, error, onRetry, onStart }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (error) return <div className="records-state"><EmptyState title="暂时读不到学习记录" action={<Button onClick={onRetry}>重试</Button>} /></div>;
  if (!progress || !stats || !sessions) return <div className="records-loading">{[0,1,2,3].map(i => <Skeleton key={i} label="正在读取学习记录" />)}</div>;
  if (!stats.totalSessions) return <div className="records-state"><EmptyState title="上完第一节课,这里就会有记录" action={<Button onClick={onStart}>去上课</Button>} illustration={<Image src={maji} alt="麻吉" width={132} height={132} />} /></div>;
  const recent = new Map<string, number>();
  sessions.forEach(s => recent.set(s.courseId, Math.max(recent.get(s.courseId) ?? 0, Date.parse(s.startTime))));
  const courses = progress.courses.filter(c => c.timesStarted > 0).sort((a,b) => {
    const latest = (c: typeof a) => Math.max(recent.get(c.courseId) ?? 0, ...c.words.map(w => w.lastPracticed ? Date.parse(w.lastPracticed) || 0 : 0));
    return latest(b) - latest(a);
  });
  const words = progress.courses.flatMap(c => c.words);
  const practice = words.filter(w => w.attempts > 0 && w.masteryStars <= 1).slice(0,5);
  const days = stats.lastDays ?? stats.last7Days;
  const months = Array.from(new Set(days.map(d => Number(d.date.slice(5,7)))));
  return <main className="records-page"><h1>{name}的学习记录<small>上过 {stats.totalSessions} 节课 · 共 {Math.floor(stats.totalMinutes / 60)} 小时 {stats.totalMinutes % 60} 分钟</small></h1>
    <section className="records-panel"><h2>最近 13 周<small>颜色越深,那天学得越久</small></h2><div className="records-heat">{days.map(d => <i key={d.date} title={`${d.date} ${d.minutes} 分钟`} aria-label={`${d.date} ${d.minutes} 分钟`} style={{ background: d.minutes >= 20 ? 'rgba(104,66,255,.85)' : d.minutes >= 10 ? 'rgba(104,66,255,.5)' : d.minutes > 0 ? 'rgba(104,66,255,.22)' : undefined }} />)}</div><div className="records-months">{months.map(m => <span key={m}>{m} 月</span>)}</div></section>
    <section className="records-panel"><h2>各课程掌握情况<small>按最近上课排序</small></h2><div className="records-bars">{courses.map(c => { const n = c.words.filter(w => w.masteryStars >= 2).length; return <div key={c.courseId} className="records-course"><button aria-expanded={expanded === c.courseId} onClick={() => setExpanded(expanded === c.courseId ? null : c.courseId)}><span>{c.courseTitle.split(/\s+[A-Za-z]/)[0]}</span><ProgressBar value={n / c.totalWords * 100} label={`${c.courseTitle}掌握情况`} /><span>{n}/{c.totalWords}</span></button>{expanded === c.courseId && <div className="records-wall" aria-label={`${c.courseTitle}逐词掌握`}>{c.words.map(w => <WordMastery key={w.word} word={w} />)}</div>}</div>; })}</div></section>
    <section className="records-panel"><div className="records-stats">{[[words.filter(w => w.masteryStars >= 2).length, '个', '会说的单词'], [stats.totalSessions,'节','上过的课'], [stats.last7Days.reduce((s,d) => s+d.minutes,0),'分钟','最近 7 天']].map(([n,u,l]) => <div key={l}><b>{n}<small>{u}</small></b><span>{l}</span></div>)}</div><h2>最近几节课</h2><div className="records-sessions">{sessions.slice(0,4).map(s => { const d = new Date(s.startTime); return <div key={s.lessonId}><span>{d.getMonth()+1}/{d.getDate()} {d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}</span><span>{s.courseTitle}</span><span>{Math.round(s.durationMs / 60000)} 分钟</span><span>{s.wordsMastered} 个词</span></div>; })}</div></section>
    <section className="records-panel"><h2>需要多练的词<small>练过但还没掌握</small></h2>{practice.length ? <div className="records-practice">{practice.map((w,i) => <div key={`${w.word}-${i}`}>{w.imageUrl && <Image src={w.imageUrl} width={160} height={160} alt="" />}<b title={w.word}>{w.word}</b><small>{w.zh}</small></div>)}</div> : <p>暂无需要多练的词</p>}</section>
  </main>;
}
