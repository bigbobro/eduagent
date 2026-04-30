import { createServer, IncomingMessage } from 'http';
import { Socket } from 'net';
import next from 'next';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

// 在加载任何依赖 process.env 的模块之前加载 .env.local
loadEnv({ path: resolve(process.cwd(), '.env.local') });

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  // 这两个函数在 Task 8/9 实现
  const { handleASRUpgrade } = await import('./src/lib/voice/asr-proxy');
  const { handleTTSUpgrade } = await import('./src/lib/voice/tts-proxy');

  const server = createServer((req, res) => {
    handle(req, res);
  });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = req.url || '';
    if (url.startsWith('/api/voice/asr')) {
      handleASRUpgrade(req, socket, head);
    } else if (url.startsWith('/api/voice/tts')) {
      handleTTSUpgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} (dev=${dev})`);
  });
}

main().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
