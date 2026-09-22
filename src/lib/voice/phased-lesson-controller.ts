'use client';

import { Course, PhaseName } from '@/types/course';
import { ToolAction } from '@/types/tools';
import { LessonController } from './lesson-controller';
import type { ResumeInfo, LessonProgressSnapshot } from '@/lib/lesson-protocol';

export type { PhaseName } from '@/types/course';

type EventName = 'phase-change' | 'intro-busy-change' | 'intro-active-card-change' | 'transition-retry-change';
type Listener<T = any> = (data: T) => void;

export class PhasedLessonController {
  private listeners = new Map<EventName, Set<Listener>>();
  private generation = 0;
  private closed = false;
  private currentPhase: PhaseName = 'intro';
  private lastSnapshot: LessonProgressSnapshot | null = null;
  private pendingTransition: PhaseName | null = null;
  private failedTransition: PhaseName | null = null;
  private starting = false;
  private transitionInFlight: Promise<void> | null = null;
  private introStartupUnlockTimer: ReturnType<typeof setTimeout> | null = null;
  private introBusy = false;
  private introActiveCardId: string | null = null;
  // R1 (2026-07-20 session persistence): populated from LessonController.getResumeInfo() once
  // startLesson() detects the server resumed an incomplete course_progress breakpoint.
  private resumeInfo: ResumeInfo | null = null;
  private readonly wordCardIds: Set<string>;
  private readonly wordCardCount: number;
  private static readonly INTRO_STARTUP_UNLOCK_MS = 7000;

  constructor(
    private v2: LessonController,
    private course: Course,
  ) {
    const wordCards = course.cards.filter((card) => card.kind === 'word');
    this.wordCardIds = new Set(wordCards.map((card) => card.id));
    this.wordCardCount = wordCards.length;
    this.v2.on('actions', this.onV2Actions);
    this.v2.on('progress', this.onV2Progress);
    this.v2.on('state', this.onV2State);
  }

  on(event: EventName, fn: Listener): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off(event: EventName, fn: Listener): void {
    this.listeners.get(event)?.delete(fn);
  }

  getCurrentPhase(): PhaseName {
    return this.currentPhase;
  }

  isIntroBusy(): boolean {
    return this.introBusy;
  }

  getIntroActiveCardId(): string | null {
    return this.introActiveCardId;
  }

  /** R1 (2026-07-20): non-null only after startLesson() resolved into a resumed session. */
  getResumeInfo(): ResumeInfo | null {
    return this.resumeInfo;
  }

  async startLesson(): Promise<boolean> {
    const generation = ++this.generation;
    this.closed = false;
    this.currentPhase = 'intro';
    this.resumeInfo = null;
    this.lastSnapshot = null;
    this.setIntroActiveCardId(null);
    this.failedTransition = null;
    this.pendingTransition = null;
    this.transitionInFlight = null;
    this.v2.on('actions', this.onV2Actions);
    this.v2.on('progress', this.onV2Progress);
    this.v2.on('state', this.onV2State);
    this.starting = true;
    this.setIntroBusy(true);
    this.armIntroStartupUnlockTimer();
    try {
      const started = await this.v2.startLesson(this.course.id);
      if (this.closed || generation !== this.generation) return false;
      if (started === false) {
        this.clearIntroStartupUnlockTimer();
        if (this.currentPhase === 'intro') this.setIntroBusy(false);
        return false;
      }
      this.applyResumeInfo(this.v2.getResumeInfo());
      this.starting = false;
      if (this.v2.getState() === 'awaiting') this.onV2State('awaiting');
      return true;
    } catch {
      if (this.closed || generation !== this.generation) return false;
      this.clearIntroStartupUnlockTimer();
      if (this.currentPhase === 'intro') this.setIntroBusy(false);
      return false;
    } finally {
      if (generation === this.generation) this.starting = false;
    }
  }

  // R1 (2026-07-20 session persistence): jump straight to the resumed phase instead of the
  // default intro→interactive auto-transition (onV2State), and seed a progress baseline so
  // maybeArmTransition already knows about previously-cleared cards before the first real
  // `progress` event arrives. phase:'intro' (the very-first-turn-only edge case, see
  // course-progress.ts resolveResumeCardId) is a harmless no-op — it matches the constructor
  // default and the normal intro flow still applies.
  private applyResumeInfo(resume: ResumeInfo | null): void {
    if (!resume?.resumed) return;
    this.resumeInfo = resume;
    this.clearIntroStartupUnlockTimer();
    const resumedPhase = resume.phase;
    this.currentPhase = resumedPhase;
    this.setIntroBusy(false);
    this.setIntroActiveCardId(null);
    this.lastSnapshot = {
      clearedCardIds: resume.clearedCardIds,
      totalAttempts: 0,
      currentPhase: resumedPhase,
    };
    this.emit('phase-change', resumedPhase);
  }

  async endLesson(): Promise<void> {
    this.closed = true;
    const generation = ++this.generation;
    this.pendingTransition = null;
    this.failedTransition = null;
    if (this.introStartupUnlockTimer) {
      clearTimeout(this.introStartupUnlockTimer);
      this.introStartupUnlockTimer = null;
    }
    this.v2.off('actions', this.onV2Actions);
    this.v2.off('progress', this.onV2Progress);
    this.v2.off('state', this.onV2State);
    await this.v2.endLesson();
    if (generation !== this.generation) return;
    this.currentPhase = 'done';
    this.resumeInfo = null;
    this.setIntroBusy(false);
    this.setIntroActiveCardId(null);
  }

