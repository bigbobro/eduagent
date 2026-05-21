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
    expect(prompt).toContain('当前应练习的 word card: apple');
    expect(prompt).toContain('当前 word 可用短句图卡: sentence_apple (This is an apple.)');
    expect(prompt).toContain('不要回跳已通过的 word card');
    expect(prompt).toContain('This is an apple. => sentence_apple');
  });

  it('interactive phase advances to the first uncleared word card', () => {
    const memory = memoryFor();
    memory.currentCardId = 'egg';
    for (const id of ['apple', 'banana', 'bread', 'milk', 'egg']) {
      memory.cardProgress[id] = 'cleared';
    }

    const prompt = buildSystemPrompt(foodCourse, memory, 'interactive');

    expect(prompt).toContain('当前应练习的 word card: rice');
    expect(prompt).toContain('当前 word 可用短句图卡: sentence_rice (I eat rice.)');
    expect(prompt).toContain('已通过 word cards: apple, banana, bread, milk, egg');
  });

  it('interactive phase blocks unrelated sentence cards when the current word has no sentence', () => {
    const memory = memoryFor();
    memory.currentCardId = 'egg';
    for (const id of ['apple', 'banana', 'bread', 'milk']) {
      memory.cardProgress[id] = 'cleared';
    }

    const prompt = buildSystemPrompt(foodCourse, memory, 'interactive');

    expect(prompt).toContain('当前应练习的 word card: egg');
    expect(prompt).toContain('当前 word 可用短句图卡: (无;不要使用其它 sentence_* 卡)');
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
