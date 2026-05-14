import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubtitleBar } from './SubtitleBar';

describe('SubtitleBar', () => {
  it('user source renders "你:" prefix', () => {
    render(<SubtitleBar text="bus" source="user" isPlaying={false} />);
    expect(screen.getByText(/你:/)).toBeTruthy();
    expect(screen.getByText('bus')).toBeTruthy();
  });
  it('ai source uses cream background tone', () => {
    render(<SubtitleBar text="say bus" source="ai" isPlaying={true} />);
    const el = document.querySelector('[data-subtitle-source="ai"]') as HTMLElement;
    expect(el.className).toMatch(/bunny-bg-cream/);
  });
  it('idle source shows placeholder', () => {
    render(<SubtitleBar text="" source="idle" isPlaying={false} />);
    expect(screen.getByText('等待开始...')).toBeTruthy();
  });
});
