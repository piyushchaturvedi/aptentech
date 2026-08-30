import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * MongoDB connection.
 *
 * `sanitizeFilter` is enabled globally: it strips `$`-prefixed keys out of filter objects,
 * giving a second line of defence against NoSQL injection behind the zod coercion applied
 * at every route boundary. `strictQuery` stops unknown query paths being silently ignored.
 */
mongoose.set('strictQuery', true);
mongoose.set('sanitizeFilter', true);

let connecting: Promise<typeof mongoose> | null = null;

export async function connectDb(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;

  if (!connecting) {
    connecting = mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB_NAME,
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 10,
      minPoolSize: 1,
    });
  }

  const conn = await connecting;
  logger.info({ db: env.MONGODB_DB_NAME }, 'MongoDB connected');
  return conn;
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    connecting = null;
    logger.info('MongoDB disconnected');
  }
}
