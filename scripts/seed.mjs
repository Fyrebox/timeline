// Seed the database with the Phase 1 sample events (relative to now).
// Usage: MONGODB_URI=... node scripts/seed.mjs   (defaults to local mongo)
import mongoose from 'mongoose';
import { Event } from '../models/event.mjs';
import { generateFakeEvents } from '../models/fakeEvents.mjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/timeline';

async function main() {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  console.log('[seed] connected:', mongoose.connection.name);

  const docs = generateFakeEvents().map(({ _id, ...rest }) => rest); // drop the fake string ids
  await Event.deleteMany({});
  const inserted = await Event.insertMany(docs);

  console.log(`[seed] cleared collection and inserted ${inserted.length} events:`);
  for (const e of inserted) {
    console.log(`  • ${e.startsAt.toISOString().slice(0, 16).replace('T', ' ')}  ${e.title}`);
  }

  await mongoose.disconnect();
  console.log('[seed] done.');
}

main().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
