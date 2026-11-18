
import mongoose from 'mongoose';
import { env } from './env';

export let isMongoConnected = false;

export async function connectDatabase() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !process.env.MONGODB_URI) {
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

    if (isProduction) {
      console.error('MongoDB connection failed:', error);
      throw error;
    }

    console.warn(
      'MongoDB unavailable. Running in in-memory development mode.',
      error
    );

    return false;
  }
}
