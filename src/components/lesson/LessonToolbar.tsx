'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, UserRound } from 'lucide-react';
import type { Course, PhaseName } from '@/types/course';
import { loadLearners } from '@/lib/current-learner';
import { Button } from '@/components/ui/Button';

interface LessonToolbarProps { course: Course; learnerId: string; phase: PhaseName; cleared: number; quizIndex: number; onLeave: () => void }
export function LessonToolbar({ course, learnerId, phase, cleared, quizIndex, onLeave }: LessonToolbarProps) {
  const [name, setName] = useState('');
  useEffect(() => { let active = true; void loadLearners().then(items => { if (active) setName(items.find(item => item.id === learnerId)?.name || ''); }).catch(() => {}); return () => { active = false; }; }, [learnerId]);
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onLeave(); }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, [onLeave]);
  const total = phase === 'reinforcement' ? course.phases.reinforcement.quizzes.length : course.cards.filter(card => card.kind === 'word').length;
  const current = phase === 'reinforcement' ? quizIndex : Math.min(cleared, total - 1);
  const completed = phase === 'intro' ? 0 : phase === 'done' ? total : phase === 'reinforcement' ? quizIndex : cleared;
  const label = phase === 'intro' ? '预告' : phase === 'done' ? '下课' : `${phase === 'reinforcement' ? '巩固 ' : ''}${current + 1} / ${total}`;
  return <header className="shell-toolbar p2-toolbar"><Button variant="glass" size="sm" onClick={onLeave}><ArrowLeft size={14} aria-hidden="true" />下课</Button><div className="p2-progress"><h1>{course.title} · {label}</h1><div className="p2-dots" aria-label={`已完成 ${completed} / ${total}`}>{Array.from({ length: total }, (_, i) => <i key={i} className={i < completed ? 'p2-complete' : phase !== 'intro' && phase !== 'done' && i === current ? 'p2-current' : ''} />)}</div></div><div className="p2-who" aria-label={name || '当前孩子'}><span className="shell-avatar">{name.slice(0, 1) || <UserRound size={16} />}</span>{name}</div></header>;
}
