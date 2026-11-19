import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { env } from './config/env';
import { connectDatabase, isMongoConnected } from './config/db';
import { createHttpServer, handleJsonRpc } from './rpc';
import { initializeSocketServer } from './sockets';
import authRouter from './routes/auth';
import boardingHouseRouter from './routes/boardingHouses';
import roomRouter from './routes/rooms';
import tenantRouter from './routes/tenants';
import dashboardRouter from './routes/dashboard';
import paymentRouter from './routes/payments';
import maintenanceRouter from './routes/maintenance';
import reservationRouter from './routes/reservations';
import notificationRouter from './routes/notifications';
import announcementRouter from './routes/announcements';
import { seedDemoData } from './services/store';

const app = express();
const server = createHttpServer(app);
const io = initializeSocketServer(server);

app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    mode: process.env.NODE_ENV ?? 'development',
    mongodb: isMongoConnected ? 'connected' : 'disconnected',
    socket: 'ready',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRouter);
app.use('/api/boarding-houses', boardingHouseRouter);
app.use('/api/rooms', roomRouter);
app.use('/api/tenants', tenantRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/reservations', reservationRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/announcements', announcementRouter);
app.post('/rpc', handleJsonRpc);

app.get('/', (req, res) => {
  res.json({ message: 'Boards API is running' });
});

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);
  console.error('Request failed:', error);
  return res.status(500).json({ message: 'Internal server error' });
});

const main = async () => {
  await connectDatabase();
  if (env.seedDemoData) await seedDemoData();
  server.listen(env.port, env.host, () => {
    console.log(`Server listening on http://${env.host}:${env.port}`);
  });
};

main().catch((error) => {
  console.error('Server startup failed', error);
  process.exit(1);
});

export { app, io };
