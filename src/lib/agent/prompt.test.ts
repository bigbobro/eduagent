import { describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { Course } from '@/types/course';
import { LessonMemory } from '@/types/session';
import { createMemory, markWordIncorrect } from './memory';
import { buildSystemPrompt } from './prompt';

const sentenceFixtureCourse: Course = {
  ...foodCourse,
  id: 'sentence-fixture',
  cards: [
    ...foodCourse.cards,
    {
      id: 'sentence_like_milk',
      english: 'I like milk.',
      chinese: '我喜欢牛奶。',
      imageUrl: '/images/food/milk.png',
      kind: 'sentence',
      drillParts: ['I like', 'milk'],
    },
  ],
  objectives: {
    sentences: ['I like milk.'],
  },
  phases: {
    ...foodCourse.phases,
    reinforcement: { quizzes: [] },
  },
};

describe('buildSystemPrompt P0 guardrails', () => {
  it('tells the model to summarize only learned words (closing phase)', () => {
    const memory = {
      ...createMemory(),
      phase: 'closing' as const,
      wordsLearned: ['car', 'bus'],
    };

    const prompt = buildSystemPrompt(foodCourse, memory);

    expect(prompt).toContain('只能总结本节已通过词汇');
    expect(prompt).toContain('car, bus');
  });

  it('R4: injects summary constraint even in learning phase (not just closing)', () => {
    // With R4, the summary constraint is always injected regardless of phase.
    const memory = {
      ...createMemory(),
      phase: 'learning' as const,
      wordsLearned: ['apple'],
    };

    const prompt = buildSystemPrompt(foodCourse, memory);

    expect(prompt).toContain('总结约束');
    expect(prompt).toContain('只能总结本节已通过词汇');
    expect(prompt).toContain('apple');
  });

  it('R4: summary constraint is present even when no words learned yet', () => {
    const memory = {
      ...createMemory(),
      phase: 'opening' as const,
      wordsLearned: [],
    };

    const prompt = buildSystemPrompt(foodCourse, memory);

    expect(prompt).toContain('总结约束');
    expect(prompt).toContain('(无)');
  });

  it('tells the model to switch strategy after three misses', () => {
    let memory: LessonMemory = {
      ...createMemory(),
      currentWord: 'apple',
      phase: 'learning' as const,
    };
    memory = markWordIncorrect(memory, 'apple');
    memory = markWordIncorrect(memory, 'apple');
    memory = markWordIncorrect(memory, 'apple');

    const prompt = buildSystemPrompt(foodCourse, memory);

    expect(prompt).toContain('连续 3 次错误');
    expect(prompt).toContain('必须切换策略');
  });
});

describe('buildSystemPrompt v2 wordcard protocol', () => {
  it('only declares show_card, not the legacy show/focus/annotate tools', () => {
    const memory = createMemory();
    const prompt = buildSystemPrompt(foodCourse, memory);

    expect(prompt).toContain('show_card');
    expect(prompt).not.toMatch(/\btool":\s*"show"/);
    expect(prompt).not.toContain('focus');
    expect(prompt).not.toContain('annotate');
    expect(prompt).not.toContain('可交互区域');
    expect(prompt).not.toContain('总览图');
  });

  it('lists word cards and sentence cards with id / english / chinese / kind', () => {
    const memory = createMemory();
    const prompt = buildSystemPrompt(sentenceFixtureCourse, memory);

    expect(prompt).toContain('## 目标词卡');
    expect(prompt).toContain('## 短句图卡');
    expect(prompt).toContain('apple: apple / 苹果 (word); drillParts=app | le');
    expect(prompt).toContain('sentence_like_milk: I like milk. / 我喜欢牛奶。 (sentence); drillParts=I like | milk');
  });

  it('exposes review/new card id lists', () => {
    const memory = createMemory();
    const prompt = buildSystemPrompt(foodCourse, memory);

    expect(prompt).toContain('建议先复习: ');
    expect(prompt).toContain('新教卡顺序: apple, banana, bread, milk, egg, rice');
  });
});

describe('buildSystemPrompt v1.1 progress and drill contract', () => {
  it('exposes card progress, current card, and cleared semantics', () => {
    const memory = {
      ...createMemory(),
      currentCardId: 'hour',
      clearedCardIds: ['minute'],
      cardProgress: {
        hour: 'attempted' as const,
        minute: 'cleared' as const,
        second: 'untouched' as const,
        thousand: 'needs_review' as const,
      },
    };

    const prompt = buildSystemPrompt(foodCourse, memory);

    expect(prompt).toContain('cleared 只表示');
    expect(prompt).toContain('当前卡片: hour');
    expect(prompt).toContain('cleared cards: minute');
    expect(prompt).toContain('untouched cards: second');
    expect(prompt).toContain('needs_review cards: thousand');
  });

  it('describes ASR assessment and drill rules', () => {
    const prompt = buildSystemPrompt(foodCourse, createMemory());

    expect(prompt).toContain('attempt_assessment');
    expect(prompt).toContain('raw ASR "Our." 对当前卡 hour 可以判 correct');
    expect(prompt).toContain('raw ASR "1000 is 10." 对 One thousand is ten hundreds. 判 close');
    expect(prompt).toContain('3 步慢读脚手架');
    expect(prompt).toContain('drillParts');
    expect(prompt).toContain('不得说"今天到这里/下课/结束"');
  });
});
