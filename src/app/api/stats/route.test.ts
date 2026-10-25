import { describe, it, expect } from 'vitest';
import { GET } from './route';
describe('stats daily contract', () => {
  it('adds exactly 91 local dates while preserving the seven-day suffix and totals', async () => {
    const response = await GET(new Request('http://localhost/api/stats?learnerId=isolated-child'));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.lastDays).toHaveLength(91);
    expect(data.lastDays.slice(-7)).toEqual(data.last7Days);
    expect(data.lastDays.every((d: {date:string;minutes:number}) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.minutes === 0)).toBe(true);
    expect(new Set(data.lastDays.map((d: {date:string}) => d.date)).size).toBe(91);
    expect(data.totalSessions).toBe(0);
    expect(data.totalMinutes).toBe(0);
    expect(data.totalWordsMastered).toBe(0);
  });
  it('still requires explicit learner scope', async () => {
    expect((await GET(new Request('http://localhost/api/stats'))).status).toBe(400);
  });
});
