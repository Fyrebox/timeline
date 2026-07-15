import { Router } from 'express';
import { isConnected } from '../db/mongo.mjs';
import { findForTimeline } from '../models/event.mjs';
import { generateFakeEvents } from '../models/fakeEvents.mjs';
import { buildAgenda } from '../lib/agenda.mjs';

const router = Router();

/** Loads events from Mongo when connected, otherwise fake events. */
export async function loadEvents() {
  if (isConnected()) {
    const events = await findForTimeline();
    if (events.length) return events;
  }
  return generateFakeEvents();
}

router.get('/', async (req, res, next) => {
  try {
    const groups = buildAgenda(await loadEvents());
    res.render('timeline', { title: 'Timeline', groups });
  } catch (err) {
    next(err);
  }
});

export default router;
