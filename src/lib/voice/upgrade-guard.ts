import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { isConfigured } from '../config';
import { isAllowedWsOrigin } from './ws-origin';

export type UpgradeVerdict = 'ok' | 'bad-origin' | 'not-configured';

/**
 * WS upgrade 的入口检查:跨站 Origin 直接断开(CSWSH);未配置返回 HTTP 503 并关闭 socket
 * (浏览器 WebSocket 会收到 error/close,客户端据此提示;课堂入口 /api/chat 的 503 负责引导去设置页)。
 * 返回 'ok' 表示可以继续桥接。
 */
export function guardUpgrade(req: IncomingMessage, socket: Socket, port: number): UpgradeVerdict {
  if (!isAllowedWsOrigin(req.headers.origin, port)) {
    socket.destroy();
    return 'bad-origin';
  }
  if (!isConfigured()) {
    const body = JSON.stringify({ code: 'NOT_CONFIGURED' });
    socket.end(
      'HTTP/1.1 503 Service Unavailable\r\n' +
        'Content-Type: application/json\r\n' +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        'Connection: close\r\n\r\n' +
        body,
    );
    return 'not-configured';
  }
  return 'ok';
}
