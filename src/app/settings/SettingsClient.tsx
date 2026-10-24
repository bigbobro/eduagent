'use client';

import { MicSection } from '@/components/settings/MicSection';
import { AboutSection } from '@/components/settings/AboutSection';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LearnersSection } from '@/components/settings/LearnersSection';
import { PaperBg, PaperButton } from '@/components/magic';

type FieldKey =
  | 'llmApiKey' | 'llmBaseUrl' | 'llmModel'
  | 'doubaoAppId' | 'doubaoAccessKey' | 'doubaoAsrResourceId' | 'doubaoTtsResourceId' | 'doubaoTtsSpeaker';
type Values = Record<FieldKey, string>;
interface CheckResult { ok: boolean; reason: string }
interface TestReport { llm: CheckResult; tts: CheckResult; asr: CheckResult }
interface SettingsResponse { mode: 'app' | 'web'; configured: boolean; mock?: boolean; values: Values }

const SECRET: FieldKey[] = ['llmApiKey', 'doubaoAppId', 'doubaoAccessKey'];

// 与服务端 SETTINGS_DEFAULTS 一致(服务端回传的值为空时,表单里显示这些默认值)
const DEFAULTS: Partial<Values> = {
  llmBaseUrl: 'https://api.siliconflow.cn/v1',
  llmModel: 'deepseek-ai/DeepSeek-V3.2',
  doubaoAsrResourceId: 'volc.seedasr.sauc.duration',
  doubaoTtsResourceId: 'seed-tts-2.0',
};

const LLM_FIELDS: { key: FieldKey; label: string; hint?: string }[] = [
  { key: 'llmApiKey', label: 'API Key', hint: '在 SiliconFlow 的「API 密钥」页面创建并复制' },
  { key: 'llmBaseUrl', label: 'Base URL' },
  { key: 'llmModel', label: 'Model' },
];
const VOICE_FIELDS: { key: FieldKey; label: string; hint?: string }[] = [
  { key: 'doubaoAppId', label: 'App ID', hint: '豆包语音控制台里应用的 APP ID' },
  { key: 'doubaoAccessKey', label: 'Access Key', hint: '同一应用的 Access Token(访问令牌)' },
  { key: 'doubaoAsrResourceId', label: 'ASR Resource ID', hint: '语音识别资源' },
  { key: 'doubaoTtsResourceId', label: 'TTS Resource ID', hint: '语音合成资源' },
  { key: 'doubaoTtsSpeaker', label: '音色', hint: '老师猫的声音(speaker ID),留空使用默认' },
];

const EMPTY: Values = {
  llmApiKey: '', llmBaseUrl: '', llmModel: '',
  doubaoAppId: '', doubaoAccessKey: '', doubaoAsrResourceId: '', doubaoTtsResourceId: '', doubaoTtsSpeaker: '',
};

