// 由 desktop/build-resources/icon-source.png(1024 方图,image_gen 水彩原画)生成 macOS 图标 icon.icns:
// 按 macOS 图标网格(1024 画布、824 主体、圆角约 22.4%)加圆角和轻投影,再用 iconutil 打包。
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const res = fileURLToPath(new URL('../build-resources/', import.meta.url));
const src = readFileSync(join(res, 'icon-source.png')).toString('base64');
const tmp = mkdtempSync(join(tmpdir(), 'eduagent-icon-'));
const master = join(tmp, 'master.png');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">
  <div style="position:absolute;left:100px;top:100px;width:824px;height:824px;border-radius:185px;overflow:hidden;
    box-shadow:0 10px 24px rgba(0,0,0,.28),0 0 0 1px rgba(0,0,0,.08)">
    <img src="data:image/png;base64,${src}" style="width:100%;height:100%;display:block"></div></body></html>`);
await page.screenshot({ path: master, omitBackground: true });
await browser.close();

const set = join(tmp, 'icon.iconset');
execFileSync('mkdir', ['-p', set]);
for (const s of [16, 32, 128, 256, 512]) {
  execFileSync('sips', ['-z', String(s), String(s), master, '--out', join(set, `icon_${s}x${s}.png`)], { stdio: 'ignore' });
  execFileSync('sips', ['-z', String(s * 2), String(s * 2), master, '--out', join(set, `icon_${s}x${s}@2x.png`)], { stdio: 'ignore' });
}
execFileSync('iconutil', ['-c', 'icns', set, '-o', join(res, 'icon.icns')]);
rmSync(tmp, { recursive: true, force: true });
console.log('[icon] desktop/build-resources/icon.icns');
