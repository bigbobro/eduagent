// Real packaged-app HTTP verification; no provider credentials or persistent user data.
// pnpm app:verify-images [desktop/dist/mac-arm64/EduAgent.app]
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright-core';
import { allCourses } from '../src/data/courses';

function imageUrls(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'imageUrl' && typeof child === 'string' ? [child] : imageUrls(child));
}

async function main() {
  const courses = allCourses.map((course) => ({ id: course.id, imageUrls: imageUrls(course) }));
  const urls = Array.from(new Set(courses.flatMap((course) => course.imageUrls)));
  assert(urls.length > 0, 'No course images found');
  const userData = mkdtempSync(join(tmpdir(), 'eduagent-images-'));
  const appPath = resolve(process.argv[2] || 'desktop/dist/mac-arm64/EduAgent.app');
  const evidence = resolve('desktop/dist/evidence');
  mkdirSync(evidence, { recursive: true });
  let app;
  try {
    app = await electron.launch({
      executablePath: join(appPath, 'Contents/MacOS/EduAgent'),
      env: { ...process.env, EDUAGENT_TEST: '1', EDUAGENT_TEST_MIC_STATUS: 'granted', EDUAGENT_USER_DATA: userData, VOICE_MOCK: 'true' },
      timeout: 60000,
    });
    const page = await app.firstWindow();
    await page.waitForURL(/http:\/\/127\.0\.0\.1:\d+\//, { timeout: 60000 });
    const origin = new URL(page.url()).origin;
    const results: { url: string; status: number; contentType: string; bytes: number }[] = [];
    for (const url of urls) {
      assert(url.startsWith('/images/') && url.endsWith('.png'), `Unexpected course image path: ${url}`);
      const response = await page.request.get(origin + url);
      const contentType = response.headers()['content-type']?.split(';')[0];
      assert.equal(response.status(), 200, `${url}: HTTP status`);
      assert.equal(contentType, 'image/webp', `${url}: content type`);
      const body = await response.body();
      assert.equal(body.toString('ascii', 0, 4), 'RIFF', `${url}: WebP RIFF header`);
      assert.equal(body.toString('ascii', 8, 12), 'WEBP', `${url}: WebP signature`);
      results.push({ url, status: response.status(), contentType, bytes: body.length });
    }
    // Check Chromium decoding, including intrinsic dimensions, through unchanged PNG URLs.
    await page.evaluate(async (paths) => {
      for (const path of paths) {
        const image = new Image();
        image.src = path;
        await image.decode();
        if (!image.naturalWidth || !image.naturalHeight) throw new Error(`Cannot decode ${path}`);
      }
    }, urls);
    writeFileSync(join(evidence, 'webp-verification.json'), JSON.stringify({
      appPath, courses, references: courses.reduce((n, course) => n + course.imageUrls.length, 0),
      uniqueImages: urls.length, results, browserDecoded: urls.length,
    }, null, 2) + '\n');
    console.log(`[images] PASS: ${courses.length} courses, ${courses.reduce((n, course) => n + course.imageUrls.length, 0)} references, ${urls.length} unique images: HTTP 200 + image/webp + WebP signature + Chromium decode`);
  } finally {
    try { if (app) await app.close(); }
    finally { rmSync(userData, { recursive: true, force: true }); }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
