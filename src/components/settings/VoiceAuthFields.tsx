'use client';

import { SettingsField } from './SettingsField';
import type { SettingsDraft } from './useSettingsDraft';

export const DOUBAO_CONSOLE_URL = 'https://console.volcengine.com/speech/new/setting/apikeys?projectName=default';

const MODES = [
  { id: 'apikey', label: '新版控制台', hint: '一个 API Key' },
  { id: 'legacy', label: '旧版控制台', hint: 'App ID 和 Access Key' },
] as const;

export function VoiceAuthFields({
  draft,
  disabled,
}: {
  draft: SettingsDraft;
  disabled: boolean;
}) {
  const mode = draft.voice.doubaoAuthMode;
  return (
    <>
      <div
        className="channel-types"
        role="group"
        aria-label="接入方式"
      >
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            className="channel-type"
            aria-pressed={mode === item.id}
            disabled={disabled}
            onClick={() => draft.setVoice('doubaoAuthMode', item.id)}
          >
            <strong>{item.label}</strong>
            <small>{item.hint}</small>
          </button>
        ))}
      </div>
      {mode === 'apikey' ? (
        <SettingsField
          label="豆包 API Key"
          secret
          value={draft.voice.doubaoApiKey}
          masked={draft.maskedVoice.doubaoApiKey}
          disabled={disabled}
          onChange={(value) => draft.setVoice('doubaoApiKey', value)}
        />
      ) : (
        <>
          <SettingsField
            label="App ID"
            secret
            value={draft.voice.doubaoAppId}
            masked={draft.maskedVoice.doubaoAppId}
            disabled={disabled}
            onChange={(value) => draft.setVoice('doubaoAppId', value)}
          />
          <SettingsField
            label="Access Key"
            secret
            value={draft.voice.doubaoAccessKey}
            masked={draft.maskedVoice.doubaoAccessKey}
            disabled={disabled}
            onChange={(value) => draft.setVoice('doubaoAccessKey', value)}
          />
        </>
      )}
    </>
  );
}

export function DoubaoConsoleLink({ large = false }: { large?: boolean }) {
  return (
    <a
      className={large ? 'ui-button ui-button-glass ui-button-lg' : 'ui-button ui-button-glass'}
      href={DOUBAO_CONSOLE_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="打开火山引擎豆包语音控制台"
    >
      打开豆包语音控制台
    </a>
  );
}
