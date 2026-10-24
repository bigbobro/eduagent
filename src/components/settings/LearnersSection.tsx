'use client';
import { useEffect, useState } from 'react';
import { PaperButton } from '@/components/magic';
import { loadLearners, readCurrentLearnerId, saveCurrentLearnerId, type LearnerProfile } from '@/lib/current-learner';

export function LearnersSection() {
  const [learners, setLearners] = useState<LearnerProfile[] | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<LearnerProfile | null>(null);
  const [deleting, setDeleting] = useState<LearnerProfile | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = () => loadLearners().then(setLearners).catch(() => setError('暂时读不到孩子档案，请重试。'));
  useEffect(() => { void load(); }, []);
  const write = async (method: string, body: object) => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/learners', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('保存失败，请重试。');
      if (method === 'DELETE' && deleting?.id === readCurrentLearnerId()) saveCurrentLearnerId(null);
      setName(''); setEditing(null); setDeleting(null); setConfirmation('');
      await load();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };
  const inputClass = 'rounded-paper-md border-2 border-ink bg-paperDeep px-3 py-2 font-zh text-sm';
  return (
    <section className="rounded-paper-lg border-2 border-ink bg-paper p-5 shadow-paper" aria-label="孩子档案">
      <h2 className="font-display text-[24px]">孩子档案</h2>
      <p className="my-3 font-zh text-sm text-inkSoft">每个孩子的学习进度分开保存在这台电脑上。</p>
      {error && <p role="alert" className="mb-3 text-ember">{error} <button onClick={load}>重试</button></p>}
      {!learners ? <p>正在读取档案…</p> : learners.length === 0 ? <p className="mb-3 font-zh">还没有孩子档案，先建第一个吧。</p> : <ul className="mb-4 grid gap-3">{learners.map((learner) => (
        <li key={learner.id} className="flex items-center justify-between gap-4 border-b border-dashed border-inkPale pb-3 font-zh">
          <span>{learner.name}</span><div className="flex gap-3">
            <PaperButton size="sm" color="paper" disabled={busy} onClick={() => { setEditing(learner); setName(learner.name); setDeleting(null); }}>改名</PaperButton>
            <PaperButton size="sm" color="peach" disabled={busy} onClick={() => { setDeleting(learner); setConfirmation(''); setEditing(null); setName(''); }}>删除</PaperButton>
          </div>
        </li>
      ))}</ul>}
      {deleting ? <div role="group" aria-label="确认删除" className="grid gap-3 rounded-paper-md bg-peach p-4 font-zh">
        <p>删除「{deleting.name}」及其全部学习记录。此操作无法恢复。</p>
        <label htmlFor="delete-learner-name">输入孩子名字确认删除</label>
        <input id="delete-learner-name" className={inputClass} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={busy} />
        <div className="flex gap-3"><PaperButton size="sm" color="peach" disabled={busy || confirmation !== deleting.name} onClick={() => write('DELETE', { id: deleting.id })}>确认删除</PaperButton><PaperButton size="sm" color="paper" disabled={busy} onClick={() => setDeleting(null)}>取消</PaperButton></div>
      </div> : <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void write(editing ? 'PATCH' : 'POST', { ...(editing ? { id: editing.id } : {}), name: name.trim() }); }}>
        <label className="grid gap-2 font-zh text-sm" htmlFor="learner-name">{editing ? '新名字' : '孩子名字'}<input id="learner-name" className={inputClass} maxLength={80} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} /></label>
        <PaperButton size="sm" color="mint" disabled={busy || !name.trim()} onClick={() => { if (name.trim()) void write(editing ? 'PATCH' : 'POST', { ...(editing ? { id: editing.id } : {}), name: name.trim() }); }}>{editing ? '保存名字' : '新建孩子档案'}</PaperButton>
        {editing && <PaperButton size="sm" color="paper" disabled={busy} onClick={() => { setEditing(null); setName(''); }}>取消</PaperButton>}
      </form>}
    </section>
  );
}
