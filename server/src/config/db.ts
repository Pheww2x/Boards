import mongoose from 'mongoose';
import { env } from './env';

export let isMongoConnected = false;

export async function connectDatabase() {
  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    isMongoConnected = true;
    console.log('MongoDB connected');
    return true;
  } catch (error) {
    isMongoConnected = false;
    console.warn('MongoDB unavailable. Running in in-memory development mode.', error);
    return false;
  }
}
