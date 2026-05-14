import { describe, expect, it } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { createMemory, initializeCardProgress } from './memory';
import { buildSystemPrompt } from './prompt';

function memoryFor() {
  return initializeCardProgress(createMemory(), foodCourse);
}

describe('phase-aware system prompt', () => {
  it('intro phase contains scene introduction constraints and narrationHint', () => {
    const prompt = buildSystemPrompt(foodCourse, memoryFor(), 'intro');
    expect(prompt).toContain('introduction 阶段');
    expect(prompt).toContain('逐个指认');
    expect(prompt).toContain(foodCourse.phases.introduction.narrationHint);
    expect(prompt).toContain('不要问孩子能不能说');
  });

  it('interactive phase keeps v2 teaching guardrails', () => {
    const prompt = buildSystemPrompt(foodCourse, memoryFor(), 'interactive');
    expect(prompt).toContain('interactive 阶段');
    expect(prompt).toContain('P0 教学硬约束');
    expect(prompt).toContain('先练目标词');
  });

  it('reinforcement phase stops introducing new words', () => {
    const prompt = buildSystemPrompt(foodCourse, memoryFor(), 'reinforcement');
    expect(prompt).toContain('reinforcement 阶段');
    expect(prompt).toContain('不再介绍新词');
  });

  it('defaults to interactive when phase is omitted during transition', () => {
    const prompt = buildSystemPrompt(foodCourse, memoryFor());
    expect(prompt).toContain('interactive 阶段');
    expect(prompt).toContain('P0 教学硬约束');
  });
});
