import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { env } from '../config/env';
import { verifyToken } from '../middleware/auth';
import User from '../models/User';
import Tenant from '../models/Tenant';

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

    let payload: ReturnType<typeof verifyToken>;
    try {
      payload = verifyToken(token);
    } catch {
      return next(new Error('Unauthorized socket connection'));
    }

    User.findOne({ id: payload.id }).exec().then((user) => {
      if (!user) return next(new Error('Unauthorized socket connection'));

      socket.data.user = {
        id: user.id,
        role: user.role,
        boardingHouseId: user.boardingHouseId,
      };
      return next();
    }).catch((error) => {
      console.error('Socket authentication lookup failed:', error);
      next(new Error('Socket authentication failed'));
    });
  });

  socketServer.on('connection', (socket) => {
    const connectedUser = socket.data.user as { id: string; boardingHouseId?: string };
    socket.join(`user:${connectedUser.id}`);

    let boardingHouseId = connectedUser.boardingHouseId;
    socket.on('disconnect', () => {
      if (boardingHouseId) {
        socketServer?.to(`house:${boardingHouseId}`).emit('client:disconnected', {
          userId: connectedUser.id,
          time: new Date().toISOString(),
        });
      }
    });

    const joinHouseAndNotify = () => {
      if (boardingHouseId) socket.join(`house:${boardingHouseId}`);
      socket.emit('client:connected', { connected: true, timestamp: new Date().toISOString() });
    };

    if (boardingHouseId) {
      joinHouseAndNotify();
    } else {
      Tenant.findOne({ userId: connectedUser.id }).exec().then((tenant) => {
        boardingHouseId = tenant?.boardingHouseId;
        joinHouseAndNotify();
      }).catch((error) => {
        console.error('Socket tenant lookup failed:', error);
        socket.disconnect(true);
      });
    }
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
