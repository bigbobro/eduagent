import { describe, expect, it, vi } from 'vitest';
import { GET, POST, PATCH, DELETE } from '@/app/api/learners/route';
import { GET as progress } from '@/app/api/progress/route';
import { GET as stats } from '@/app/api/stats/route';
import { GET as sessions } from '@/app/api/sessions/route';
const request = (method: string, body: unknown, origin?: string) => new Request('http://localhost:3000/api/learners', { method, headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
describe('learners API', () => {
  it.each([['POST', POST], ['PATCH', PATCH], ['DELETE', DELETE]] as const)('%s requires a loopback Origin', async (method, handler) => {
    vi.stubEnv('PORT', '3000');
    try {
      for (const origin of [undefined, 'https://evil.example', 'http://localhost:3001', 'null']) {
        const res = await handler(request(method, { name: 'A', id: 'test-learner' }, origin));
        expect(res.status).toBe(403); expect(await res.json()).toMatchObject({ code: 'FORBIDDEN_ORIGIN' });
      }
    } finally { vi.unstubAllEnvs(); }
  });
  it('creates, lists, renames, validates and deletes with an allowed Origin', async () => {
    const origin = 'http://localhost:3000';
    const invalid = await POST(request('POST', { name: '  ' }, origin)); expect(invalid.status).toBe(400);
    const res = await POST(request('POST', { name: ' A ' }, origin)); expect(res.status).toBe(201);
    const a = await res.json(); expect(a.name).toBe('A');
    expect(await (await GET()).json()).toContainEqual(a);
    const rename = await PATCH(request('PATCH', { id: a.id, name: 'B' }, origin)); expect((await rename.json()).name).toBe('B');
    expect((await DELETE(request('DELETE', { id: a.id }, origin))).status).toBe(200);
    expect((await PATCH(request('PATCH', { id: a.id, name: 'C' }, origin))).status).toBe(404);
    expect((await DELETE(request('DELETE', { id: a.id }, origin))).status).toBe(404);
  });
  it.each([['progress', progress], ['stats', stats], ['sessions', sessions]] as const)('%s requires learnerId', async (name, handler) => {
    expect((await handler(new Request(`http://localhost:3000/api/${name}`))).status).toBe(400);
  });
});
