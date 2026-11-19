
import mongoose from 'mongoose';
import { env } from './env';

export let isMongoConnected = false;

mongoose.connection.on('connected', () => {
  isMongoConnected = true;
});
mongoose.connection.on('disconnected', () => {
  isMongoConnected = false;
});

export async function connectDatabase() {
  if (process.env.NODE_ENV === 'production' && !process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is missing in production environment.');
  }

  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });

    isMongoConnected = true;
    console.log('MongoDB connected successfully');

    return true;
  } catch (error) {
    isMongoConnected = false;
    console.error('MongoDB connection failed:', error);
    throw error;
  }
}
