// 把 server 整理成可放进 .app/Contents/Resources/server 的自包含目录:
//   1. EDUAGENT_STANDALONE=1 next build  -> .next/standalone (只含 next 运行时需要的文件)
//   2. 把 pnpm 的符号链接 node_modules 摊平成真实目录(electron-builder 友好,也避免重复拷贝)
//   3. esbuild 把 server.ts 打成单个 eduagent-server.js(next 保持 external)
//   4. 手动补 public/ 与 .next/static(standalone 不会带)
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(root, 'desktop/build/server');

if (process.env.SKIP_NEXT_BUILD !== '1') {
  execFileSync('pnpm', ['exec', 'next', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, EDUAGENT_STANDALONE: '1' },
  });
}

rmSync(join(root, 'desktop/build'), { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const standalone = join(root, '.next/standalone');
// 除 node_modules 外原样复制(.next/server 等)
for (const name of readdirSync(standalone)) {
  if (name === 'node_modules' || name === 'server.js' || name === 'package.json') continue;
  cpSync(join(standalone, name), join(out, name), { recursive: true });
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

cpSync(join(root, 'public'), join(out, 'public'), { recursive: true });
cpSync(join(root, '.next/static'), join(out, '.next/static'), { recursive: true });

const size = execFileSync('du', ['-sh', out]).toString().split('\t')[0];
console.log(`[stage] server staged at ${out} (${size})`);
console.log('[stage] top-level node_modules:', readdirSync(flat).join(', '));
if (!statSync(join(out, 'eduagent-server.js')).isFile()) throw new Error('bundle missing');
