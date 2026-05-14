'use client';

import { Course, PhaseName } from '@/types/course';
import { ToolAction } from '@/types/tools';
import { LessonController } from './lesson-controller';

export type { PhaseName } from '@/types/course';

type EventName = 'phase-change';
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
  private introFollowupCount = 0;
  private static readonly INTRO_IDLE_MS = 3000;
  private static readonly MAX_INTRO_FOLLOWUPS = 2;

  constructor(
    private v2: LessonController,
    private course: Course,
  ) {
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

  async startLesson(): Promise<void> {
    await this.v2.startLesson(this.course.id);
  }

  async endLesson(): Promise<void> {
    if (this.introIdleTimer) {
      clearTimeout(this.introIdleTimer);
      this.introIdleTimer = null;
    }
    this.v2.off('actions', this.onV2Actions);
    this.v2.off('progress', this.onV2Progress);
    this.v2.off('state', this.onV2State);
    await this.v2.endLesson();
    this.currentPhase = 'done';
  }

  async completeReinforcement(): Promise<void> {
    this.currentPhase = 'done';
    this.emit('phase-change', 'done');
  }

  private emit(event: EventName, data: any): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  private onV2Actions = (actions: ToolAction[]) => {
    if (this.currentPhase !== 'intro') return;
    for (const action of actions) {
      if (action.tool === 'show_card') {
        this.introducedCardIds.add(action.params.card_id);
      }
    }
    this.maybeArmTransition();
  };

  private onV2Progress = (snapshot: ProgressSnapshot) => {
    this.lastSnapshot = snapshot;
    this.maybeArmTransition();
  };

  private onV2State = (state: string) => {
    if (state !== 'awaiting') {
      if (this.introIdleTimer) {
        clearTimeout(this.introIdleTimer);
        this.introIdleTimer = null;
      }
      return;
    }

    if (this.pendingTransition) {
      const target = this.pendingTransition;
      this.pendingTransition = null;
      void this.performTransition(target);
      return;
    }

    if (this.currentPhase === 'intro' && this.introducedCardIds.size < this.course.cards.length) {
      this.armIntroIdleTimer();
    }
  };

  private armIntroIdleTimer(): void {
    if (this.introIdleTimer) clearTimeout(this.introIdleTimer);
    this.introIdleTimer = setTimeout(() => {
      this.introIdleTimer = null;
      if (this.currentPhase !== 'intro') return;
      if (this.introducedCardIds.size >= this.course.cards.length) return;
      if (this.introFollowupCount >= PhasedLessonController.MAX_INTRO_FOLLOWUPS) {
        void this.performTransition('interactive');
        return;
      }
      this.introFollowupCount += 1;
      void this.v2.sendCustomAction({
        action: 'message',
        text: '(请继续介绍下一张 card,直到全部介绍完)',
      });
    }, PhasedLessonController.INTRO_IDLE_MS);
  }

  private maybeArmTransition(): void {
    if (this.pendingTransition) return;
    if (this.currentPhase === 'intro') {
      if (this.introducedCardIds.size >= this.course.cards.length) {
        this.pendingTransition = 'interactive';
      }
      return;
    }

    if (this.currentPhase === 'interactive' && this.lastSnapshot) {
      const allCleared = this.lastSnapshot.clearedCardIds.length >= this.course.cards.length;
      const maxAttemptsReached = this.lastSnapshot.totalAttempts >= 3 * this.course.cards.length;
      if (allCleared || maxAttemptsReached) {
        this.pendingTransition = 'reinforcement';
      }
    }
  }

  private async performTransition(to: PhaseName): Promise<void> {
    this.currentPhase = to;
    this.emit('phase-change', to);
    await this.v2.sendCustomAction({ action: 'phase-transition', to });
  }
}
