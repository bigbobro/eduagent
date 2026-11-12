'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { isWordBattleOn, setWordBattleOn } from '@/lib/word-battle-pref';
import { isSpeakerModeOn, setSpeakerModeOn } from '@/lib/speaker-mode-pref';
import { SettingsField, SettingsNotice } from './SettingsField';
import type { SettingsDraft } from './useSettingsDraft';

export function RealtimeSettingsPanel({ draft }: { draft: SettingsDraft }) {
  const disabled = draft.readOnly || draft.phase !== 'idle';
  // Browser-local preference: no save, no restart; the next lesson reads it.
  const [battle, setBattle] = useState(true);
  const [speaker, setSpeaker] = useState(true);
  useEffect(() => { setBattle(isWordBattleOn()); setSpeaker(isSpeakerModeOn()); }, []);
  return <div className="settings-panel">
    <h1>Realtime 实验课堂</h1>
    <p className="settings-lead">孩子的语音直接发送到 OpenAI，由同一个模型理解、判断和发声。只需 OpenAI 配置；原有课堂和豆包设置保留。上课前选择模式，整堂课固定。</p>
    <SettingsNotice info={draft.info ? { ...draft.info, configured: draft.info.realtimeConfigured ?? false } : null} loadError={draft.loadError} readOnly={draft.readOnly} />
    {draft.info && <section className="settings-card" aria-label="OpenAI Realtime">
      <SettingsField label="OpenAI API Key" secret value={draft.realtime.apiKey} masked={draft.info.values.openaiApiKey} disabled={disabled} onChange={(apiKey) => draft.setRealtime({ apiKey })} />
      <SettingsField label="Realtime 模型" hint="开发模式对应 OPENAI_REALTIME_MODEL" secret={false} value={draft.realtime.model} disabled={disabled} onChange={(model) => draft.setRealtime({ model })} />
      <label className="settings-toggle" data-testid="turn-mode-toggle">
        <input type="checkbox" checked={draft.realtime.turnMode === 'manual'} disabled={disabled} onChange={(event) => draft.setRealtime({ turnMode: event.target.checked ? 'manual' : 'auto' })} />
        <span>
          <strong>实验：示范时跟读不打断老师</strong>
          <small>孩子小声跟读不会打断老师示范，说话持续一会儿老师才停下。实验功能，效果不好可随时关闭。保存后下一节课生效。</small>
        </span>
      </label>
      {draft.info.realtimeTurnMode !== undefined && draft.info.realtimeTurnMode !== draft.realtime.turnMode && <p role="note" data-testid="turn-mode-override">当前被环境变量 REALTIME_TURN_MODE 覆盖为「{draft.info.realtimeTurnMode === 'manual' ? '开' : '关'}」。</p>}
      {draft.readOnly && <p>在 .env.local 中填写 OPENAI_API_KEY 和 OPENAI_REALTIME_MODEL 后重启；实验开关用 REALTIME_TURN_MODE=manual。</p>}
      <p>输入文字记录来自模型自述，不是独立语音转写。订阅与 API credits 的实际抵扣以 OpenAI 账单为准。</p>
      <Button disabled={draft.phase !== 'idle' || draft.testing !== null} onClick={() => void draft.runTest({ scope: 'realtime' })}>{draft.testing === 'realtime' ? '连接中…' : '测试 Realtime 连接'}</Button>
      {draft.report?.realtime && <p role="status">{draft.report.realtime.reason}</p>}
      {draft.error && <p role="alert">{draft.error}</p>}
      {!draft.readOnly && <Button disabled={disabled} onClick={() => void draft.save()}>{draft.phase === 'idle' ? '保存' : '保存并重启中…'}</Button>}
    </section>}
    <section className="settings-card" aria-label="单词大战">
      <label className="settings-toggle" data-testid="word-battle-toggle">
        <input type="checkbox" checked={battle} onChange={(event) => { setBattle(event.target.checked); setWordBattleOn(event.target.checked); }} />
        <span>
          <strong>单词大战</strong>
          <small>Realtime 课堂学单词时变成打怪：说对英语就是念对咒语，救回被抢走的词卡。关掉后课堂和原来一样。下一节课生效，不用保存。</small>
        </span>
      </label>
      <label className="settings-toggle" data-testid="speaker-mode-toggle">
        <input type="checkbox" checked={speaker} onChange={(event) => { setSpeaker(event.target.checked); setSpeakerModeOn(event.target.checked); }} />
        <span>
          <strong>外放模式：老师说话时不收音</strong>
          <small>用音箱外放时打开（默认开）。老师说话期间麦克风暂停收音，避免老师自己的声音被当成孩子说话而打断自己；孩子要等老师说完再说。戴耳机时可以关掉，关掉后孩子可以随时插话。下一节课生效。</small>
        </span>
      </label>
    </section>
  </div>;
}
