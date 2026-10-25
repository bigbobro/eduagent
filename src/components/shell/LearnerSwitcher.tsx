'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronDown, Plus, UserRound } from 'lucide-react';
import { loadLearners, selectedLearner, saveCurrentLearnerId, type LearnerProfile } from '@/lib/current-learner';
export function LearnerSwitcher() {
  const [learners, setLearners] = useState<LearnerProfile[]>([]);
  const [current, setCurrent] = useState<LearnerProfile>();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    let active = true;
    const load = () => { void loadLearners().then((items) => { if (active) { setLearners(items); setCurrent(selectedLearner(items)); setError(false); } }).catch(() => { if (active) setError(true); }); };
    load();
    for (const event of ['eduagent:learner-change', 'eduagent:profiles-change', 'focus']) window.addEventListener(event, load);
    return () => { active = false; for (const event of ['eduagent:learner-change', 'eduagent:profiles-change', 'focus']) window.removeEventListener(event, load); };
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"], [role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, [open, learners]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div ref={root} className="shell-learner" onKeyDown={(event) => {
    if (event.key === 'Escape') { close(); event.stopPropagation(); }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const buttons = Array.from(root.current!.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <button ref={trigger} className="shell-who" aria-label={`切换孩子：${current?.name ?? '选择孩子'}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}><span className="shell-avatar">{current?.name.slice(0, 1) ?? <UserRound size={16} aria-hidden="true" />}</span><span className="shell-name">{current?.name ?? '选择孩子'}</span><ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" /></button>
    {open && <div className="ui-glass shell-learner-menu" role="menu" aria-label="孩子档案">
      {error && <p role="alert">暂时读不到孩子档案</p>}
      {learners.map((learner) => <button key={learner.id} role="menuitemradio" aria-checked={current?.id === learner.id} onClick={() => { saveCurrentLearnerId(learner.id); setCurrent(learner); close(); }}><span>{learner.name}</span>{current?.id === learner.id && <Check size={16} aria-hidden="true" />}</button>)}
      <button role="menuitem" onClick={() => { close(); router.push('/settings#learner-name'); }}><Plus size={16} aria-hidden="true" />新建孩子档案</button>
    </div>}
  </div>;
}
