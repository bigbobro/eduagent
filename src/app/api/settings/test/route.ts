import { NextResponse } from 'next/server';
import { rejectBadOrigin } from '@/lib/settings/origin-guard';
import { currentValues, mergeSubmitted, SETTINGS_DEFAULTS, SETTINGS_FIELDS, settingsInputSchema, type SettingsValues } from '@/lib/settings/store';
import { runAllTests } from '@/lib/settings/test-connection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const bad = rejectBadOrigin(req);
  if (bad) return bad;
  const parsed = settingsInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: 'INVALID_SETTINGS', error: '设置内容格式不正确' }, { status: 400 });
  // 打码/空的凭据字段回退到已保存的值;非凭据字段为空时用默认值
  const merged = mergeSubmitted(currentValues(), parsed.data);
  const report = await runAllTests(fillDefaults(merged));
  console.log('[settings] test-connection', { llm: report.llm.ok, tts: report.tts.ok, asr: report.asr.ok });
  return NextResponse.json(report);
}

function fillDefaults(v: SettingsValues): SettingsValues {
  const out = { ...v };
  for (const f of SETTINGS_FIELDS) if (!out[f]) out[f] = SETTINGS_DEFAULTS[f];
  return out;
}