  async completeReinforcement(): Promise<void> {
    if (this.closed) return;
    this.currentPhase = 'done';
    this.setIntroBusy(false);
    this.setIntroActiveCardId(null);
    this.emit('phase-change', 'done');
  }

  async requestIntroCard(cardId: string): Promise<boolean> {
    const generation = this.generation;
    if (this.closed) return false;
    if (this.currentPhase !== 'intro') return false;
    if (this.introBusy) return false;
    if (this.v2.getState() !== 'awaiting') return false;

    this.clearIntroStartupUnlockTimer();
    this.setIntroBusy(true);
    this.setIntroActiveCardId(cardId);
    try {
      const result = await this.v2.sendCustomAction({
        action: 'message',
        text: `(请介绍 ${cardId})`,
      });
      return !this.closed && generation === this.generation && result.ok;
    } finally {
      if (!this.closed && generation === this.generation && this.currentPhase === 'intro' && this.v2.getState() === 'awaiting') {
        this.setIntroBusy(false);
      }
    }
  }

  private emit(event: EventName, data: any): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  private setIntroBusy(busy: boolean): void {
    if (this.introBusy === busy) return;
    this.introBusy = busy;
    this.emit('intro-busy-change', busy);
  }

  private setIntroActiveCardId(cardId: string | null): void {
    if (this.introActiveCardId === cardId) return;
    this.introActiveCardId = cardId;
    this.emit('intro-active-card-change', cardId);
  }

  private onV2Actions = (actions: ToolAction[]) => {
    if (this.closed) return;
    if (this.currentPhase !== 'intro') return;
    for (const action of actions) {
      if (action.tool === 'show_card' && this.wordCardIds.has(action.params.card_id)) {
        this.setIntroActiveCardId(action.params.card_id);
      }
    }
  };

  private onV2Progress = (snapshot: LessonProgressSnapshot) => {
    if (this.closed) return;
    this.lastSnapshot = snapshot;
    this.maybeArmTransition();
    if (!this.starting && !this.transitionInFlight && !this.failedTransition && this.pendingTransition && this.v2.getState() === 'awaiting') {
      const target = this.pendingTransition;
      this.pendingTransition = null;
      void this.performTransition(target);
    }
  };

  private onV2State = (state: string) => {
    if (this.closed) return;
    if (this.currentPhase === 'intro') {
      this.setIntroBusy(state !== 'awaiting');
    }

    if (this.starting || this.transitionInFlight || this.failedTransition || state !== 'awaiting') {
      return;
    }
    this.clearIntroStartupUnlockTimer();
    this.setIntroActiveCardId(null);

    if (this.pendingTransition) {
      const target = this.pendingTransition;
      this.pendingTransition = null;
      void this.performTransition(target);
      return;
    }

    if (this.currentPhase === 'intro') {
      void this.performTransition('interactive');
    }
  };

  private armIntroStartupUnlockTimer(): void {
    const generation = this.generation;
    this.clearIntroStartupUnlockTimer();
    this.introStartupUnlockTimer = setTimeout(() => {
      if (this.closed || generation !== this.generation) return;
      this.introStartupUnlockTimer = null;
      if (this.currentPhase === 'intro' && this.introBusy) {
        this.setIntroBusy(false);
      }
    }, PhasedLessonController.INTRO_STARTUP_UNLOCK_MS);
  }

  private clearIntroStartupUnlockTimer(): void {
    if (!this.introStartupUnlockTimer) return;
    clearTimeout(this.introStartupUnlockTimer);
    this.introStartupUnlockTimer = null;
  }

  private maybeArmTransition(): void {
    if (this.pendingTransition) return;
    if (this.currentPhase === 'intro') return;

    if (this.currentPhase === 'interactive' && this.lastSnapshot) {
      const clearedWordCount = this.lastSnapshot.clearedCardIds.filter((id) => this.wordCardIds.has(id)).length;
      // allWordsDone: server-side "cleared + parked-after-retry" completion (F3 escape
      // valve). Falls back to the cleared count for older snapshots without the field.
      const allCleared = clearedWordCount >= this.wordCardCount || this.lastSnapshot.allWordsDone === true;
      const maxAttemptsReached = this.lastSnapshot.totalAttempts >= 3 * this.wordCardCount;
      if (allCleared || maxAttemptsReached) {
        this.pendingTransition = 'reinforcement';
      }
    }
  }

  async retryTransition(): Promise<void> {
    if (this.closed || !this.failedTransition || this.transitionInFlight) return;
    await this.performTransition(this.failedTransition);
  }

  private async performTransition(to: PhaseName): Promise<void> {
    if (this.transitionInFlight) return this.transitionInFlight;
    // Publish the in-flight guard before sending: synchronous state callbacks must not retry.
    const generation = this.generation;
    const run = Promise.resolve().then(() => this.performTransitionNow(to, generation));
    this.transitionInFlight = run;
    try {
      await run;
    } finally {
      if (this.transitionInFlight === run) this.transitionInFlight = null;
    }
  }

  private async performTransitionNow(to: PhaseName, generation: number): Promise<void> {
    if (this.closed || generation !== this.generation) return;
    const result = await this.v2.sendCustomAction({ action: 'phase-transition', to });
    if (this.closed || generation !== this.generation) return;
    this.failedTransition = result.ok ? null : to;
    this.emit('transition-retry-change', this.failedTransition !== null);
    if (result.acceptedPhase) {
      this.currentPhase = result.acceptedPhase;
      this.setIntroBusy(false);
      this.setIntroActiveCardId(null);
      this.emit('phase-change', this.currentPhase);
    }
  }
}
