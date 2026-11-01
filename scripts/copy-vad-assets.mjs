// Copies the browser-VAD runtime assets (Silero model, audio worklet, onnxruntime-web wasm) into public/vad so the
// manual-turn classroom loads them from the app's own origin (no CDN). Output is gitignored; run by predev/prebuild/prestart
// and by desktop/scripts/stage.mjs. Idempotent.
import { copyFileSync, existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vadDist = join(realpathSync(join(root, 'node_modules/@ricky0123/vad-web')), 'dist');
// onnxruntime-web is vad-web's own dependency: in the pnpm store it sits next to it (vadDist = .../node_modules/@ricky0123/vad-web/dist).
const ortDist = join(realpathSync(join(vadDist, '../../../onnxruntime-web')), 'dist');
const out = join(root, 'public/vad');
mkdirSync(out, { recursive: true });

const files = [
  [vadDist, 'silero_vad_v5.onnx'],
  [vadDist, 'vad.worklet.bundle.min.js'],
  [ortDist, 'ort-wasm-simd-threaded.mjs'],
  [ortDist, 'ort-wasm-simd-threaded.wasm'],
];
for (const [dir, name] of files) {
  const src = join(dir, name);
  if (!existsSync(src)) throw new Error(`[vad-assets] missing ${src}; run pnpm install`);
  const dest = join(out, name);
  if (!existsSync(dest) || statSync(dest).size !== statSync(src).size) copyFileSync(src, dest);
}
console.log(`[vad-assets] ${files.length} files in public/vad`);
