import { describe, expect, it } from 'vitest';
import { transportationCourse } from '@/data/courses/transportation';
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

    expect(prompt).toContain('只能总结已学词汇');
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
