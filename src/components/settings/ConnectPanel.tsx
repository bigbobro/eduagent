'use client';

import { useState } from 'react';
import { LLM_PROVIDERS, withProvider } from '@/lib/llm-providers';
import { Button } from '@/components/ui/Button';
import { SettingsField, SettingsNotice } from './SettingsField';
import { ProviderCards } from './TeacherSection';
import { DoubaoConsoleLink, VoiceAuthFields } from './VoiceAuthFields';
import type { CheckResult, SettingsDraft, TestReport } from './useSettingsDraft';

const STATUS: { key: keyof TestReport; label: string }[] = [
  { key: 'llm', label: 'AI 老师' },
  { key: 'asr', label: '听写' },
  { key: 'tts', label: '发音' },
];

export function ConnectPanel({
  draft,
  onSkip,
}: {
  draft: SettingsDraft;
  onSkip?: () => void;
}) {
  const [addressOpen, setAddressOpen] = useState(false);
  const channel = draft.channels[0];
  const busy = draft.phase !== 'idle';
  const disabled = draft.readOnly || busy;
  const preset = channel ? LLM_PROVIDERS[channel.provider] : null;
  const saveLabel = draft.phase === 'saving' ? '保存中…' : draft.phase === 'restarting' ? '正在重启…' : '保存并继续';

  return (
    <div className="settings-panel">
      <p className="settings-lead">
        Key 只保存在这台电脑上。上课时孩子的语音会发送到豆包识别。改完先点「测试连接」。
      </p>
      <SettingsNotice
        info={draft.info}
        loadError={draft.loadError}
        readOnly={draft.readOnly}
      />
      {draft.info?.mock && <p>演示模式不需要填写 Key。这一步已经完成。</p>}
      {draft.info && !draft.info.mock && channel && preset && (
        <>
          <fieldset
            className="settings-card"
            aria-label="AI 老师"
          >
            <legend>AI 老师</legend>
            <ProviderCards
              provider={channel.provider}
              disabled={disabled}
              onSelect={(provider) => draft.setChannel(channel.id, withProvider(channel, provider))}
            />
            <SettingsField
              label="API Key"
              secret
              value={channel.apiKey}
              masked={draft.maskedKeys[channel.id]}
              disabled={disabled}
              onChange={(apiKey) => draft.setChannel(channel.id, { apiKey })}
            />
            <SettingsField
              label="模型"
              hint={preset.modelHint || undefined}
              secret={false}
              value={channel.model}
              disabled={disabled}
              onChange={(model) => draft.setChannel(channel.id, { model })}
            />
            <button
              type="button"
              className="settings-advanced"
              aria-expanded={addressOpen}
              onClick={() => setAddressOpen((open) => !open)}
            >
              <span>{addressOpen ? '收起服务地址' : '修改服务地址'}</span>
            </button>
            {addressOpen && (
              <SettingsField
                label="服务地址"
                secret={false}
                value={channel.baseUrl}
                disabled={disabled}
                onChange={(baseUrl) => draft.setChannel(channel.id, { baseUrl })}
              />
            )}
            <p className="settings-lead">
              {preset.keyHint}
              {preset.keyUrl && (
                <>
                  {' '}
                  <a
                    href={preset.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开密钥页面
                  </a>
                </>
              )}
            </p>
          </fieldset>
          <fieldset
            className="settings-card"
            aria-label="豆包语音"
          >
            <legend>豆包语音</legend>
            <VoiceAuthFields
              draft={draft}
              disabled={disabled}
            />
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
          </fieldset>
        </>
      )}
      {draft.error && <p role="alert">{draft.error}</p>}
      {draft.phase === 'restarting' && (
        <p role="status">正在重启…保存成功,窗口马上刷新。</p>
      )}
      <div className={onSkip ? 'settings-actions onboarding-actions' : 'settings-actions'}>
        {onSkip && (
          <Button
            variant="glass"
            size="lg"
            onClick={onSkip}
          >
            以后再说
          </Button>
        )}
        <DoubaoConsoleLink large />
        <span className="settings-spacer" />
        {!draft.readOnly && draft.info && !draft.info.mock && (
          <>
            <Button
              variant="glass"
              size="lg"
              onClick={() => { void draft.runTest({ scope: 'all', channelId: channel?.id }); }}
              disabled={draft.testing !== null || busy}
            >
              {draft.testing === 'all' ? '测试中…' : '测试连接'}
            </Button>
            <Button
              size="lg"
              onClick={() => { void draft.save({ resumeMicrophone: true }); }}
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
  const text = !result ? '未测试' : result.ok ? (result.reason.startsWith('正常') ? result.reason : '正常') : result.reason;
  return (
    <span
      className={`ui-tag ${tone}`}
      data-testid={`result-${label}`}
    >
      {label} {text}
    </span>
  );
}
