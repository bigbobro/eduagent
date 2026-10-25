'use client';

export function SettingsNotice({
  info,
  loadError,
  readOnly,
}: {
  info: { configured: boolean; mock?: boolean } | null;
  loadError: boolean;
  readOnly: boolean;
}) {
  return (
    <>
      {info && (
        <p
          data-testid="config-status"
          className={`ui-tag ${info.configured ? 'ui-tag-mint' : 'ui-tag-amber'}`}
        >
          {info.mock ? '演示模式(无需 Key)' : info.configured ? '已配置' : '还没有配置 Key'}
        </p>
      )}
      {readOnly && (
        <div
          className="settings-note ui-tag-amber"
          data-testid="readonly-hint"
          style={{ background: 'rgba(255,159,46,.14)' }}
        >
          开发模式:这里只显示当前状态。请修改项目里的 <code>.env.local</code> 后重启 server。
        </div>
      )}
      {loadError && <p role="alert">暂时读不到设置,请刷新重试。</p>}
      {!info && !loadError && <p role="status">正在读取设置…</p>}
    </>
  );
}

export function SettingsField({
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
