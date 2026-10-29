'use client';

import type { Course } from '@/types/course';
import type { Classroom, ClassroomEvents, QuizResult } from './classroom';
import { findQuiz } from './classroom';
import { LessonController } from './lesson-controller';
import { PhasedLessonController } from './phased-lesson-controller';
import { buildPickWordPromptText, buildRepeatAfterMePrompt, buildRepeatAfterMeScoring, getRetryPrompt, isRepeatAfterMeCorrect } from './legacy-teaching';

/** Adapts the existing pipeline and owns its historical teaching policies. */
export class LegacyClassroom implements Classroom {
  private phased: PhasedLessonController;
  private listeners = new Map<keyof ClassroomEvents, Set<(data: never) => void>>();
  private cleared = new Set<string>();
  private generation = 0;
  private activeQuiz: string | null = null;
  private saving = false;
  private retries = new Map<string, number>();
  private pending: { quizId: string; answer: string; correct: boolean; source: QuizResult['source'] } | null = null;

  constructor(private course: Course, private engine = new LessonController()) {
    this.phased = new PhasedLessonController(engine, course);
    for (const event of ['state', 'subtitle', 'subtitle-clear', 'error'] as const) {
      engine.on(event, (data: ClassroomEvents[typeof event]) => this.emit(event, data));
    }
    engine.on('progress', (data: ClassroomEvents['progress']) => {
      this.cleared = new Set(data.clearedCardIds);
      this.emit('progress', data);
    });
    engine.on('actions', (actions: ClassroomEvents['actions']) => {
      // Only the original pipeline forbids redisplaying a mastered word or its sentence.
      const cards = this.course.cards;
      const filtered = actions.filter((action) => {
        const card = cards.find((item) => item.id === action.params.card_id);
        if (!card) return false;
        const word = card.kind === 'word' ? card : cards.find((item) => item.kind === 'word'
          && (card.id === `sentence_${item.id}` || card.imageUrl === item.imageUrl));
        return !word || !this.cleared.has(word.id);
      });
      this.emit('actions', filtered);
    });
    engine.on('asr-final', (data: { text: string }) => {
      this.emit('asr-final', data);
      if (!this.activeQuiz || this.saving) return;
      const quiz = findQuiz(this.course, this.activeQuiz);
      if (quiz.type !== 'repeat-after-me') return;
      void this.saveAnswer({ quizId: quiz.id, answer: data.text,
        correct: isRepeatAfterMeCorrect(buildRepeatAfterMeScoring(quiz, this.course), data.text), source: 'legacy-asr' });
    });
    for (const event of ['phase-change', 'transition-retry-change', 'intro-busy-change', 'intro-active-card-change'] as const) {
      this.phased.on(event, (data: ClassroomEvents[typeof event]) => {
        if (event === 'phase-change') this.activeQuiz = null;
        this.emit(event, data);
      });
    }
  }

  on<K extends keyof ClassroomEvents>(event: K, fn: (data: ClassroomEvents[K]) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn as (data: never) => void);
  }
  off<K extends keyof ClassroomEvents>(event: K, fn: (data: ClassroomEvents[K]) => void): void {
    this.listeners.get(event)?.delete(fn as (data: never) => void);
  }
  private emit<K extends keyof ClassroomEvents>(event: K, data: ClassroomEvents[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(data as never));
  }
  getState() { return this.engine.getState(); }
  getResumeInfo() { return this.phased.getResumeInfo(); }
  async startLesson(learnerId: string, options?: { fresh?: boolean }): Promise<boolean> {
    const generation = ++this.generation;
    this.activeQuiz = null; this.pending = null; this.saving = false; this.retries.clear(); this.cleared.clear();
    const ok = await this.phased.startLesson(learnerId, options);
    if (generation !== this.generation) return false;
    if (ok) this.cleared = new Set(this.getResumeInfo()?.clearedCardIds);
    return ok;
  }
  async endLesson(): Promise<void> {
    ++this.generation;
    this.activeQuiz = null; this.pending = null;
    await this.phased.endLesson();
  }
  startListening() { return this.engine.startListening(); }
  stopListening() { return this.engine.stopListening(); }
  requestIntroCard(cardId: string) { return this.phased.requestIntroCard(cardId); }
  retryTransition() { return this.phased.retryTransition(); }
  completeReinforcement() { return this.phased.completeReinforcement(); }

  async repeatCard(cardId: string): Promise<void> {
    const card = this.course.cards.find((item) => item.id === cardId);
    if (!card || this.getState() !== 'awaiting') return;
    await this.engine.sendCustomAction({ action: 'message', system: true, text: [
      `(孩子刚刚没听清,请重新介绍当前卡片 ${card.id}: ${card.english} / ${card.chinese})`,
      '必须先 show_card 当前卡片,不要切换到其它卡。',
      '这不是孩子的一次回答,不要输出 attempt_assessment,不要推进到下一张卡。',
      card.kind === 'sentence' ? '请慢慢示范这个短句,再请孩子跟读。' : '请用中文解释这个词,慢慢读英文,再请孩子跟读。',
    ].join(' ') });
  }
  async presentQuiz(quizId: string): Promise<void> {
    const quiz = findQuiz(this.course, quizId);
    this.activeQuiz = quizId;
    await this.engine.speakStatic(quiz.type === 'pick-word'
      ? buildPickWordPromptText(quiz, this.course) : buildRepeatAfterMePrompt(quiz.targetText));
  }
  async startQuizListening(quizId: string): Promise<void> {
    const quiz = findQuiz(this.course, quizId);
    if (quiz.type !== 'repeat-after-me' || this.saving) return;
    this.activeQuiz = quizId;
    const otherTargets = this.course.phases.reinforcement.quizzes
      .filter((item) => item.type === 'repeat-after-me' && item.targetText !== quiz.targetText)
      .map((item) => item.type === 'repeat-after-me' ? item.targetText : '');
    await this.engine.startListening({ routeToChat: false, asrSentenceTexts: [quiz.targetText, ...otherTargets] });
  }
  async submitPick(quizId: string, picked: string): Promise<void> {
    const quiz = findQuiz(this.course, quizId);
    if (quiz.type !== 'pick-word' || this.saving) return;
    this.activeQuiz = quizId;
    await this.saveAnswer({ quizId, answer: picked, correct: picked === quiz.correctCardId, source: 'application' });
  }
  async retryQuiz(quizId: string): Promise<void> {
    if (this.pending?.quizId === quizId) await this.saveAnswer(this.pending);
  }
  private async saveAnswer(answer: NonNullable<LegacyClassroom['pending']>): Promise<void> {
    if (this.saving) return;
    const generation = this.generation;
    this.saving = true;
    this.emit('quiz-saving', true);
    this.pending = answer;
    const saved = await this.engine.submitQuizAnswer(answer.quizId, answer.answer, answer.correct);
    if (generation !== this.generation) return;
    let next: QuizResult['next'] = 'retry';
    if (saved.ok) {
      this.pending = null;
      const retries = this.retries.get(answer.quizId) ?? 0;
      if (answer.correct || retries >= 2) next = 'advance';
      else {
        await this.engine.speakStatic(`再听一次: ${getRetryPrompt(findQuiz(this.course, answer.quizId))}`).catch(() => {});
        if (generation !== this.generation) return;
        this.retries.set(answer.quizId, retries + 1);
      }
    }
    this.saving = false;
    this.emit('quiz-saving', false);
    this.emit('quiz-result', { quizId: answer.quizId, ok: saved.ok, correct: answer.correct, source: answer.source, next });
  }
}
