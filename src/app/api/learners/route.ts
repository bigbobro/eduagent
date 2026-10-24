import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureDatabaseInitialized } from '@/lib/init';
import { rejectBadOrigin } from '@/lib/settings/origin-guard';
import { createLearner, deleteLearner, listLearners, renameLearner } from '@/lib/db/learners';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const name = z.string().trim().min(1).max(80);
const id = z.string().min(1);

export async function GET() {
  ensureDatabaseInitialized();
  return NextResponse.json(listLearners());
}
async function write(req: Request, action: 'create' | 'rename' | 'delete') {
  const bad = rejectBadOrigin(req);
  if (bad) return bad;
  const schema = action === 'create' ? z.object({ name }) : action === 'rename' ? z.object({ id, name }) : z.object({ id });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '孩子档案格式不正确' }, { status: 400 });
  try {
    ensureDatabaseInitialized();
    console.log('[learners]', action);
    const data = parsed.data as { id: string; name: string };
    const result = action === 'create' ? createLearner(data.name) : action === 'rename' ? renameLearner(data.id, data.name) : deleteLearner(data.id);
    if (!result) return NextResponse.json({ error: 'Learner not found' }, { status: 404 });
    console.log('[learners]', action, 'saved');
    return NextResponse.json(action === 'delete' ? { ok: true } : result, { status: action === 'create' ? 201 : 200 });
  } catch (error) {
    console.error('[learners] write failed', { action, message: (error as Error).message });
    return NextResponse.json({ error: '保存失败，请重试' }, { status: 500 });
  }
}
export const POST = (req: Request) => write(req, 'create');
export const PATCH = (req: Request) => write(req, 'rename');
export const DELETE = (req: Request) => write(req, 'delete');
