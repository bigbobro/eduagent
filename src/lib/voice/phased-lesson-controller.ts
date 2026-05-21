'use client';

import { Course, PhaseName } from '@/types/course';
import { ToolAction } from '@/types/tools';
import { LessonController } from './lesson-controller';

export type { PhaseName } from '@/types/course';

type EventName = 'phase-change' | 'intro-busy-change' | 'intro-active-card-change';
type Listener<T = any> = (data: T) => void;

interface ProgressSnapshot {
  clearedCardIds: string[];
  totalAttempts: number;
  currentPhase: PhaseName | null;
}

export class PhasedLessonController {
  private listeners = new Map<EventName, Set<Listener>>();
  private currentPhase: PhaseName = 'intro';
  private introducedCardIds = new Set<string>();
  private lastSnapshot: ProgressSnapshot | null = null;
  private pendingTransition: PhaseName | null = null;
  private introIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private introStartupUnlockTimer: ReturnType<typeof setTimeout> | null = null;
  private introFollowupCount = 0;
  private introBusy = false;
  private introActiveCardId: string | null = null;
  private readonly wordCardIds: Set<string>;
  private readonly wordCardCount: number;
  private static readonly INTRO_IDLE_MS = 3000;
  private static readonly INTRO_STARTUP_UNLOCK_MS = 7000;
  private static readonly MAX_INTRO_FOLLOWUPS = 2;

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

  async startLesson(): Promise<void> {
    this.setIntroBusy(true);
    this.armIntroStartupUnlockTimer();
    try {
      await this.v2.startLesson(this.course.id);
    } catch {
      if (this.currentPhase === 'intro') this.setIntroBusy(false);
    }
  }

  async endLesson(): Promise<void> {
    if (this.introIdleTimer) {
      clearTimeout(this.introIdleTimer);
      this.introIdleTimer = null;
    }
    if (this.introStartupUnlockTimer) {
      clearTimeout(this.introStartupUnlockTimer);
      this.introStartupUnlockTimer = null;
    }
    this.v2.off('actions', this.onV2Actions);
    this.v2.off('progress', this.onV2Progress);
    this.v2.off('state', this.onV2State);
    await this.v2.endLesson();
    this.currentPhase = 'done';
    this.setIntroBusy(false);
    this.setIntroActiveCardId(null);
  }

  async completeReinforcement(): Promise<void> {
    this.currentPhase = 'done';
    this.setIntroBusy(false);
    this.setIntroActiveCardId(null);
    this.emit('phase-change', 'done');
  }

  async requestIntroCard(cardId: string): Promise<boolean> {
    if (this.currentPhase !== 'intro') return false;
    if (this.introBusy) return false;
    if (this.v2.getState() !== 'awaiting') return false;

    this.clearIntroStartupUnlockTimer();
    this.setIntroBusy(true);
    this.setIntroActiveCardId(cardId);
    try {
      await this.v2.sendCustomAction({
        action: 'message',
        text: `(请介绍 ${cardId})`,
      });
    } finally {
      if (this.currentPhase === 'intro' && this.v2.getState() === 'awaiting') {
        this.setIntroBusy(false);
      }
    }
    return true;
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
    if (this.currentPhase !== 'intro') return;
    for (const action of actions) {
      if (action.tool === 'show_card' && this.wordCardIds.has(action.params.card_id)) {
        this.introducedCardIds.add(action.params.card_id);
        this.setIntroActiveCardId(action.params.card_id);
      }
    }
    this.maybeArmTransition();
  };

  private onV2Progress = (snapshot: ProgressSnapshot) => {
    this.lastSnapshot = snapshot;
    this.maybeArmTransition();
  };

  private onV2State = (state: string) => {
    if (this.currentPhase === 'intro') {
      this.setIntroBusy(state !== 'awaiting');
    }

    if (state !== 'awaiting') {
      if (this.introIdleTimer) {
        clearTimeout(this.introIdleTimer);
        this.introIdleTimer = null;
      }
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

    if (this.currentPhase === 'intro' && this.introducedCardIds.size < this.wordCardCount) {
      this.armIntroIdleTimer();
    }
  };

  private armIntroIdleTimer(): void {
    if (this.introIdleTimer) clearTimeout(this.introIdleTimer);
    this.introIdleTimer = setTimeout(() => {
      this.introIdleTimer = null;
      if (this.currentPhase !== 'intro') return;
      if (this.introducedCardIds.size >= this.wordCardCount) return;
      if (this.introFollowupCount >= PhasedLessonController.MAX_INTRO_FOLLOWUPS) {
        void this.performTransition('interactive');
        return;
      }
      this.introFollowupCount += 1;
      this.setIntroBusy(true);
      void this.v2.sendCustomAction({
        action: 'message',
        text: '(请继续介绍下一张 card,直到全部介绍完)',
      });
    }, PhasedLessonController.INTRO_IDLE_MS);
  }

  private armIntroStartupUnlockTimer(): void {
    this.clearIntroStartupUnlockTimer();
    this.introStartupUnlockTimer = setTimeout(() => {
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
    if (this.currentPhase === 'intro') {
      if (this.introducedCardIds.size >= this.wordCardCount) {
        this.pendingTransition = 'interactive';
      }
      return;
    }

    if (this.currentPhase === 'interactive' && this.lastSnapshot) {
      const clearedWordCount = this.lastSnapshot.clearedCardIds.filter((id) => this.wordCardIds.has(id)).length;
      const allCleared = clearedWordCount >= this.wordCardCount;
      const maxAttemptsReached = this.lastSnapshot.totalAttempts >= 3 * this.wordCardCount;
      if (allCleared || maxAttemptsReached) {
        this.pendingTransition = 'reinforcement';
      }
    }
  }

  private async performTransition(to: PhaseName): Promise<void> {
    this.currentPhase = to;
    this.setIntroBusy(true);
    this.setIntroActiveCardId(null);
    this.emit('phase-change', to);
    await this.v2.sendCustomAction({ action: 'phase-transition', to });
  }
}
