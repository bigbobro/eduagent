import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { POST } from './route';
import { resetConfig, isConfigured, isRealtimeConfigured } from '@/lib/config';
import { realtimeClassrooms } from '@/lib/realtime/classroom-session';
import { sessionStore } from '@/lib/agent/session-store';
beforeEach(() => {
  vi.stubEnv('VOICE_MOCK', 'false'); vi.stubEnv('PORT', '3000');
  vi.stubEnv('OPENAI_API_KEY', 'fake-openai-key-for-settings-test');
  for (const key of ['LLM_API_KEY', 'MIMO_API_KEY', 'DOUBAO_API_KEY', 'DOUBAO_APP_ID', 'DOUBAO_ACCESS_KEY']) vi.stubEnv(key, '');
  resetConfig();
});
afterEach(() => { realtimeClassrooms.forEach((classroom) => { classroom.session.lifetime.abort(); sessionStore.delete(classroom.session.id); }); realtimeClassrooms.clear(); vi.unstubAllEnvs(); resetConfig(); });
const request = (body: object, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/realtime', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
it('starts with only OpenAI configured and never returns the credential', async () => {
  expect(isConfigured()).toBe(false); expect(isRealtimeConfigured()).toBe(true);
  const response = await POST(request({ action: 'start', courseId: 'animals', learnerId: 'test-learner', fresh: true }));
  expect(response.status).toBe(200); const text = await response.text();
  expect(text).not.toContain('fake-openai');
  const body = JSON.parse(text);
  expect(body.receipt.progress.currentPhase).toBe('intro');
  const wrongChild = await POST(request({ action: 'end', sessionId: body.sessionId, learnerId: 'wrong-child' }));
  expect(wrongChild.status).toBe(409);
});
async function* frames(response: Response) {
  const reader = response.body!.getReader(); const decoder = new TextDecoder(); let text = '';
  for (;;) {
    const { value, done } = await reader.read(); if (done) return;
    text += decoder.decode(value, { stream: true });
    let index: number;
    while ((index = text.indexOf('\n\n')) >= 0) { yield JSON.parse(text.slice(6, index)); text = text.slice(index + 2); }
  }
}
function streamReader(response: Response) { const iterator = frames(response); return async (match: (event: any) => boolean) => { for (;;) { const { value, done } = await iterator.next(); if (done) throw new Error('stream ended'); if (match(value)) return value; } }; }
it('rejects natural-classroom actions from another child and a second call for the same lesson', async () => {
  vi.stubEnv('VOICE_MOCK', 'true'); resetConfig();
  const body = await (await POST(request({ action: 'start', courseId: 'animals', learnerId: 'test-learner', fresh: true }))).json();
  const owner = { learnerId: 'test-learner', sessionId: body.sessionId };
  const read = streamReader(await POST(request({ action: 'connect', ...owner, sdp: null })));
  await read((e) => e.type === 'receipt' && e.receipt.progress.currentPhase === 'interactive');
  expect((await POST(request({ action: 'connect', ...owner, sdp: null }))).status).toBe(409);
  expect((await POST(request({ action: 'presented', learnerId: 'another-child', sessionId: body.sessionId, target: { kind: 'card', id: 'cat' } }))).status).toBe(409);
  expect((await POST(request({ action: 'presented', ...owner, target: { kind: 'card', id: 'not-a-card' } }))).status).toBe(409);
  expect((await POST(request({ action: 'end', ...owner }))).status).toBe(200);
  expect((await POST(request({ action: 'presented', ...owner, target: { kind: 'card', id: 'cat' } }))).status).toBe(409);
});
it('keeps the offline speech control unavailable when connected to the real provider', async () => {
  const body = await (await POST(request({ action: 'start', courseId: 'animals', learnerId: 'test-learner', fresh: true }))).json();
  expect(body.transport).toBe('webrtc');
  expect((await POST(request({ action: 'mock-speech', learnerId: 'test-learner', sessionId: body.sessionId, utterance: { kind: 'attempt' } }))).status).toBe(404);
});
it('rejects a foreign browser before starting a provider session', async () => {
  expect((await POST(request({ action: 'start', courseId: 'animals', learnerId: 'test-learner' }, 'http://evil.example'))).status).toBe(403);
  expect(realtimeClassrooms.size).toBe(0);
});
it('bounds request size even without a declared Content-Length', async () => {
  const req = new Request('http://localhost:3000/api/realtime', { method: 'POST', headers: { Origin: 'http://localhost:3000' }, body: 'x'.repeat(100_001) });
  expect((await POST(req)).status).toBe(413);
});

it('restores progress in both directions and rejects the revoked remote classroom', async () => {
  vi.stubEnv('VOICE_MOCK', 'true'); resetConfig();
  const { POST: oldPost } = await import('@/app/api/chat/route');
  const { getSession, endSession } = await import('@/lib/agent/session');
  const legacy = async (body: object) => {
    const response = await oldPost(request(body) as import('next/server').NextRequest);
    await response.text(); return response;
  };
  const started = await legacy({ action: 'start', courseId: 'animals', learnerId: 'test-learner', fresh: true });
  const oldId = started.headers.get('X-Session-Id')!;
  await legacy({ action: 'phase-transition', sessionId: oldId, to: 'interactive' });
  await legacy({ action: 'message', sessionId: oldId, text: 'cat' });
  expect(getSession(oldId)?.memory.cardCorrectCount.cat).toBe(1);
  const realtimeStart = await POST(request({ action: 'start', courseId: 'animals', learnerId: 'test-learner' }));
  const realtime = await realtimeStart.json();
  expect(realtime.resume.resumeCardId).toBe('cat'); expect(realtime.transport).toBe('mock');
  const owner = { learnerId: 'test-learner', sessionId: realtime.sessionId };
  const events = await POST(request({ action: 'connect', ...owner, sdp: null }));
  const read = streamReader(events);
  expect(await read((e) => e.type === 'answer')).toEqual({ type: 'answer', sdp: null });
  expect((await POST(request({ action: 'presented', ...owner, target: { kind: 'card', id: 'cat' } }))).status).toBe(200);
  expect((await POST(request({ action: 'mock-speech', ...owner, utterance: { kind: 'attempt' } }))).status).toBe(200);
  const saved = await read((e) => e.type === 'receipt' && Boolean(e.receipt.assessment));
  expect(saved.receipt.assessment).toMatchObject({ target_id: 'cat', mastered: true });
  const restored = await legacy({ action: 'start', courseId: 'animals', learnerId: 'test-learner' });
  const restoredId = restored.headers.get('X-Session-Id')!;
  expect(getSession(restoredId)?.memory.clearedCardIds).toContain('cat');
  expect(getSession(restoredId)?.memory.cardCorrectCount.cat).toBe(1);
  expect((await POST(request({ action: 'end', sessionId: realtime.sessionId, learnerId: 'test-learner' }))).status).toBe(409);
  await legacy({ action: 'end', sessionId: oldId });
  expect(getSession(restoredId)).toBeDefined();
  endSession(restoredId);
}, 15000);

it('preserves a corrupt breakpoint and reports its data error before creating any classroom', async () => {
  const { getDb } = await import('@/lib/db'); const db = getDb();
  const before = db.prepare('SELECT COUNT(*) AS n FROM lesson_logs').get();
  db.prepare(`INSERT INTO course_progress (course_id, learner_id, snapshot, phase, completed, updated_at)
    VALUES ('animals', 'test-learner', '{invalid', 'interactive', 0, '2026-01-01T00:00:00Z')
    ON CONFLICT(learner_id, course_id) DO UPDATE SET snapshot = excluded.snapshot, completed = 0`).run();
  const response = await POST(request({ action: 'start', courseId: 'animals', learnerId: 'test-learner' }));
  expect(response.status).toBe(409); expect((await response.json()).code).toBe('INVALID_COURSE_PROGRESS');
  expect(db.prepare('SELECT COUNT(*) AS n FROM lesson_logs').get()).toEqual(before);
  expect(db.prepare("SELECT snapshot FROM course_progress WHERE course_id='animals' AND learner_id='test-learner'").get()).toEqual({ snapshot: '{invalid' });
});
