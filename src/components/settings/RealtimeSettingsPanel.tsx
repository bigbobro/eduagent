'use client';
import { Button } from '@/components/ui/Button';
import { SettingsField, SettingsNotice } from './SettingsField';
import type { SettingsDraft } from './useSettingsDraft';

export function RealtimeSettingsPanel({ draft }: { draft: SettingsDraft }) {
  const disabled = draft.readOnly || draft.phase !== 'idle';
  return <div className="settings-panel">
    <h1>Realtime 实验课堂</h1>
    <p className="settings-lead">孩子的语音直接发送到 OpenAI，由同一个模型理解、判断和发声。只需 OpenAI 配置；原有课堂和豆包设置保留。上课前选择模式，整堂课固定。</p>
    <SettingsNotice info={draft.info ? { ...draft.info, configured: draft.info.realtimeConfigured ?? false } : null} loadError={draft.loadError} readOnly={draft.readOnly} />
    {draft.info && <section className="settings-card" aria-label="OpenAI Realtime">
      <SettingsField label="OpenAI API Key" secret value={draft.realtime.apiKey} masked={draft.info.values.openaiApiKey} disabled={disabled} onChange={(apiKey) => draft.setRealtime({ apiKey })} />
      <SettingsField label="Realtime 模型" hint="开发模式对应 OPENAI_REALTIME_MODEL" secret={false} value={draft.realtime.model} disabled={disabled} onChange={(model) => draft.setRealtime({ model })} />
      {draft.readOnly && <p>在 .env.local 中填写 OPENAI_API_KEY 和 OPENAI_REALTIME_MODEL 后重启。</p>}
      <p>输入文字记录来自模型自述，不是独立语音转写。订阅与 API credits 的实际抵扣以 OpenAI 账单为准。</p>
      <Button disabled={draft.phase !== 'idle' || draft.testing !== null} onClick={() => void draft.runTest({ scope: 'realtime' })}>{draft.testing === 'realtime' ? '连接中…' : '测试 Realtime 连接'}</Button>
      {draft.report?.realtime && <p role="status">{draft.report.realtime.reason}</p>}
      {draft.error && <p role="alert">{draft.error}</p>}
      {!draft.readOnly && <Button disabled={disabled} onClick={() => void draft.save()}>{draft.phase === 'idle' ? '保存' : '保存并重启中…'}</Button>}
    </section>}
  </div>;
}
