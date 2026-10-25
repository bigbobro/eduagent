'use client';
import type { LearnerProfile } from '@/lib/current-learner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import './home.css';

export function LearnerPicker({ learners, error, onSelect, onSettings, onRetry }: { learners: LearnerProfile[]; error: boolean; onSelect: (learner: LearnerProfile) => void; onSettings: () => void; onRetry: () => void }) {
  if (error) return <main className="home-state"><EmptyState title="暂时读不到孩子档案" action={<Button onClick={onRetry}>重试</Button>} /></main>;
  return <main className="home-picker"><h1>{learners.length ? '今天谁来学英语？' : '建第一个孩子档案'}</h1>{learners.length ? <div className="home-children">{learners.map(learner => <button type="button" key={learner.id} className="ui-glass home-child" onClick={() => onSelect(learner)}><span className="home-child-avatar" aria-hidden="true">{learner.name.slice(0, 1)}</span><b>{learner.name}</b></button>)}</div> : <Button size="lg" onClick={onSettings}>建第一个孩子档案</Button>}<Button variant="glass" onClick={onSettings}>设置</Button></main>;
}
