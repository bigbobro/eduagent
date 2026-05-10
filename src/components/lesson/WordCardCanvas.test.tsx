import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { WordCardCanvas } from './WordCardCanvas';
import type { WordCard } from '@/types/course';

const wordCard: WordCard = {
  id: 'airplane',
  english: 'airplane',
  chinese: '飞机',
  imageUrl: '/images/transportation/airplane.svg',
  kind: 'word',
  drillParts: ['air', 'plane'],
};

const sentenceCard: WordCard = {
  id: 'sentence_hour_minute',
  english: 'One hour has sixty minutes.',
  chinese: '一小时有 60 分钟。',
  imageUrl: '/images/time-numbers/sentence-hour-minute.png',
  kind: 'sentence',
  drillParts: ['One hour', 'has sixty', 'minutes'],
};

const cards: WordCard[] = [wordCard, sentenceCard];

// React 18 concurrent mode renders asynchronously; allow the scheduler to flush.
const waitRender = () => new Promise<void>((r) => setTimeout(r, 50));

describe('WordCardCanvas', () => {
  it('renders the english + chinese for the current word card', async () => {
    const { container } = render(<WordCardCanvas cards={cards} currentCardId="airplane" />);
    await waitRender();

    expect(container.textContent).toContain('airplane');
    expect(container.textContent).toContain('飞机');
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.src).toContain('airplane.svg');
  });

  it('renders the english + chinese for a sentence card', async () => {
    const { container } = render(<WordCardCanvas cards={cards} currentCardId="sentence_hour_minute" />);
    await waitRender();

    expect(container.textContent).toContain('One hour has sixty minutes.');
    expect(container.textContent).toContain('一小时有 60 分钟。');
  });

  it('marks sentence card with data-kind for css differentiation', async () => {
    const { container } = render(
      <WordCardCanvas cards={cards} currentCardId="sentence_hour_minute" />
    );
    await waitRender();

    const card = container.querySelector('[data-kind="sentence"]');
    expect(card).not.toBeNull();
  });

  it('renders empty placeholder + warns when card_id is unknown (does not throw)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      render(<WordCardCanvas cards={cards} currentCardId="bogus" />)
    ).not.toThrow();

    await waitRender();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown card_id'));
    warn.mockRestore();
  });

  it('renders empty placeholder when cards is empty', async () => {
    const { container } = render(<WordCardCanvas cards={[]} currentCardId="" />);
    await waitRender();
    expect(container.querySelector('[data-kind]')).toBeNull();
  });
});
