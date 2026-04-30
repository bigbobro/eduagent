import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

export function handleASRUpgrade(_req: IncomingMessage, socket: Socket, _head: Buffer): void {
  // Stub - implemented in Task 8
  socket.destroy();
}
