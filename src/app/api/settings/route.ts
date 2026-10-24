import { NextResponse } from 'next/server';
import { isConfigured } from '@/lib/config';
import { rejectBadOrigin } from '@/lib/settings/origin-guard';
import { scheduleRestart } from '@/lib/settings/restart';
import {
  currentValues,
  getSettingsMode,
  getSettingsPath,
  maskValues,
  mergeSubmitted,
  readSettingsFile,
  settingsInputSchema,
  writeSettingsFile,
} from '@/lib/settings/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    mode: getSettingsMode(),
    configured: isConfigured(),
    mock: process.env.VOICE_MOCK === 'true',
    values: maskValues(currentValues()),
  });
}

export async function POST(req: Request) {
  const bad = rejectBadOrigin(req);
  if (bad) return bad;
  const path = getSettingsPath();
  if (getSettingsMode() !== 'app') {
    return NextResponse.json({ code: 'WEB_MODE_READONLY', error: '开发模式请修改 .env.local' }, { status: 403 });
  }
  if (!path) {
    console.error('[settings] EDUAGENT_SETTINGS_PATH is not set in app mode');
    return NextResponse.json({ error: '设置文件路径未配置' }, { status: 500 });
  }
  const parsed = settingsInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: 'INVALID_SETTINGS', error: '设置内容格式不正确' }, { status: 400 });

  try {
    writeSettingsFile(path, mergeSubmitted(readSettingsFile(path), parsed.data));
  } catch (err) {
    console.error('[settings] write failed', { message: (err as Error).message });
    return NextResponse.json({ error: '保存失败,请重试' }, { status: 500 });
  }
  console.log('[settings] saved');
  scheduleRestart();
  return NextResponse.json({ ok: true, restarting: true });
}
