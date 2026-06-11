import { spawn, type ChildProcess } from 'child_process';
import { setTimeout as wait } from 'timers/promises';

const PORT = Number(process.env.SMOKE_PORT ?? 3001);
const BASE = `http://localhost:${PORT}`;

async function fetchOk(
  url: string,
  opts?: { contains?: string; jsonHas?: string[] },
): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ ${url} → ${res.status}`);
      return false;
    }
    const text = await res.text();
    if (opts?.contains && !text.includes(opts.contains)) {
      console.error(`❌ ${url} missing marker "${opts.contains}"`);
      return false;
    }
    if (opts?.jsonHas) {
      const json = JSON.parse(text);
      const isArr = Array.isArray(json);
      for (const key of opts.jsonHas) {
        if (isArr) continue;
        if (!(key in json)) {
          console.error(`❌ ${url} JSON missing field ${key}`);
          return false;
        }
      }
    }
    console.log(`✓ ${url}`);
    return true;
  } catch (e) {
    console.error(`❌ ${url} exception:`, e);
    return false;
  }
}

async function waitForServer(): Promise<boolean> {
  for (let i = 0; i < 60; i++) {
    await wait(1000);
    try {
      const r = await fetch(`${BASE}/`);
      if (r.status < 500) return true;
    } catch {
      // not yet
    }
  }
  return false;
}

const EXPECTED_COURSE_IDS = [
  'food',
  'colors',
  'sports',
  'animals',
  'family',
  'toys',
  'clothes',
  'weather',
  'body',
  'shapes',
  'home',
  'nature',
  'actions',
  'school',
  'fruits',
  'vegetables',
  'ocean',
  'farm',
  'jobs',
  'insects',
  'feelings',
  'playground',
  'opposites',
  'instruments',
  'party',
  'bathroom',
  'space',
  'hobbies',
  'magic',
  'treats',
  'tools',
  'city-places',
  'construction',
  'art-supplies',
  'technology',
  'tableware',
  'camping',
  'safety',
  'cleaning',
  'travel',
];

async function fetchCoursesCatalog(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/courses`);
    if (!res.ok) {
      console.error(`❌ ${BASE}/api/courses → ${res.status}`);
      return false;
    }
    const courses = await res.json();
    const ids = Array.isArray(courses) ? courses.map((course: { id?: string }) => course.id) : [];
    const ok = JSON.stringify(ids) === JSON.stringify(EXPECTED_COURSE_IDS);
    if (!ok) {
      console.error(`❌ ${BASE}/api/courses expected catalog ${EXPECTED_COURSE_IDS.join(', ')}, got:`, courses);
      return false;
    }
    console.log(`✓ ${BASE}/api/courses catalog`);
    return true;
  } catch (e) {
    console.error(`❌ ${BASE}/api/courses exception:`, e);
    return false;
  }
}

async function main() {
  let server: ChildProcess | null = null;
  try {
    console.log(`Starting dev server on :${PORT}...`);
    server = spawn('pnpm', ['run', 'dev'], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'inherit',
    });

    const up = await waitForServer();
    if (!up) {
      console.error(`❌ server did not start within 60s on :${PORT}`);
      process.exit(1);
    }

    const checks = [
      await fetchOk(`${BASE}/`),
      await fetchOk(`${BASE}/lesson/food`),
      await fetchOk(`${BASE}/lesson/food/done`),
      await fetchOk(`${BASE}/journal`),
      await fetchOk(`${BASE}/parents`),
      await fetchCoursesCatalog(),
      await fetchOk(`${BASE}/api/progress`, { jsonHas: ['courses', 'totalWordsMastered'] }),
      await fetchOk(`${BASE}/api/sessions`),
      await fetchOk(`${BASE}/api/stats`, { jsonHas: ['totalMinutes', 'last7Days'] }),
    ];

    const allOk = checks.every(Boolean);
    console.log(allOk ? '\n✅ smoke all pass' : '\n❌ smoke had failures');
    process.exit(allOk ? 0 : 1);
  } finally {
    if (server) server.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
