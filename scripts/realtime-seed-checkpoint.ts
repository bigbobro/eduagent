/** Test-only: writes a resumable checkpoint (all but two words and one question of each type done) into DATABASE_PATH. */
import { getCourseById } from '../src/data/courses';
import { createMemory, initializeCardProgress } from '../src/lib/agent/memory';
import { serializeProgress } from '../src/lib/agent/course-progress';
import { upsertCourseProgress } from '../src/lib/db/queries';
import { ensureInitialized } from '../src/lib/init';

const [courseId, learnerId] = process.argv.slice(2);
const course = getCourseById(courseId);
if (!course || !learnerId || !process.env.DATABASE_PATH?.includes('tmp')) throw new Error('Usage: DATABASE_PATH=<temporary test db> tsx realtime-seed-checkpoint.ts <courseId> <learnerId>');
ensureInitialized();
const memory = initializeCardProgress(createMemory(), course);
const words = course.cards.filter((card) => card.kind === 'word');
// SEED_REMAINING=<id,id> picks the two words left to teach (default: the last two), e.g. two cards that have a sound.
const picked = (process.env.SEED_REMAINING ?? '').split(',').filter(Boolean);
const left = picked.length ? words.filter((card) => picked.includes(card.id)) : words.slice(-2);
if (left.length !== 2) throw new Error('SEED_REMAINING needs two word card ids of this course');
for (const card of words.filter((w) => !left.includes(w))) {
  memory.cardProgress[card.id] = 'cleared'; memory.clearedCardIds.push(card.id); memory.wordsLearned.push(card.english);
}
const quizzes = course.phases.reinforcement.quizzes;
const keep = [quizzes.find((q) => q.type === 'pick-word'), quizzes.find((q) => q.type === 'repeat-after-me')].map((q) => q?.id);
memory.passedQuizIds = quizzes.map((q) => q.id).filter((id) => !keep.includes(id));
const next = left[0]; memory.currentCardId = next.id; memory.currentWord = next.english;
upsertCourseProgress(course.id, serializeProgress(memory), 'interactive', false, learnerId);
console.log(`[seed] ${course.id}: ${memory.clearedCardIds.length}/${words.length} words, ${memory.passedQuizIds.length}/${quizzes.length} questions; remaining ${left.map((w) => w.id).join(', ')} and ${keep.join(', ')}`);
