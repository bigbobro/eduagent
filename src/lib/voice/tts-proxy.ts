import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

export function handleTTSUpgrade(_req: IncomingMessage, socket: Socket, _head: Buffer): void {
  // Stub - implemented in Task 9
  socket.destroy();
}
