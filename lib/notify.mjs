// Daily 7am digest: if there are events "today" (in the notify timezone), push
// a summary of their titles. Timezone is handled here rather than by changing
// the server clock, so existing event times are unaffected.
import cron from 'node-cron';
import { Event } from '../models/event.mjs';
import { sendToAll } from './push.mjs';

const TZ = process.env.NOTIFY_TZ || 'Australia/Melbourne';

// Events are stored as the wall-time entered (labelled UTC). "Today" for the
// user is the calendar date in TZ; map it to the matching UTC-midnight window.
function todayWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  const [y, m, d] = parts.split('-').map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)),
    end: new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0))
  };
}

export async function findTodaysEvents(now = new Date()) {
  const { start, end } = todayWindow(now);
  return Event.find({ startsAt: { $gte: start, $lt: end } }).sort({ startsAt: 1 }).lean();
}

export function buildDigest(events) {
  const count = events.length;
  return {
    title: count === 1 ? 'Today: 1 event' : `Today: ${count} events`,
    body: events.map((e) => e.title).join(', '),
    url: '/'
  };
}

export async function runDailyDigest(now = new Date()) {
  const events = await findTodaysEvents(now);
  if (!events.length) {
    console.log('[notify] no events today — nothing sent.');
    return { events: 0, sent: 0, pruned: 0 };
  }
  const res = await sendToAll(buildDigest(events));
  console.log(`[notify] digest: ${events.length} event(s) -> sent ${res.sent}, pruned ${res.pruned}`);
  return { events: events.length, ...res };
}

export function scheduleDailyDigest() {
  cron.schedule(
    '0 7 * * *',
    () => {
      runDailyDigest().catch((err) => console.error('[notify] digest error:', err));
    },
    { timezone: TZ }
  );
  console.log(`[notify] daily 7am digest scheduled (${TZ}).`);
}
