import { describe, expect, it } from 'vitest';
import { transportationCourse } from '@/data/courses/transportation';
import { timeNumbersCourse } from '@/data/courses/timeNumbers';
import { LessonMemory } from '@/types/session';
import { createMemory, markWordIncorrect } from './memory';
import { buildSystemPrompt } from './prompt';

describe('buildSystemPrompt P0 guardrails', () => {
  it('tells the model to summarize only learned words', () => {
    const memory = {
      ...createMemory(),
      phase: 'closing' as const,
      wordsLearned: ['car', 'bus'],
    };

    const prompt = buildSystemPrompt(transportationCourse, memory);

    expect(prompt).toContain('只能总结本节已通过词汇');
    expect(prompt).toContain('car, bus');
  });

  it('tells the model to switch strategy after three misses', () => {
    let memory: LessonMemory = {
      ...createMemory(),
      currentWord: 'airplane',
      phase: 'learning' as const,
    };
    memory = markWordIncorrect(memory, 'airplane');
    memory = markWordIncorrect(memory, 'airplane');
    memory = markWordIncorrect(memory, 'airplane');

    const prompt = buildSystemPrompt(transportationCourse, memory);

    expect(prompt).toContain('连续 3 次错误');
    expect(prompt).toContain('必须切换策略');
  });
});

describe('buildSystemPrompt v2 wordcard protocol', () => {
  it('only declares show_card, not the legacy show/focus/annotate tools', () => {
    const memory = createMemory();
    const prompt = buildSystemPrompt(transportationCourse, memory);

    expect(prompt).toContain('show_card');
    expect(prompt).not.toMatch(/\btool":\s*"show"/);
    expect(prompt).not.toContain('focus');
    expect(prompt).not.toContain('annotate');
    expect(prompt).not.toContain('可交互区域');
    expect(prompt).not.toContain('总览图');
  });

  it('lists every card with id / english / chinese / kind', () => {
    const memory = createMemory();
    const prompt = buildSystemPrompt(timeNumbersCourse, memory);

    expect(prompt).toContain('## 可用卡片');
    expect(prompt).toContain('hour: hour / 小时 (word); drillParts=hour');
    expect(prompt).toContain('sentence_hour_minute: One hour has sixty minutes. / 一小时有 60 分钟。 (sentence); drillParts=One hour | has sixty | minutes');
  });

  it('exposes review/new card id lists', () => {
    const memory = createMemory();
    const prompt = buildSystemPrompt(transportationCourse, memory);

    expect(prompt).toContain('建议先复习: car, bus');
    expect(prompt).toContain('新教卡顺序: train, airplane, bicycle, boat');
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

    const prompt = buildSystemPrompt(timeNumbersCourse, memory);

    expect(prompt).toContain('cleared 只表示');
    expect(prompt).toContain('当前卡片: hour');
    expect(prompt).toContain('cleared cards: minute');
    expect(prompt).toContain('untouched cards: second');
    expect(prompt).toContain('needs_review cards: thousand');
  });

  it('describes ASR assessment and drill rules', () => {
    const prompt = buildSystemPrompt(timeNumbersCourse, createMemory());

    expect(prompt).toContain('attempt_assessment');
    expect(prompt).toContain('raw ASR "Our." 对当前卡 hour 可以判 correct');
    expect(prompt).toContain('raw ASR "1000 is 10." 对 One thousand is ten hundreds. 判 close');
    expect(prompt).toContain('3 步慢读脚手架');
    expect(prompt).toContain('drillParts');
    expect(prompt).toContain('不得说"今天到这里/下课/结束"');
  });
});
