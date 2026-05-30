import type { Course, PhaseName } from '@/types/course';
import type { LessonMemory, TokenUsage } from '@/types/session';

export interface Session {
  id: string;
  courseId: string;
  course: Course;
  memory: LessonMemory;
  tokenUsage: TokenUsage;
  startTime: Date;
  currentPhase: PhaseName;
}

export interface SessionStore {
  get(sessionId: string): Session | undefined;
  save(session: Session): void;
  delete(sessionId: string): boolean;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  save(session: Session): void {
    this.sessions.set(session.id, session);
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }
}

export const sessionStore = new InMemorySessionStore();
