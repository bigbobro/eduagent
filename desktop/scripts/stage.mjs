// 把 server 整理成可放进 .app/Contents/Resources/server 的自包含目录:
//   1. EDUAGENT_STANDALONE=1 next build  -> .next/standalone (只含 next 运行时需要的文件)
//   2. 把 pnpm 的符号链接 node_modules 摊平成真实目录(electron-builder 友好,也避免重复拷贝)
//   3. esbuild 把 server.ts 打成单个 eduagent-server.js(next 保持 external)
//   4. 手动补 public/ 与 .next/static(standalone 不会带)
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative, basename } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(root, 'desktop/build/server');
const require = createRequire(import.meta.url);

try {
  execFileSync('cwebp', ['-version'], { stdio: 'pipe' });
} catch {
  throw new Error('[stage] cwebp not found or not runnable. Install WebP tools (brew install webp), then retry pnpm app:release.');
}

if (process.env.SKIP_NEXT_BUILD !== '1') {
  execFileSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, EDUAGENT_STANDALONE: '1' },
  });
}

const routesPath = join(root, '.next/routes-manifest.json');
if (!existsSync(routesPath)) {
  throw new Error('[stage] App build missing. Run pnpm app:stage without SKIP_NEXT_BUILD.');
}
const routes = JSON.parse(readFileSync(routesPath, 'utf8'));
const rewrites = Array.isArray(routes.rewrites) ? routes.rewrites : routes.rewrites.afterFiles;
if (!rewrites.some((r) => r.source === '/images/:path*.png' && r.destination === '/images-webp/:path*.webp')) {
  throw new Error('[stage] App WebP rewrite missing. Run pnpm app:stage without SKIP_NEXT_BUILD.');
}

rmSync(join(root, 'desktop/build'), { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const standalone = join(root, '.next/standalone');
// 除 node_modules 外原样复制(.next/server 等)
for (const name of readdirSync(standalone)) {
  if (name === 'node_modules' || name === 'server.js' || name === 'package.json') continue;
  cpSync(join(standalone, name), join(out, name), {
    recursive: true,
    filter: (src) => !basename(src).startsWith('.env'),
  });
}

// 摊平 node_modules/.pnpm/*/node_modules/* -> node_modules/*
const pnpmDir = join(standalone, 'node_modules/.pnpm');
const flat = join(out, 'node_modules');
mkdirSync(flat, { recursive: true });
function copyPkg(src, name) {
  const dest = join(flat, name);
  if (existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(realpathSync(src), dest, { recursive: true, dereference: true });
}
for (const store of readdirSync(pnpmDir)) {
  const nm = join(pnpmDir, store, 'node_modules');
  if (!existsSync(nm)) continue;
  for (const entry of readdirSync(nm)) {
    if (entry.startsWith('@')) {
      for (const sub of readdirSync(join(nm, entry))) copyPkg(join(nm, entry, sub), `${entry}/${sub}`);
    } else {
      copyPkg(join(nm, entry), entry);
    }
  }
}

// 业务 server:bundle 一个文件,只把 next 留在外面
await build({
  entryPoints: [join(root, 'server.ts')],
  outfile: join(out, 'eduagent-server.js'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  external: ['next', 'bufferutil', 'utf-8-validate'],
  // 打包版里 require('bufferutil') 会被 Next 的 require hook 解析到一个没有 mask 的占位模块,
  // ws 发送 >=48 字节的帧时抛 "t.mask is not a function"(真实 ASR 的请求帧/音频帧都会中招)。
  // 关掉 ws 的可选原生加速,走纯 JS 实现。
  banner: { js: "process.env.WS_NO_BUFFER_UTIL = '1';" },
  tsconfig: join(root, 'tsconfig.server.json'),
  logLevel: 'info',
});

// Only the staging copy changes. PNGs under public/images are omitted from the app.
const images = join(root, 'public/images');
cpSync(join(root, 'public'), join(out, 'public'), {
  recursive: true,
  filter: (src) => !(src.startsWith(images + '/') && src.endsWith('.png')),
});
function pngs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? pngs(path) : path.endsWith('.png') ? [path] : [];
  });
}
let pngBytes = 0;
let webpBytes = 0;
const sources = pngs(images);
for (const src of sources) {
  const dest = join(out, 'public/images-webp', relative(images, src).replace(/\.png$/, '.webp'));
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync('cwebp', ['-quiet', '-q', '82', src, '-o', dest], { stdio: 'inherit' });
  pngBytes += statSync(src).size;
  webpBytes += statSync(dest).size;
}
writeFileSync(join(root, 'desktop/build/webp-metrics.json'), JSON.stringify({ quality: 82, images: sources.length, pngBytes, webpBytes }, null, 2) + '\n');
console.log(`[stage] WebP q82: ${sources.length} PNGs, ${pngBytes} -> ${webpBytes} bytes`);
cpSync(join(root, '.next/static'), join(out, '.next/static'), { recursive: true });

const size = execFileSync('du', ['-sh', out]).toString().split('\t')[0];
console.log(`[stage] server staged at ${out} (${size})`);
console.log('[stage] top-level node_modules:', readdirSync(flat).join(', '));
if (!statSync(join(out, 'eduagent-server.js')).isFile()) throw new Error('bundle missing');
