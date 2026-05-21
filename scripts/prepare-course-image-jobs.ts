import fs from 'fs';
import path from 'path';
import { allCourses } from '../src/data/courses';
import type { Course, WordCard } from '../src/types/course';

interface Options {
  courseIds: string[];
  outDir: string;
  missingOnly: boolean;
  audit: boolean;
  minBytes: number;
  maxBytes: number;
  maxDimension: number;
}

interface ImageJob {
  courseId: string;
  cardId: string;
  english: string;
  chinese: string;
  finalPath: string;
  prompt: string;
  cleanupRule: string;
}

const DEFAULT_OUT_DIR = 'tmp/imagegen';

function parseArgs(argv: string[]): Options {
  const options: Options = {
    courseIds: [],
    outDir: DEFAULT_OUT_DIR,
    missingOnly: false,
    audit: false,
    minBytes: 100_000,
    maxBytes: 800_000,
    maxDimension: 512,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      continue;
    } else if (arg === '--course') {
      const value = argv[i + 1];
      if (!value) throw new Error('--course requires a course id');
      options.courseIds.push(...value.split(',').map((id) => id.trim()).filter(Boolean));
      i += 1;
    } else if (arg === '--out-dir') {
      const value = argv[i + 1];
      if (!value) throw new Error('--out-dir requires a path');
      options.outDir = value;
      i += 1;
    } else if (arg === '--missing-only') {
      options.missingOnly = true;
    } else if (arg === '--audit') {
      options.audit = true;
    } else if (arg === '--min-bytes') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error('--min-bytes must be a non-negative integer');
      }
      options.minBytes = value;
      i += 1;
    } else if (arg === '--max-bytes') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error('--max-bytes must be a positive integer');
      }
      options.maxBytes = value;
      i += 1;
    } else if (arg === '--max-dimension') {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error('--max-dimension must be a positive integer');
      }
      options.maxDimension = value;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`Usage: pnpm course:image-jobs [-- --course food --missing-only]

Options:
  --course <id[,id]>      Limit to one or more registered courses.
  --out-dir <path>        JSONL output directory. Default: ${DEFAULT_OUT_DIR}
  --missing-only          Write jobs only for missing word-card PNG assets.
  --audit                 Report missing, tiny, oversized, over-dimensioned, and unreferenced course PNGs.
  --min-bytes <bytes>     Tiny asset threshold for --audit. Default: 100000
  --max-bytes <bytes>     Maximum PNG size for --audit. Default: 800000
  --max-dimension <px>    Maximum PNG width/height for --audit. Default: 512`);
}

function selectCourses(options: Options): Course[] {
  if (options.courseIds.length === 0) return allCourses;

  const coursesById = new Map(allCourses.map((course) => [course.id, course]));
  return options.courseIds.map((id) => {
    const course = coursesById.get(id);
    if (!course) throw new Error(`Unknown course id: ${id}`);
    return course;
  });
}

