'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
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
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/learners', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('保存失败，请重试。');
      if (method === 'DELETE' && deleting?.id === readCurrentLearnerId()) saveCurrentLearnerId(null);
      setName('');
      setEditing(null);
      setDeleting(null);
      setConfirmation('');
      await load();
      window.dispatchEvent(new Event('eduagent:profiles-change'));
    } catch (err) {
      console.error('[learners] settings write failed', { message: err instanceof Error ? err.message : 'unknown' });
      setError(err instanceof Error ? err.message : '保存失败，请重试。');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-section" aria-label="孩子档案">
      <h1>孩子档案</h1>
      <p className="settings-lead">每个孩子的学习进度分开保存在这台电脑上。</p>
      {error && (
        <p role="alert">
          {error}
          {' '}
          <button type="button" onClick={() => { void load(); }}>重试</button>
        </p>
      )}
      {!learners && <p>正在读取档案…</p>}
      {learners && learners.length === 0 && <p>还没有孩子档案，先建第一个吧。</p>}
      {learners && learners.length > 0 && (
        <ul className="settings-list">
          {learners.map((learner) => (
            <li key={learner.id} className="settings-learner">
              <span>{learner.name}</span>
              <div className="settings-row">
                <Button
                  variant="glass"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setEditing(learner);
                    setName(learner.name);
                    setDeleting(null);
                  }}
                >
                  改名
                </Button>
                <Button
                  variant="glass"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setDeleting(learner);
                    setConfirmation('');
                    setEditing(null);
                    setName('');
                  }}
                >
                  删除
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {deleting ? (
        <div role="group" aria-label="确认删除" className="ui-glass settings-confirm">
          <p>删除「{deleting.name}」及其全部学习记录。此操作无法恢复。</p>
          <label htmlFor="delete-learner-name">输入孩子名字确认删除</label>
          <input
            id="delete-learner-name"
            className="settings-input"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={busy}
          />
          <div className="settings-row">
            <Button
              size="sm"
              disabled={busy || confirmation !== deleting.name}
              onClick={() => { void write('DELETE', { id: deleting.id }); }}
            >
              确认删除
            </Button>
            <Button
              variant="glass"
              size="sm"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) {
              void write(editing ? 'PATCH' : 'POST', {
                ...(editing ? { id: editing.id } : {}),
                name: name.trim(),
              });
            }
          }}
        >
          <label htmlFor="learner-name">
            {editing ? '新名字' : '孩子名字'}
            <input
              id="learner-name"
              className="settings-input"
              maxLength={80}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <Button
            type="button"
            size="sm"
            disabled={busy || !name.trim()}
            onClick={() => {
              if (name.trim()) {
                void write(editing ? 'PATCH' : 'POST', {
                  ...(editing ? { id: editing.id } : {}),
                  name: name.trim(),
                });
              }
            }}
          >
            {editing ? '保存名字' : '新建孩子档案'}
          </Button>
          {editing && (
            <Button
              variant="glass"
              size="sm"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setName('');
              }}
            >
              取消
            </Button>
          )}
        </form>
      )}
    </section>
  );
}
