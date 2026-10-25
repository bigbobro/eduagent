// The current profile is a local UI preference, never an authentication token.
export const CURRENT_LEARNER_KEY = 'eduagent.currentLearnerId';
export interface LearnerProfile { id: string; name: string; avatar: string | null; createdAt: string }
export function readCurrentLearnerId(): string | null {
  try { return localStorage.getItem(CURRENT_LEARNER_KEY) || null; } catch { return null; }
}
export function saveCurrentLearnerId(id: string | null): void {
  if (readCurrentLearnerId() === id) return;
  try {
    if (id) localStorage.setItem(CURRENT_LEARNER_KEY, id);
    else localStorage.removeItem(CURRENT_LEARNER_KEY);
  } catch { /* The in-page selection still works when storage is unavailable. */ }
  window.dispatchEvent(new Event('eduagent:learner-change'));
}
export async function loadLearners(): Promise<LearnerProfile[]> {
  const res = await fetch('/api/learners');
  if (!res.ok) throw new Error('暂时读不到孩子档案');
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error('孩子档案格式不正确');
  return data;
}
export function selectedLearner(learners: LearnerProfile[]): LearnerProfile | undefined {
  return learners.length === 1 ? learners[0] : learners.find((l) => l.id === readCurrentLearnerId());
}
export async function resolveCurrentLearner(): Promise<LearnerProfile | undefined> {
  const learner = selectedLearner(await loadLearners());
  saveCurrentLearnerId(learner?.id ?? null);
  return learner;
}
