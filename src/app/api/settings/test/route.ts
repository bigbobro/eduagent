import { NextResponse } from 'next/server';
import { rejectBadOrigin } from '@/lib/settings/origin-guard';
import { LLM_PROVIDERS } from '@/lib/llm-providers';
import { currentValues, mergeSubmitted, SETTINGS_DEFAULTS, settingsTestSchema, type SettingsValues } from '@/lib/settings/store';
import { runAllTests, runChannelTest, runVoiceTests } from '@/lib/settings/test-connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const bad = rejectBadOrigin(req);
  if (bad) return bad;
  const parsed = settingsTestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: 'INVALID_SETTINGS', error: '设置内容格式不正确' }, { status: 400 });
  // 打码/空的凭据字段回退到已保存的值;语音资源 ID 为空时用默认值。渠道按提交的那一条测,不看它是不是当前渠道。
  const { scope, channelId, ...document } = parsed.data;
  const merged = fillDefaults(mergeSubmitted(currentValues(), document));
  const targetId = channelId || merged.activeLlmChannelId;
  if (scope === 'channel') {
    const llm = await runChannelTest(merged, targetId);
    console.log('[settings] test-connection', { scope, provider: merged.llmChannels.find((channel) => channel.id === targetId)?.provider ?? 'custom', llm: llm.ok });
    return NextResponse.json({ llm });
  }
  if (scope === 'voice') {
    const voice = await runVoiceTests(merged);
    console.log('[settings] test-connection', { scope, tts: voice.tts.ok, asr: voice.asr.ok });
    return NextResponse.json(voice);
  }
  const report = await runAllTests(merged);
  console.log('[settings] test-connection', {
    scope: 'all',
    provider: merged.llmChannels.find((channel) => channel.id === merged.activeLlmChannelId)?.provider ?? 'custom',
    llm: report.llm.ok,
    tts: report.tts.ok,
    asr: report.asr.ok,
  });
  return NextResponse.json(report);
}

function fillDefaults(v: SettingsValues): SettingsValues {
  return {
    ...v,
    doubaoAsrResourceId: v.doubaoAsrResourceId || SETTINGS_DEFAULTS.doubaoAsrResourceId,
    doubaoTtsResourceId: v.doubaoTtsResourceId || SETTINGS_DEFAULTS.doubaoTtsResourceId,
    doubaoTtsSpeaker: v.doubaoTtsSpeaker || SETTINGS_DEFAULTS.doubaoTtsSpeaker,
    llmChannels: v.llmChannels.map((channel) => {
      const preset = LLM_PROVIDERS[channel.provider];
      return {
        ...channel,
        baseUrl: channel.baseUrl || preset.defaultBaseUrl,
        model: channel.model || preset.defaultModel,
      };
    }),
  };
}
