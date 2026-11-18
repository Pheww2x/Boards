import dotenv from 'dotenv';

dotenv.config();

export const env = {
  port: Number(process.env.PORT ?? 5000),
  host: process.env.HOST ?? '0.0.0.0',
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/boarding-house-management',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-key',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  socketOrigin: process.env.SOCKET_ORIGIN ?? '*',
};
