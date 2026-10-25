'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { CheckResult, FieldKey, SettingsDraft, TestReport } from './useSettingsDraft';

const REQUIRED: { key: FieldKey; label: string; hint?: string; secret: boolean }[] = [
  { key: 'llmApiKey', label: 'API Key', hint: '在 SiliconFlow「API 密钥」页面复制', secret: true },
  { key: 'doubaoAppId', label: 'App ID', secret: true },
  { key: 'doubaoAccessKey', label: 'Access Key', secret: true },
];

const MODEL: { key: FieldKey; label: string; hint?: string; secret: boolean }[] = [
  REQUIRED[0],
  { key: 'llmBaseUrl', label: '服务地址', secret: false },
  { key: 'llmModel', label: '模型', secret: false },
];

const VOICE: { key: FieldKey; label: string; secret: boolean }[] = [
  REQUIRED[1],
  REQUIRED[2],
];

const ONBOARDING_FIELDS: { key: FieldKey; label: string; hint?: string; secret: boolean }[] = [
  REQUIRED[0],
  { key: 'llmBaseUrl', label: '服务地址', secret: false },
  REQUIRED[1],
  REQUIRED[2],
];

const ADVANCED: { key: FieldKey; label: string; hint?: string; secret: boolean }[] = [
  { key: 'doubaoAsrResourceId', label: 'ASR Resource ID', hint: '语音识别资源', secret: false },
  { key: 'doubaoTtsResourceId', label: 'TTS Resource ID', hint: '语音合成资源', secret: false },
  { key: 'doubaoTtsSpeaker', label: '音色', hint: '老师的声音编号,留空使用默认', secret: false },
];

const STATUS: { key: keyof TestReport; label: string }[] = [
  { key: 'llm', label: 'AI 老师' },
  { key: 'asr', label: '听写' },
  { key: 'tts', label: '发音' },
];

export function VoiceSettingsPanel({
  draft,
  variant,
}: {
  draft: SettingsDraft;
  variant: 'settings' | 'onboarding';
}) {
  const [advanced, setAdvanced] = useState(false);
  const busy = draft.phase !== 'idle';
  const disabled = draft.readOnly || busy;
  const saveLabel = draft.phase === 'saving'
    ? '保存中…'
    : draft.phase === 'restarting'
      ? '正在重启…'
      : variant === 'onboarding' ? '保存并继续' : '保存';

  return (
    <div className="settings-panel">
      {variant === 'settings' && <h1>AI 老师与语音</h1>}
      <p className="settings-lead">
        Key 只保存在这台电脑上。上课时孩子的语音会发送到豆包识别。改完先点「测试连接」。
      </p>
      {draft.info && (
        <p data-testid="config-status" className={`ui-tag ${draft.info.configured ? 'ui-tag-mint' : 'ui-tag-amber'}`}>
          {draft.info.mock ? '演示模式(无需 Key)' : draft.info.configured ? '已配置' : '还没有配置 Key'}
        </p>
      )}
      {draft.readOnly && (
        <div className="settings-note ui-tag-amber" data-testid="readonly-hint" style={{ background: 'rgba(255,159,46,.14)' }}>
          开发模式:这里只显示当前状态。请修改项目里的 <code>.env.local</code> 后重启 server。
        </div>
      )}
      {draft.loadError && <p role="alert">暂时读不到设置,请刷新重试。</p>}
      {!draft.info && !draft.loadError && <p role="status">正在读取设置…</p>}
      {draft.info && variant === 'onboarding' && draft.info.mock && (
        <p>演示模式不需要填写 Key。这一步已经完成。</p>
      )}
      {draft.info && !(variant === 'onboarding' && draft.info.mock) && (
        <section className="settings-card" aria-label="AI 老师与语音">
          {variant === 'settings' ? (
            <>
              <h2>大模型</h2>
              {MODEL.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  secret={field.secret}
                  value={draft.form[field.key]}
                  masked={draft.masked[field.key]}
                  disabled={disabled}
                  onChange={(value) => draft.set(field.key, value)}
                />
              ))}
              <h2>豆包语音</h2>
              {VOICE.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  secret={field.secret}
                  value={draft.form[field.key]}
                  masked={draft.masked[field.key]}
                  disabled={disabled}
                  onChange={(value) => draft.set(field.key, value)}
                />
              ))}
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
                <Field
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  secret={field.secret}
                  value={draft.form[field.key]}
                  masked={draft.masked[field.key]}
                  disabled={disabled}
                  onChange={(value) => draft.set(field.key, value)}
                />
              ))}
            </>
          ) : (
            ONBOARDING_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                hint={field.hint}
                secret={field.secret}
                value={draft.form[field.key]}
                masked={draft.masked[field.key]}
                disabled={disabled}
                onChange={(value) => draft.set(field.key, value)}
              />
            ))
          )}
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
      {draft.error && <p role="alert">{draft.error}</p>}
      {draft.phase === 'restarting' && (
        <p role="status">正在重启…保存成功,窗口马上刷新。</p>
      )}
      <div className="settings-actions">
        <a
          className="ui-button ui-button-glass"
          href="https://console.volcengine.com/speech/app"
          target="_blank"
          rel="noreferrer"
          aria-label="打开火山引擎豆包语音控制台"
        >
          打开豆包语音控制台
        </a>
        <span className="settings-spacer" />
        {!draft.readOnly && draft.info && !(variant === 'onboarding' && draft.info.mock) && (
          <>
            <Button
              variant="glass"
              onClick={() => { void draft.runTest(); }}
              disabled={draft.testing || busy}
            >
              {draft.testing ? '测试中…' : '测试连接'}
            </Button>
            <Button
              onClick={() => { void draft.save({ resumeMicrophone: variant === 'onboarding' }); }}
              disabled={draft.testing || busy}
            >
              {saveLabel}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  secret,
  value,
  masked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  secret: boolean;
  value: string;
  masked?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `field-${label.replace(/\s+/g, '-')}`;
  const placeholder = secret ? (masked ? `已保存 ${masked},留空保持不变` : '尚未填写') : '';
  return (
    <div className="settings-field">
      <label htmlFor={id}>
        {label}
        {hint && <small>{hint}</small>}
      </label>
      <input
        id={id}
        className="settings-input"
        type={secret ? 'password' : 'text'}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function StatusTag({ label, result }: { label: string; result?: CheckResult }) {
  const tone = !result ? 'ui-tag-grey' : result.ok ? 'ui-tag-mint' : 'ui-tag-amber';
  const text = !result ? '未测试' : result.ok ? '正常' : result.reason;
  return (
    <span className={`ui-tag ${tone}`} data-testid={`result-${label}`}>
      {label} {text}
    </span>
  );
}
