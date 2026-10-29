import type { Course, PhaseName } from '@/types/course';
import type { LessonMemory, TokenUsage } from '@/types/session';

export interface Session {
  id: string;
  mode?: 'legacy' | 'realtime';
  lifetime: AbortController;
  courseId: string;
  learnerId: string;
  course: Course;
  memory: LessonMemory;
  tokenUsage: TokenUsage;
  lessonInteractionCount: number;
  revision: number;
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
    for (const [id, previous] of Array.from(this.sessions)) {
      if (id !== session.id && previous.learnerId === session.learnerId && previous.courseId === session.courseId) {
        previous.lifetime.abort();
        this.sessions.delete(id);
      }
    }
    this.sessions.set(session.id, session);
  }

  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }
}

const globals = globalThis as typeof globalThis & { __eduagentSessions?: InMemorySessionStore };
export const sessionStore = globals.__eduagentSessions ??= new InMemorySessionStore();
