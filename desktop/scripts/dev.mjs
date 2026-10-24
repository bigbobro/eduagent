// Development uses the existing pnpm dev server, without staging or packaging it.
import { spawn } from 'node:child_process';
import net from 'node:net';
import electron from 'electron';

const port = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', (err) => {
    if (err.code !== 'EADDRINUSE') { reject(err); return; }
    console.log('[app:dev] preferred port occupied; choosing a free port');
    probe.listen(0, '127.0.0.1');
  });
  probe.once('listening', () => { const selected = probe.address().port; probe.close(() => resolve(selected)); });
  probe.listen(Number(process.env.PORT) || 3000, '127.0.0.1');
});
const env = { ...process.env, HOST: '127.0.0.1', PORT: String(port) };
const server = spawn('pnpm', ['dev'], { env, stdio: 'inherit', detached: true });
const desktop = spawn(electron, ['desktop'], { env: { ...env, EDUAGENT_DEV_URL: `http://127.0.0.1:${port}` }, stdio: 'inherit' });
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  desktop.kill();
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  // pnpm may exit before tsx watch finishes forwarding shutdown to its server.
  // Keep the launcher alive until its owned process group has been reaped.
  setTimeout(() => {
    try { process.kill(-server.pid, 'SIGKILL'); } catch {}
    process.exitCode = code;
  }, 1500);
}
server.on('error', (error) => { console.error(error); stop(1); });
desktop.on('error', (error) => { console.error(error); stop(1); });
server.on('exit', (code) => { if (!stopping) stop(code || 1); });
desktop.on('exit', (code) => stop(code || 0));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
