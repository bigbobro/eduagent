import { randomUUID } from 'node:crypto';
import { getDb } from './index';

export interface Learner { id: string; name: string; avatar: string | null; createdAt: string }
const select = 'SELECT id, name, avatar, created_at AS createdAt FROM learners';
export function listLearners(): Learner[] {
  return getDb().prepare(`${select} ORDER BY created_at, id`).all() as Learner[];
}
export function getLearner(id: string): Learner | undefined {
  return getDb().prepare(`${select} WHERE id = ?`).get(id) as Learner | undefined;
}
export function createLearner(name: string): Learner {
  const id = randomUUID();
  getDb().prepare('INSERT INTO learners (id, name, created_at) VALUES (?, ?, ?)').run(id, name, new Date().toISOString());
  return getLearner(id)!;
}
export function renameLearner(id: string, name: string): Learner | undefined {
  getDb().prepare('UPDATE learners SET name = ? WHERE id = ?').run(name, id);
  return getLearner(id);
}
export function deleteLearner(id: string): boolean {
  const db = getDb();
  return db.transaction(() => {
    if (!getLearner(id)) return false;
    for (const table of ['interaction_logs', 'word_performance']) {
      db.prepare(`DELETE FROM ${table} WHERE lesson_id IN (SELECT id FROM lesson_logs WHERE learner_id = ?)`).run(id);
    }
    db.prepare('DELETE FROM course_progress WHERE learner_id = ?').run(id);
    db.prepare('DELETE FROM lesson_logs WHERE learner_id = ?').run(id);
    db.prepare('DELETE FROM learners WHERE id = ?').run(id);
    return true;
  })();
}
