import { describe, expect, it, vi } from 'vitest';
import { foodCourse } from '@/data/courses/food';
import { LegacyClassroom } from './legacy-classroom';
import type { LessonController } from './lesson-controller';
import type { QuizResult } from './classroom';

function setup() {
  const listeners = new Map<string, Set<(data: unknown) => void>>();
  const engine = {
    on(event: string, fn: (data: unknown) => void) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(fn); },
    off(event: string, fn: (data: unknown) => void) { listeners.get(event)?.delete(fn); },
    emit(event: string, data: unknown) { listeners.get(event)?.forEach((fn) => fn(data)); },
    getState: () => 'awaiting', getResumeInfo: () => null,
    startLesson: vi.fn(async () => true), endLesson: vi.fn(async () => {}),
    speakStatic: vi.fn(async () => {}), sendCustomAction: vi.fn(async () => ({ ok: true })),
    submitQuizAnswer: vi.fn(async () => ({ ok: true })),
    startListening: vi.fn(async () => {}), stopListening: vi.fn(async () => {}),
  };
  const classroom = new LegacyClassroom(foodCourse, engine as unknown as LessonController);
  const results: QuizResult[] = [];
  classroom.on('quiz-result', (result) => results.push(result));
  return { engine, classroom, results };
}

describe('original classroom policy behind shared intentions', () => {
  it('keeps sentence ASR scoring and persistence out of the view', async () => {
    const { engine, classroom, results } = setup();
    const quiz = foodCourse.phases.reinforcement.quizzes.find((q) => q.type === 'repeat-after-me')!;
    await classroom.presentQuiz(quiz.id);
    await classroom.startQuizListening(quiz.id);
    expect(engine.startListening).toHaveBeenCalledWith(expect.objectContaining({ routeToChat: false }));
    engine.emit('asr-final', { text: 'This is an apple.' });
    await vi.waitFor(() => expect(results).toHaveLength(1));
    expect(engine.submitQuizAnswer).toHaveBeenCalledWith(quiz.id, 'This is an apple.', true);
    expect(results[0]).toMatchObject({ ok: true, correct: true, source: 'legacy-asr', next: 'advance' });
  });
  it('keeps old retry policy, ignores a duplicate while saving, and retries a failed save once', async () => {
    const { engine, classroom, results } = setup();
    let finish!: (value: { ok: boolean }) => void;
    engine.submitQuizAnswer.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const saving = classroom.submitPick('q1', 'milk');
    await classroom.submitPick('q1', 'milk');
    expect(engine.submitQuizAnswer).toHaveBeenCalledTimes(1);
    finish({ ok: false }); await saving;
    expect(results[0]).toMatchObject({ ok: false, next: 'retry' });
    await classroom.retryQuiz('q1');
    await classroom.submitPick('q1', 'milk');
    await classroom.submitPick('q1', 'milk');
    expect(results.map((row) => row.next)).toEqual(['retry', 'retry', 'retry', 'advance']);
    expect(engine.speakStatic).toHaveBeenCalledTimes(2);
  });
  it('keeps legacy cleared-word filtering inside this mode and repeat is not an assessment', async () => {
    const { engine, classroom } = setup();
    const actions = vi.fn(); classroom.on('actions', actions);
    engine.emit('progress', { clearedCardIds: ['apple'], totalAttempts: 2, currentPhase: 'interactive' });
    engine.emit('actions', [{ tool: 'show_card', params: { card_id: 'sentence_apple' } }]);
    expect(actions).toHaveBeenLastCalledWith([]);
    await classroom.repeatCard('apple');
    expect(engine.sendCustomAction).toHaveBeenCalledWith(expect.objectContaining({ system: true }));
    expect(engine.submitQuizAnswer).not.toHaveBeenCalled();
  });
  it('ignores save completion after classroom end', async () => {
    const { engine, classroom, results } = setup();
    let finish!: (value: { ok: boolean }) => void;
    engine.submitQuizAnswer.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = classroom.submitPick('q1', 'apple');
    await classroom.endLesson(); finish({ ok: true }); await pending;
    expect(results).toEqual([]);
  });
});
