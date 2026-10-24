import { NextResponse } from 'next/server';
import { isAllowedHttpOrigin } from '../voice/ws-origin';

/** POST 类设置接口的 CSRF 防护:Origin 缺失或不在回环白名单 -> 403。通过返回 null。 */
export function rejectBadOrigin(req: Request): NextResponse | null {
  const port = Number(process.env.PORT) || 3000;
  const origin = req.headers.get('origin');
  if (isAllowedHttpOrigin(origin, port)) return null;
  console.warn('[settings] rejected request with bad Origin', { origin: origin ?? '(missing)' });
  return NextResponse.json({ code: 'FORBIDDEN_ORIGIN', error: 'Forbidden' }, { status: 403 });
}
