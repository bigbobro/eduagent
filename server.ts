import { createServer, IncomingMessage } from 'http';
import { Socket } from 'net';
import next from 'next';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

// 在加载任何依赖 process.env 的模块之前加载 .env.local
loadEnv({ path: resolve(process.cwd(), '.env.local') });

// Validate configuration before starting server
import { getConfig } from './src/lib/config';
import { createLogger } from './src/lib/logger';
import { isAllowedWsOrigin } from './src/lib/voice/ws-origin';

const config = getConfig(); // Fail fast if config invalid
const log = createLogger('server');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  log.info('Starting EduAgent server', { port: config.port, dev, voiceMock: config.voiceMock, llmBaseUrl: config.llmBaseUrl });

  await app.prepare();

  // 这两个函数在 Task 8/9 实现
  const { handleASRUpgrade } = await import('./src/lib/voice/asr-proxy');
  const { handleTTSUpgrade } = await import('./src/lib/voice/tts-proxy');

  const server = createServer((req, res) => {
    handle(req, res);
  });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = req.url || '';
    // Reject cross-origin WS upgrades (CSWSH) before bridging to Doubao with server credentials.
    if (!isAllowedWsOrigin(req.headers.origin, config.port)) {
      log.warn('Rejected WS upgrade from disallowed origin', { origin: req.headers.origin, url });
      socket.destroy();
      return;
    }
    if (url.startsWith('/api/voice/asr')) {
      handleASRUpgrade(req, socket, head);
    } else if (url.startsWith('/api/voice/tts')) {
      handleTTSUpgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.listen(config.port, () => {
    log.info('Server listening', { url: `http://localhost:${config.port}` });
  });
}

main().catch((err) => {
  log.error('Server failed to start', {}, err instanceof Error ? err : new Error(String(err)));
  process.exit(1);
});
