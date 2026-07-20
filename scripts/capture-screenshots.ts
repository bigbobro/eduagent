/**
 * Capture README screenshots from a running dev server.
 *
 *   VOICE_MOCK=true pnpm dev            # in another terminal
 *   pnpm screenshots
 *
 * Deterministic and repeatable: rerun after UI changes instead of hand-cropping.
 * Waits for fonts, images and the entrance animations to settle, otherwise the
 * paper-style pages capture mid-fade and come out washed out.
 */
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium, type Page } from 'playwright-core';

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';
const COURSE_ID = process.env.SMOKE_COURSE || 'animals';
const CHROME_PATH =
  process.env.SMOKE_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = join(process.cwd(), 'docs', 'screenshots');

/** Entrance animations run ~1.2s; fonts and card art must be decoded too. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map((img) => new Promise((res) => { img.onload = img.onerror = res; })),
    ),
  );
  await page.waitForTimeout(1800);
}

async function main(): Promise<void> {
  if (!existsSync(CHROME_PATH)) {
    console.error(`[shots] Chrome not found: ${CHROME_PATH}`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  // deviceScaleFactor stays at 1: a 1440-wide PNG is already more than GitHub
  // renders a README at, and 2x quadruples the bytes committed to the repo.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    permissions: ['microphone'],
  });
  const page = await context.newPage();

  const shoot = async (name: string) => {
    const path = join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path });
    console.log(`[shots] ${name}.png`);
  };

  await page.goto(`${BASE}/`);
  await settle(page);
  await shoot('01-home');

  await page.goto(`${BASE}/lesson/${COURSE_ID}`);
  await settle(page);
  await shoot('02-lesson-preview');

  await page.getByRole('button', { name: /我们开始吧/ }).click();
  await page.getByRole('button', { name: /按住 Space 跟我读/ }).waitFor({ state: 'visible', timeout: 15000 });
  await settle(page);
  await shoot('03-lesson-teaching');

  await page.goto(`${BASE}/journal`);
  await settle(page);
  await shoot('04-journal');

  await browser.close();
  console.log(`[shots] done -> ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('[shots] failed:', err);
  process.exit(1);
});
