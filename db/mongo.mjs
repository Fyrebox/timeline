import mongoose from 'mongoose';

/**
 * Connects to MongoDB. Returns true on success, false on failure.
 * In Phase 1 a failure is non-fatal: the app falls back to fake events
 * so you can see the timeline motion without a running Mongo instance.
 */
export async function connectMongo(uri) {
  if (!uri) {
    console.warn('[mongo] No MONGODB_URI set — running with fake events.');
    return false;
  }
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
    console.log('[mongo] Connected:', mongoose.connection.name);
    return true;
  } catch (err) {
    console.warn(`[mongo] Connection failed (${err.message}) — running with fake events.`);
    return false;
  }
}

export function isConnected() {
  return mongoose.connection.readyState === 1;
}
