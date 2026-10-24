// This release supports Apple silicon only; Next builds with host-native tooling.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const arch = 'arm64';
if (process.arch !== arch || process.argv.length > 2) {
  throw new Error(`Only Apple silicon arm64 releases are supported. Run pnpm app:release with arm64 Node (current: ${process.arch}).`);
}
if (process.platform !== 'darwin') throw new Error('Mac releases require macOS.');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const env = { ...process.env };
// A release always builds fresh; SKIP_NEXT_BUILD is only for standalone staging diagnosis.
delete env.SKIP_NEXT_BUILD;
const run = (exe, args) => execFileSync(exe, args, { cwd: root, env, stdio: 'inherit' });
run(process.execPath, ['desktop/scripts/stage.mjs']);
run(process.execPath, [require.resolve('electron-builder/cli.js'), '--config', 'desktop/electron-builder.yml', '--mac', 'dir', `--${arch}`, `-c.extraMetadata.version=${version}`]);
run('bash', ['desktop/scripts/sign-and-dmg.sh']);
console.log(`[release] desktop/dist/EduAgent-${version}-${arch}.dmg`);
