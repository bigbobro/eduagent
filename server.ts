import { createServer, IncomingMessage } from 'http';
import { Socket } from 'net';
import next from 'next';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// 在加载任何依赖 process.env 的模块之前加载 .env.local。
// 桌面 App(EDUAGENT_APP=1)的配置全部由 Electron main 注入 env,不读 .env.local。
if (process.env.EDUAGENT_APP !== '1') {
  loadEnv({ path: resolve(process.cwd(), '.env.local') });
}

// Validate configuration before starting server
import { getConfig } from './src/lib/config';
import { createLogger } from './src/lib/logger';
import { isAllowedWsOrigin } from './src/lib/voice/ws-origin';

const config = getConfig(); // Fail fast if config invalid
const log = createLogger('server');

const dev = process.env.NODE_ENV !== 'production';
// HOST 未设置时保持原行为(监听所有网卡);桌面 App 设为 127.0.0.1。
const host = process.env.HOST || undefined;
// 打包后 server.js 与 .next 同目录;开发时 __dirname 即项目根。
// standalone 目录里没有 next.config.mjs,生产配置取自构建产物 required-server-files.json。
// 与 Next 自带的 standalone server.js 一致,通过该 env 注入配置(同时跳过 standalone 里不存在的 webpack 运行时)。
if (process.env.EDUAGENT_APP === '1') {
  const { config: standaloneConf } = JSON.parse(readFileSync(resolve(__dirname, '.next/required-server-files.json'), 'utf8'));
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(standaloneConf);
}
const app = next({
  dev,
  dir: process.env.EDUAGENT_APP === '1' ? __dirname : undefined,
  hostname: host ?? 'localhost',
  port: config.port,
});
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

  const onListening = () => {
    log.info('Server listening', { url: `http://${host ?? 'localhost'}:${config.port}`, host: host ?? '*' });
  };
  if (host) server.listen(config.port, host, onListening);
  else server.listen(config.port, onListening);
}

main().catch((err) => {
  log.error('Server failed to start', {}, err instanceof Error ? err : new Error(String(err)));
  process.exit(1);
});
