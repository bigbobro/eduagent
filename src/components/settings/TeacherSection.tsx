'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LLM_PROVIDERS, LLM_PROVIDER_IDS, newChannel, withProvider, type LlmChannel, type LlmProviderId } from '@/lib/llm-providers';
import { canDeleteChannel } from '@/lib/settings/channels';
import { Button } from '@/components/ui/Button';
import { SettingsField, SettingsNotice } from './SettingsField';
import type { SettingsDraft } from './useSettingsDraft';

export function TeacherSection({ draft }: { draft: SettingsDraft }) {
  const [editor, setEditor] = useState<LlmChannel | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const busy = draft.phase !== 'idle';
  const disabled = draft.readOnly || busy;

  const saveEditor = () => {
    if (!editor || disabled) return;
    const channels = creating
      ? [...draft.channels, editor]
      : draft.channels.map((channel) => (channel.id === editor.id ? editor : channel));
    void draft.save({ channels, activeLlmChannelId: draft.activeLlmChannelId || editor.id });
  };

  const remove = (id: string) => {
    void draft.save({
      channels: draft.channels.filter((channel) => channel.id !== id),
      activeLlmChannelId: draft.activeLlmChannelId,
    });
  };

  return (
    <div className="settings-panel">
      <h1>AI 老师</h1>
      <p className="settings-lead">
        Key 只保存在这台电脑上。可以准备多个渠道,上课用标成「正在使用」的那一个。切换后服务会重启几秒。
      </p>
      <SettingsNotice
        info={draft.info}
        loadError={draft.loadError}
        readOnly={draft.readOnly}
      />
      {draft.info && (
        <section
          className="settings-card"
          aria-label="渠道列表"
        >
          <ul className="settings-list">
            {draft.channels.map((channel) => {
              const current = channel.id === draft.activeLlmChannelId;
              const deletable = canDeleteChannel(
                { llmChannels: draft.channels, activeLlmChannelId: draft.activeLlmChannelId },
                channel.id,
              );
              const result = draft.channelReports[channel.id];
              return (
                <li
                  key={channel.id}
                  className="channel-row"
                >
                  <div className="channel-copy">
                    <strong>{channel.name}</strong>
                    <span className="ui-tag">{LLM_PROVIDERS[channel.provider].label}</span>
                    {channel.model && <span className="channel-model">{channel.model}</span>}
                    {current && <span className="ui-tag ui-tag-mint">正在使用</span>}
                  </div>
                  <div className="channel-actions">
                    {!current && (
                      <Button
                        variant="glass"
                        size="sm"
                        disabled={disabled}
                        onClick={() => setConfirming(channel.id)}
                      >
                        设为当前
                      </Button>
                    )}
                    <Button
                      variant="glass"
                      size="sm"
                      disabled={disabled}
                      onClick={() => {
                        setCreating(false);
                        setEditor({ ...channel, apiKey: '' });
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      variant="glass"
                      size="sm"
                      disabled={disabled || draft.testing === channel.id}
                      onClick={() => { void draft.runTest({ scope: 'channel', channelId: channel.id }); }}
                    >
                      {draft.testing === channel.id ? '测试中…' : '测试'}
                    </Button>
                    <Button
                      variant="plain"
                      size="sm"
                      disabled={disabled || !deletable}
                      onClick={() => { if (deletable) remove(channel.id); }}
                    >
                      删除
                    </Button>
                  </div>
                  {confirming === channel.id && (
                    <div className="channel-confirm">
                      <p>切换后服务会重启几秒</p>
                      <Button
                        size="sm"
                        disabled={disabled}
                        onClick={() => { void draft.save({ activeLlmChannelId: channel.id }); }}
                      >
                        确认切换
                      </Button>
                      <Button
                        variant="glass"
                        size="sm"
                        disabled={disabled}
                        onClick={() => setConfirming(null)}
                      >
                        取消
                      </Button>
                    </div>
                  )}
                  {result && (
                    <p
                      className={result.ok ? 'channel-result' : 'channel-result channel-result-bad'}
                      data-testid={`result-${channel.name}`}
                    >
                      {result.reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <Button
            variant="glass"
            disabled={disabled}
            onClick={() => {
              setCreating(true);
              setEditor(newChannel('siliconflow', crypto.randomUUID()));
            }}
          >
            添加渠道
          </Button>
        </section>
      )}
      {draft.error && <p role="alert">{draft.error}</p>}
      {draft.phase === 'restarting' && (
        <p role="status">正在重启…保存成功,窗口马上刷新。</p>
      )}
      {editor && (
        <ChannelSheet
          channel={editor}
          creating={creating}
          masked={draft.maskedKeys[editor.id]}
          disabled={disabled}
          testing={draft.testing === editor.id}
          onChange={setEditor}
          onClose={() => setEditor(null)}
          onSave={saveEditor}
          onTest={() => {
            const channels = creating
              ? [...draft.channels, editor]
              : draft.channels.map((channel) => (channel.id === editor.id ? editor : channel));
            void draft.runTest({ scope: 'channel', channelId: editor.id, channels });
          }}
        />
      )}
    </div>
  );
}

function ChannelSheet({
  channel,
  creating,
  masked,
  disabled,
  testing,
  onChange,
  onClose,
  onSave,
  onTest,
}: {
  channel: LlmChannel;
  creating: boolean;
  masked?: string;
  disabled: boolean;
  testing: boolean;
  onChange: (channel: LlmChannel) => void;
  onClose: () => void;
  onSave: () => void;
  onTest: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const preset = LLM_PROVIDERS[channel.provider];
  return createPortal(
    <div className="settings-sheet-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="settings-sheet"
      >
        <h2 id={titleId}>{creating ? '添加渠道' : '编辑渠道'}</h2>
        <ProviderCards
          provider={channel.provider}
          disabled={disabled}
          onSelect={(provider) => onChange(withProvider(channel, provider))}
        />
        <SettingsField
          label="名称"
          secret={false}
          value={channel.name}
          disabled={disabled}
          onChange={(name) => onChange({ ...channel, name })}
        />
        <SettingsField
          label="API Key"
          secret
          value={channel.apiKey}
          masked={masked}
          disabled={disabled}
          onChange={(apiKey) => onChange({ ...channel, apiKey })}
        />
        <SettingsField
          label="服务地址"
          secret={false}
          value={channel.baseUrl}
          disabled={disabled}
          onChange={(baseUrl) => onChange({ ...channel, baseUrl })}
        />
        <SettingsField
          label="模型"
          hint={preset.modelHint || undefined}
          secret={false}
          value={channel.model}
          disabled={disabled}
          onChange={(model) => onChange({ ...channel, model })}
        />
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
        <div className="settings-actions">
          <Button
            variant="glass"
            disabled={disabled}
            onClick={onClose}
          >
            取消
          </Button>
          <span className="settings-spacer" />
          <Button
            variant="glass"
            disabled={disabled || testing}
            onClick={onTest}
          >
            {testing ? '测试中…' : '测试连接'}
          </Button>
          <Button
            disabled={disabled || testing || !channel.name.trim()}
            onClick={onSave}
          >
            保存
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ProviderCards({
  provider,
  disabled,
  onSelect,
}: {
  provider: LlmProviderId;
  disabled: boolean;
  onSelect: (provider: LlmProviderId) => void;
}) {
  return (
    <div
      className="channel-types"
      role="group"
      aria-label="渠道类型"
    >
      {LLM_PROVIDER_IDS.map((id) => (
        <button
          key={id}
          type="button"
          className="channel-type"
          aria-pressed={provider === id}
          disabled={disabled}
          onClick={() => onSelect(id)}
        >
          <strong>{LLM_PROVIDERS[id].label}</strong>
          <small>{LLM_PROVIDERS[id].keyHint}</small>
        </button>
      ))}
    </div>
  );
}
