import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { env } from '../config/env';
import { verifyToken } from '../middleware/auth';
import { getUserById, state } from '../services/store';

let socketServer: Server | undefined;

export function initializeSocketServer(httpServer: HttpServer) {
  socketServer = new Server(httpServer, {
    cors: {
      origin: env.socketOrigin === '*' ? true : env.socketOrigin,
      methods: ['GET', 'POST'],
    },
  });

  socketServer.use((socket, next) => {
    const rawToken = socket.handshake.auth.token ?? socket.handshake.headers.authorization;
    const token = typeof rawToken === 'string' ? rawToken.replace(/^Bearer\s+/i, '') : '';
    if (!token) return next(new Error('Unauthorized socket connection'));

    try {
      const payload = verifyToken(token);
      const user = getUserById(payload.id);
      if (!user) return next(new Error('Unauthorized socket connection'));

      socket.data.user = {
        id: user.id,
        role: user.role,
        boardingHouseId: user.boardingHouseId,
      };
      return next();
    } catch {
      return next(new Error('Unauthorized socket connection'));
    }
  });

  socketServer.on('connection', (socket) => {
    const connectedUser = socket.data.user as { id: string; boardingHouseId?: string };
    socket.join(`user:${connectedUser.id}`);

    const tenant = state.tenants.find((item) => item.userId === connectedUser.id);
    const boardingHouseId = connectedUser.boardingHouseId ?? tenant?.boardingHouseId;
    if (boardingHouseId) socket.join(`house:${boardingHouseId}`);

    socket.emit('client:connected', { connected: true, timestamp: new Date().toISOString() });
    socket.on('disconnect', () => {
      if (boardingHouseId) {
        socketServer?.to(`house:${boardingHouseId}`).emit('client:disconnected', {
          userId: connectedUser.id,
          time: new Date().toISOString(),
        });
      }
    });
  });

  return socketServer;
}

export function emitRealtimeEvent(
  eventName: string,
  payload: unknown,
  target?: { userId?: string; boardingHouseId?: string }
) {
  if (!socketServer) return;
  if (target?.userId) {
    socketServer.to(`user:${target.userId}`).emit(eventName, payload);
  } else if (target?.boardingHouseId) {
    socketServer.to(`house:${target.boardingHouseId}`).emit(eventName, payload);
  }
}
