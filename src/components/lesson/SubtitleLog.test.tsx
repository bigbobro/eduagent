import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LessonController } from '@/lib/voice/lesson-controller';
import { SubtitleLog } from './SubtitleLog';

function controller() {
  const handlers = new Map<string, Set<(payload: any) => void>>();
  return {
    on(event: string, handler: (payload: any) => void) { if (!handlers.has(event)) handlers.set(event, new Set()); handlers.get(event)!.add(handler); },
    off(event: string, handler: (payload: any) => void) { handlers.get(event)?.delete(handler); },
    emit(event: string, payload?: any) { handlers.get(event)?.forEach(handler => handler(payload)); },
  };
}

describe('SubtitleLog', () => {
  it('keeps teacher sentences, replaces partial recognition, and finalizes a child turn', () => {
    const source = controller();
    render(<SubtitleLog controller={source as unknown as LessonController} />);
    act(() => { source.emit('subtitle', { text: 'Look at the cat.', source: 'ai' }); source.emit('subtitle-clear'); source.emit('subtitle', { text: 'ca', source: 'user' }); source.emit('subtitle', { text: 'cat', source: 'user' }); });
    expect(screen.getByText('你 · 识别中')).toBeTruthy();
    expect(screen.queryByText('ca')).toBeNull();
    act(() => { source.emit('asr-final', { text: 'cat' }); source.emit('subtitle', { text: 'Very good!', source: 'ai' }); source.emit('subtitle-clear'); });
    expect(screen.queryByText('你 · 识别中')).toBeNull();
    expect(screen.getByText('Look at the cat.')).toBeTruthy();
    expect(screen.getByText('cat')).toBeTruthy();
    expect(screen.getByText('Very good!')).toBeTruthy();
  });
  it('bounds history and unsubscribes when the lesson view leaves', () => {
    const source = controller();
    const { unmount } = render(<SubtitleLog controller={source as unknown as LessonController} />);
    act(() => { for (let i = 0; i < 55; i++) source.emit('subtitle', { text: `Sentence ${i}`, source: 'ai' }); });
    expect(within(screen.getByRole('log')).getAllByText(/^Sentence /)).toHaveLength(50);
    expect(screen.queryByText('Sentence 0')).toBeNull();
    unmount();
    act(() => source.emit('subtitle', { text: 'late event', source: 'ai' }));
  });
});
