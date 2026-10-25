'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SettingsField, SettingsNotice } from './SettingsField';
import { DoubaoConsoleLink, VoiceAuthFields } from './VoiceAuthFields';
import type { CheckResult, SettingsDraft, TestReport, VoiceField } from './useSettingsDraft';

const ADVANCED: { key: VoiceField; label: string; hint?: string; secret: boolean }[] = [
  { key: 'doubaoAsrResourceId', label: 'ASR Resource ID', hint: '语音识别资源', secret: false },
  { key: 'doubaoTtsResourceId', label: 'TTS Resource ID', hint: '语音合成资源', secret: false },
  { key: 'doubaoTtsSpeaker', label: '音色', hint: '老师的声音编号,留空使用默认', secret: false },
];

const STATUS: { key: keyof TestReport; label: string }[] = [
  { key: 'asr', label: '听写' },
  { key: 'tts', label: '发音' },
];

export function VoiceSettingsPanel({ draft }: { draft: SettingsDraft }) {
  const [advanced, setAdvanced] = useState(false);
  const busy = draft.phase !== 'idle';
  const disabled = draft.readOnly || busy;
  const saveLabel = draft.phase === 'saving' ? '保存中…' : draft.phase === 'restarting' ? '正在重启…' : '保存';

  return (
    <div className="settings-panel">
      <h1>语音</h1>
      <p className="settings-lead">
        上课时孩子的语音会发送到豆包识别。Key 只保存在这台电脑上。改完先点「测试连接」。
      </p>
      <SettingsNotice
        info={draft.info}
        loadError={draft.loadError}
        readOnly={draft.readOnly}
      />
      {draft.info && !(draft.info.mock) && (
        <section
          className="settings-card"
          aria-label="豆包语音"
        >
          <VoiceAuthFields
            draft={draft}
            disabled={disabled}
          />
          <button
            type="button"
            className="settings-advanced"
            aria-expanded={advanced}
            onClick={() => setAdvanced((open) => !open)}
          >
            <span>高级:资源 ID、老师音色</span>
            {advanced
              ? <ChevronDown size={16} aria-hidden="true" />
              : <ChevronRight size={16} aria-hidden="true" />}
          </button>
          {advanced && ADVANCED.map((field) => (
            <SettingsField
              key={field.key}
              label={field.label}
              hint={field.hint}
              secret={field.secret}
              value={draft.voice[field.key]}
              disabled={disabled}
              onChange={(value) => draft.setVoice(field.key, value)}
            />
          ))}
          <div className="settings-status">
            <span>连接状态</span>
            <div className="settings-chips">
              {STATUS.map((item) => (
                <StatusTag
                  key={item.key}
                  label={item.label}
                  result={draft.report?.[item.key]}
                />
              ))}
            </div>
          </div>
        </section>
      )}
      {draft.info?.mock && <p>演示模式不需要填写 Key。</p>}
      {draft.error && <p role="alert">{draft.error}</p>}
      {draft.phase === 'restarting' && (
        <p role="status">正在重启…保存成功,窗口马上刷新。</p>
      )}
      <div className="settings-actions">
        <DoubaoConsoleLink />
        <span className="settings-spacer" />
        {!draft.readOnly && draft.info && !draft.info.mock && (
          <>
            <Button
              variant="glass"
              onClick={() => { void draft.runTest({ scope: 'voice' }); }}
              disabled={draft.testing !== null || busy}
            >
              {draft.testing === 'voice' ? '测试中…' : '测试连接'}
            </Button>
            <Button
              onClick={() => { void draft.save(); }}
              disabled={draft.testing !== null || busy}
            >
              {saveLabel}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function StatusTag({ label, result }: { label: string; result?: CheckResult }) {
  const tone = !result ? 'ui-tag-grey' : result.ok ? 'ui-tag-mint' : 'ui-tag-amber';
  const text = !result ? '未测试' : result.ok ? '正常' : result.reason;
  return (
    <span
      className={`ui-tag ${tone}`}
      data-testid={`result-${label}`}
    >
      {label} {text}
    </span>
  );
}
