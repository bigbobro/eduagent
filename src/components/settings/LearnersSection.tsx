'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { loadLearners, readCurrentLearnerId, saveCurrentLearnerId, type LearnerProfile } from '@/lib/current-learner';

const AVATAR_COLORS = ['#6842FF', '#FF9F2E', '#2DD4BF', '#94A3B8'];

function avatarColor(name: string) {
  const code = name.codePointAt(0) ?? 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export function LearnersSection() {
  const [learners, setLearners] = useState<LearnerProfile[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<LearnerProfile | null>(null);
  const [nextName, setNextName] = useState('');
  const [deleting, setDeleting] = useState<LearnerProfile | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = () => loadLearners().then((items) => {
    setLearners(items);
    setCurrentId(readCurrentLearnerId());
  }).catch(() => setError('暂时读不到孩子档案，请重试。'));
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
      setNextName('');
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
  const saveRename = () => {
    if (!editing || !nextName.trim()) return;
    void write('PATCH', { id: editing.id, name: nextName.trim() });
  };
  return (
    <section
      className="settings-section"
      aria-label="孩子档案"
    >
      <h1>孩子档案</h1>
      <p className="settings-lead">每个孩子的学习进度分开保存在这台电脑上。</p>
      {error && (
        <p role="alert">
          {error}
          {' '}
          <button
            type="button"
            onClick={() => { void load(); }}
          >
            重试
          </button>
        </p>
      )}
      <div className="settings-card learners-card">
        {!learners && <p>正在读取档案…</p>}
        {learners && learners.length === 0 && <p>还没有孩子档案，先建第一个吧。</p>}
        {learners && learners.length > 0 && (
          <ul className="settings-list">
            {learners.map((learner) => (
              <li
                key={learner.id}
                className="settings-learner"
              >
                <span
                  className="learner-avatar"
                  style={{ background: avatarColor(learner.name) }}
                  aria-hidden="true"
                >
                  {Array.from(learner.name)[0]}
                </span>
                {editing?.id === learner.id ? (
                  <form
                    className="learner-rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveRename();
                    }}
                  >
                    <label htmlFor={`rename-${learner.id}`}>
                      新名字
                      <input
                        id={`rename-${learner.id}`}
                        className="settings-input"
                        maxLength={80}
                        value={nextName}
                        disabled={busy}
                        onChange={(event) => setNextName(event.target.value)}
                      />
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy || !nextName.trim()}
                      onClick={saveRename}
                    >
                      保存名字
                    </Button>
                    <Button
                      variant="plain"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setEditing(null);
                        setNextName('');
                      }}
                    >
                      取消
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="learner-name">{learner.name}</span>
                    {learner.id === currentId && (
                      <Tag tone="mint">当前</Tag>
                    )}
                    <div className="learner-actions">
                      <Button
                        variant="plain"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setEditing(learner);
                          setNextName(learner.name);
                          setDeleting(null);
                          setConfirmation('');
                        }}
                      >
                        改名
                      </Button>
                      <Button
                        variant="plain"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setDeleting(learner);
                          setConfirmation('');
                          setEditing(null);
                          setNextName('');
                        }}
                      >
                        删除
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {deleting && (
          <div
            role="group"
            aria-label="确认删除"
            className="settings-confirm"
          >
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
                variant="plain"
                size="sm"
                disabled={busy}
                onClick={() => setDeleting(null)}
              >
                取消
              </Button>
            </div>
          </div>
        )}
        <form
          className="learners-create"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) void write('POST', { name: name.trim() });
          }}
        >
          <label htmlFor="learner-name">
            孩子名字
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
              if (name.trim()) void write('POST', { name: name.trim() });
            }}
          >
            新建孩子档案
          </Button>
        </form>
      </div>
    </section>
  );
}