function assetPathFor(card: WordCard): string {
  return path.join(process.cwd(), 'public', card.imageUrl.replace(/^\//, ''));
}

function assetPublicPathFor(card: WordCard): string {
  return card.imageUrl.replace(/^\//, '');
}

function wordCardsForGeneration(course: Course): WordCard[] {
  return course.cards.filter((card) => card.kind === 'word');
}

function buildJob(course: Course, card: WordCard): ImageJob {
  return {
    courseId: course.id,
    cardId: card.id,
    english: card.english,
    chinese: card.chinese,
    finalPath: `public/${assetPublicPathFor(card)}`,
    prompt: [
      `Generate one standalone children's ESL flashcard illustration for the word "${card.english}" (${card.chinese}).`,
      'Simple clear single subject, centered and easy for a 3-6 year old to recognize.',
      'Soft watercolor storybook illustration, warm off-white paper background, gentle outline, square composition.',
      'No English text, no Chinese text, no letters, no border, no watermark, no photorealism, no 3D gloss, no neon.',
    ].join(' '),
    cleanupRule: 'After moving the generated file into finalPath, delete the source file under .codex/generated_images.',
  };
}

interface WrittenJobs {
  course: Course;
  jobPath: string;
  count: number;
}

function writeJobsForCourse(course: Course, options: Options): WrittenJobs | null {
  const jobs = wordCardsForGeneration(course)
    .filter((card) => !options.missingOnly || !fs.existsSync(assetPathFor(card)))
    .map((card) => buildJob(course, card));

  if (jobs.length === 0) {
    console.log(`No image jobs for ${course.id}.`);
    return null;
  }

  fs.mkdirSync(options.outDir, { recursive: true });
  const jobPath = path.join(options.outDir, `${course.id}.jsonl`);
  fs.writeFileSync(jobPath, `${jobs.map((job) => JSON.stringify(job)).join('\n')}\n`, 'utf8');

  console.log(`Wrote ${jobs.length} built-in image_gen job(s): ${jobPath}`);
  return { course, jobPath, count: jobs.length };
}

function readPngDimensions(absolutePath: string): { width: number; height: number } | null {
  const header = fs.readFileSync(absolutePath, { flag: 'r' }).subarray(0, 24);
  if (header.length < 24) return null;
  if (header.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  if (header.toString('ascii', 12, 16) !== 'IHDR') return null;
  return {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  };
}

function auditAssets(courses: Course[], options: Options): void {
  const missing: string[] = [];
  const tiny: string[] = [];
  const oversized: string[] = [];
  const overDimensioned: string[] = [];
  const invalid: string[] = [];
  const extra: string[] = [];
  const expectedByCourse = new Map<string, Set<string>>();
  const expectedPaths = new Set<string>();

  for (const course of courses) {
    const courseExpected = new Set<string>();
    expectedByCourse.set(course.id, courseExpected);

    for (const card of course.cards) {
      const publicPath = assetPublicPathFor(card);
      expectedPaths.add(publicPath);
      courseExpected.add(publicPath);
    }
  }

  let existing = 0;
  for (const publicPath of Array.from(expectedPaths)) {
    const absolutePath = path.join(process.cwd(), 'public', publicPath);
    if (!fs.existsSync(absolutePath)) {
      missing.push(publicPath);
      continue;
    }

    existing += 1;
    const size = fs.statSync(absolutePath).size;
    if (size < options.minBytes) tiny.push(`${publicPath} (${size} bytes)`);
    if (size > options.maxBytes) oversized.push(`${publicPath} (${size} bytes)`);

    const dimensions = readPngDimensions(absolutePath);
    if (!dimensions) {
      invalid.push(publicPath);
    } else if (dimensions.width > options.maxDimension || dimensions.height > options.maxDimension) {
      overDimensioned.push(`${publicPath} (${dimensions.width}x${dimensions.height})`);
    }
  }

  for (const course of courses) {
    const courseExpected = expectedByCourse.get(course.id) ?? new Set<string>();
    const courseDir = path.join(process.cwd(), 'public/images', course.id);
    if (!fs.existsSync(courseDir)) continue;
    for (const name of fs.readdirSync(courseDir)) {
      if (!name.endsWith('.png')) continue;
      const publicPath = `images/${course.id}/${name}`;
      if (!courseExpected.has(publicPath)) extra.push(publicPath);
    }
  }

  console.log(`Course image audit: expected=${expectedPaths.size} existing=${existing} missing=${missing.length} tiny=${tiny.length} oversized=${oversized.length} overDimensioned=${overDimensioned.length} invalid=${invalid.length} extra=${extra.length} minBytes=${options.minBytes} maxBytes=${options.maxBytes} maxDimension=${options.maxDimension}`);

  if (missing.length > 0) {
    console.log('\nMissing assets:');
    for (const item of missing) console.log(`- ${item}`);
  }
  if (tiny.length > 0) {
    console.log('\nTiny assets that should be regenerated:');
    for (const item of tiny) console.log(`- ${item}`);
  }
  if (oversized.length > 0) {
    console.log('\nOversized assets that should be optimized:');
    for (const item of oversized) console.log(`- ${item}`);
  }
  if (overDimensioned.length > 0) {
    console.log('\nOver-dimensioned assets that should be downscaled:');
    for (const item of overDimensioned) console.log(`- ${item}`);
  }
  if (invalid.length > 0) {
    console.log('\nInvalid PNG assets:');
    for (const item of invalid) console.log(`- ${item}`);
  }
  if (extra.length > 0) {
    console.log('\nUnreferenced course PNGs:');
    for (const item of extra) console.log(`- ${item}`);
  }

  if (missing.length > 0 || tiny.length > 0 || oversized.length > 0 || overDimensioned.length > 0 || invalid.length > 0 || extra.length > 0) {
    process.exitCode = 1;
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const courses = selectCourses(options);

  if (options.audit) {
    auditAssets(courses, options);
    return;
  }

  const writtenJobs = courses
    .map((course) => writeJobsForCourse(course, options))
    .filter((written): written is WrittenJobs => written !== null);
  const total = writtenJobs.reduce((sum, written) => sum + written.count, 0);
  console.log(`Total built-in image_gen jobs: ${total}`);
  console.log('Use Codex built-in image_gen for each JSONL prompt, then move the selected PNG to finalPath and delete the generated scratch source.');
}

main();
