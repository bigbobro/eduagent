import { describe, expect, it } from 'vitest';
import { encodeLessonEvent, lessonRequestSchema, parseLessonEvent, parseResumeInfo } from './lesson-protocol';

describe('lesson transport boundaries', () => {
  it.each(['null', '[]', '{broken', '"ok"'])('rejects invalid done payload %s instead of acknowledging success', (payload) => {
    expect(() => parseLessonEvent('done', payload)).toThrow();
  });
  it('does not let payload content impersonate a done event', () => {
    expect(parseLessonEvent('speech-delta', '{"type":"done","text":"hello"}')).toEqual({ type: 'speech-delta', text: 'hello' });
  });
  it('rejects malformed card actions and invalid progress phases', () => {
    expect(() => parseLessonEvent('actions', '{"actions":[{"tool":"show_card","params":{"card_id":42}}]}')).toThrow();
    expect(() => parseLessonEvent('progress_snapshot', '{"clearedCardIds":[],"totalAttempts":0,"currentPhase":"learning"}')).toThrow();
  });
  it('preserves the existing SSE wire shape and typed progress fields', () => {
    const event = { type: 'progress_snapshot' as const, clearedCardIds: ['cat'], totalAttempts: 2, currentPhase: 'interactive' as const, allWordsDone: false };
    const frame = encodeLessonEvent(event);
    expect(frame).toBe('event: progress_snapshot\ndata: {"clearedCardIds":["cat"],"totalAttempts":2,"currentPhase":"interactive","allWordsDone":false}\n\n');
    expect(parseLessonEvent('progress_snapshot', frame.split('data: ')[1].trim())).toEqual(event);
  });
  it('requires the right request fields before a write-capable route is entered', () => {
    expect(lessonRequestSchema.safeParse({ action: 'quiz-answer', sessionId: 's', quizId: 'q', answer: 'apple', correct: 'false' }).success).toBe(false);
    expect(lessonRequestSchema.safeParse({ action: 'phase-transition', sessionId: 's', to: 'learning' }).success).toBe(false);
    expect(lessonRequestSchema.safeParse({ action: 'end' }).success).toBe(false);
  });
  it('does not coerce malformed resume information into an accepted phase', () => {
    const resume = { resumed: true, phase: 'reinforcement', clearedCardIds: ['cat'], resumeCardId: '', passedQuizIds: ['q1'] };
    expect(parseResumeInfo(JSON.stringify(resume))).toEqual(resume);
    expect(parseResumeInfo(JSON.stringify({ ...resume, phase: 'learning' }))).toBeNull();
    expect(parseResumeInfo(JSON.stringify({ ...resume, passedQuizIds: [1] }))).toBeNull();
    expect(parseResumeInfo(JSON.stringify({ resumed: true }))).toBeNull();
  });
});
