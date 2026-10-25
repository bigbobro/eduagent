import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearnersSection } from './LearnersSection';
const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data)));
afterEach(() => vi.restoreAllMocks());
describe('LearnersSection', () => {
  it('creates and renames profiles, requiring the exact name before deleting', async () => {
    let items: Array<{ id: string; name: string }> = [];
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      if (!init) return json(items);
      const body = JSON.parse(String(init.body));
      if (init.method === 'POST') items = [{ id: 'a', name: body.name }];
      if (init.method === 'PATCH') items[0] = { ...items[0], name: body.name };
      if (init.method === 'DELETE') items = [];
      return json(items[0] ?? { ok: true });
    });
    render(<LearnersSection />);
    await screen.findByText('还没有孩子档案，先建第一个吧。');
    fireEvent.change(screen.getByLabelText('孩子名字'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: '新建孩子档案' }));
    await screen.findByText('A', { selector: '.learner-name' });
    fireEvent.click(screen.getByRole('button', { name: '改名' }));
    fireEvent.change(screen.getByLabelText('新名字'), { target: { value: 'B' } });
    fireEvent.click(screen.getByRole('button', { name: '保存名字' }));
    await screen.findByText('B', { selector: '.learner-name' });
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    const confirm = screen.getByRole('button', { name: '确认删除' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('输入孩子名字确认删除'), { target: { value: 'A' } });
    expect(confirm.disabled).toBe(true);
    expect(fetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    fireEvent.change(screen.getByLabelText('输入孩子名字确认删除'), { target: { value: 'B' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByText('还没有孩子档案，先建第一个吧。')).toBeTruthy());
    expect(fetch.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1);
  });
});