export function SettingsClient() {
  const router = useRouter();
  const [info, setInfo] = useState<SettingsResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState<Values>(EMPTY);
  // 凭据字段不回填(服务端只给打码值),打码值作为 placeholder 展示
  const [masked, setMasked] = useState<Partial<Values>>({});
  const [report, setReport] = useState<TestReport | null>(null);
  const [testing, setTesting] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'saving' | 'restarting'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: SettingsResponse) => {
        setInfo(data);
        const next = { ...EMPTY };
        const mk: Partial<Values> = {};
        (Object.keys(EMPTY) as FieldKey[]).forEach((k) => {
          if (SECRET.includes(k)) mk[k] = data.values[k] ?? '';
          else next[k] = data.values[k] || DEFAULTS[k] || '';
        });
        setForm(next);
        setMasked(mk);
      })
      .catch(() => setLoadError(true));
  }, []);

  const readOnly = info?.mode === 'web';
  const set = (k: FieldKey, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const runTest = async () => {
    setTesting(true);
    setReport(null);
    setError(null);
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(String(res.status));
      setReport(await res.json());
    } catch {
      setError('测试没有完成,请稍后重试');
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setPhase('saving');
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(String(res.status));
      setPhase('restarting');
      // Electron 会在服务重启后自行 reload;在普通浏览器里(app:dev)则轮询等服务回来再回首页。
      setTimeout(function poll() {
        fetch('/api/settings')
          .then((r) => (r.ok ? (window.location.href = '/') : setTimeout(poll, 600)))
          .catch(() => setTimeout(poll, 600));
      }, 1800);
    } catch {
      setPhase('idle');
      setError('保存失败,请重试');
    }
  };

  const busy = phase !== 'idle';

  return (
    <PaperBg tone="paper" className="h-screen w-screen">
      <main className="h-full overflow-y-auto px-12 py-6 text-ink">
        <header className="flex items-center justify-between border-b border-dashed border-inkPale pb-4">
          <div className="flex items-center gap-4">
            <PaperButton size="sm" color="paper" onClick={() => router.push('/')}>回首页</PaperButton>
            <h1 className="font-display text-[30px] leading-none">设置</h1>
            <span className="font-en-script text-lg text-inkSoft">Settings</span>
          </div>
          {info && (
            <span
              data-testid="config-status"
              className={`rounded-paper-pill border border-ink px-3 py-1 font-zh text-sm ${info.configured ? 'bg-mint' : 'bg-peach'}`}
            >
              {info.configured ? (info.mock ? '演示模式(无需 Key)' : '已配置') : '还没有配置 Key'}
            </span>
          )}
        </header>

        {loadError && <p className="py-6 font-zh text-inkSoft">暂时读不到设置,请刷新重试。</p>}
        {!info && !loadError && <div className="mt-6 h-40 animate-pulse rounded-paper-lg bg-paperDeep" />}

        {info && (
          <div className="mx-auto grid max-w-5xl gap-6 py-6">
            {readOnly && (
              <div className="rounded-paper-md border-2 border-ink bg-butter px-4 py-3 font-zh text-sm" data-testid="readonly-hint">
                开发模式:这里只显示当前状态。请修改项目里的 <code className="font-mono">.env.local</code> 后重启 server。
              </div>
            )}
            {!info.configured && !readOnly && (
              <div className="rounded-paper-md border-2 border-ink bg-peach px-4 py-3 font-zh text-sm">
                第一次使用需要填入你自己的 API Key,Key 只保存在这台电脑上,费用由你自己的账号承担。
              </div>
            )}

            <Group
              title="语言模型(LLM)"
              subtitle="负责老师的思考和回答"
              guide={
                <>
                  去 <ExternalLink href="https://cloud.siliconflow.cn/account/ak">SiliconFlow 的 API 密钥页面</ExternalLink> 创建密钥,
                  把密钥复制到下面的「API Key」。Base URL 和 Model 一般不用改。
                </>
              }
            >
              {LLM_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint} value={form[f.key]} masked={masked[f.key]} secret={SECRET.includes(f.key)} disabled={readOnly || busy} onChange={(v) => set(f.key, v)} />
              ))}
              <Result label="LLM" result={report?.llm} />
            </Group>

            <Group
              title="豆包语音"
              subtitle="负责听孩子说话(ASR)和老师开口(TTS)"
              guide={
                <>
                  去 <ExternalLink href="https://console.volcengine.com/speech/app">火山引擎豆包语音控制台</ExternalLink> 创建应用并开通语音识别、语音合成,
                  把应用的 APP ID 和 Access Token 分别填到下面的「App ID」「Access Key」。
                </>
              }
            >
              {VOICE_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint} value={form[f.key]} masked={masked[f.key]} secret={SECRET.includes(f.key)} disabled={readOnly || busy} onChange={(v) => set(f.key, v)} />
              ))}
              <Result label="语音合成(TTS)" result={report?.tts} />
              <Result label="语音识别(ASR)" result={report?.asr} />
            </Group>

            <MicSection />
            <LearnersSection />
            <AboutSection />

            {error && <p role="alert" className="font-zh text-sm text-ember">{error}</p>}
            {phase === 'restarting' && <p role="status" className="font-zh text-sm text-inkSoft">正在重启…保存成功,窗口马上刷新。</p>}

            {!readOnly && (
              <div className="flex gap-4">
                <PaperButton color="sky" size="sm" onClick={runTest} disabled={testing || busy}>
                  {testing ? '测试中…' : '测试连接'}
                </PaperButton>
                <PaperButton color="mint" size="sm" onClick={save} disabled={testing || busy}>
                  {phase === 'saving' ? '保存中…' : phase === 'restarting' ? '正在重启…' : '保存'}
                </PaperButton>
              </div>
            )}
          </div>
        )}
      </main>
    </PaperBg>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  // 桌面版里由 Electron main 的 setWindowOpenHandler 交给系统浏览器
  return <a href={href} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 text-skyDeep">{children}</a>;
}

function Group({ title, subtitle, guide, children }: { title: string; subtitle: string; guide: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-paper-lg border-2 border-ink bg-paper p-5 shadow-paper">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-[24px] leading-none">{title}</h2>
        <span className="font-zh text-sm text-inkSoft">{subtitle}</span>
      </div>
      <p className="mb-3 font-zh text-sm leading-relaxed text-inkSoft">{guide}</p>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, value, masked, secret, disabled, onChange }: {
  label: string; hint?: string; value: string; masked?: string; secret: boolean; disabled: boolean; onChange: (v: string) => void;
}) {
  const id = `field-${label.replace(/\s+/g, '-')}`;
  const placeholder = secret ? (masked ? `已保存 ${masked},留空保持不变` : '尚未填写') : '';
  return (
    <div className="grid grid-cols-[150px_1fr] items-center gap-3 border-t border-dashed border-inkPale pt-3 font-zh text-sm first:border-t-0 first:pt-0">
      <label htmlFor={id}>
        {label}
        {hint && <span className="block text-xs text-inkPale">{hint}</span>}
      </label>
      <input
        id={id}
        type={secret ? 'password' : 'text'}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-paper-md border-2 border-ink bg-paperDeep px-3 py-2 font-mono text-sm text-ink outline-none focus:ring-2 focus:ring-butterDeep disabled:opacity-60"
      />
    </div>
  );
}

function Result({ label, result }: { label: string; result?: CheckResult }) {
  if (!result) return null;
  return (
    <p data-testid={`result-${label}`} className={`font-zh text-sm ${result.ok ? 'text-mintDeep' : 'text-ember'}`}>
      {result.ok ? '✓' : '✗'} {label}:{result.reason}
    </p>
  );
}
