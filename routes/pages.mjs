import { Router } from 'express';
import { isConnected } from '../db/mongo.mjs';
import { findForTimeline } from '../models/event.mjs';
import { listTimelines } from '../models/timeline.mjs';
import { generateFakeEvents } from '../models/fakeEvents.mjs';
import { buildAgenda } from '../lib/agenda.mjs';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    // Without Mongo (Phase 1 demo mode) fall back to fake events, no timelines.
    if (!isConnected()) {
      const groups = buildAgenda(generateFakeEvents());
      return res.render('timeline', {
        title: 'Timeline',
        groups,
        timelines: [],
        selected: null,
        tq: '',
        showBadges: false
      });
    }

    const timelines = await listTimelines();
    const byId = new Map(timelines.map((t) => [String(t._id), t]));
    const selected = timelines.find((t) => t.slug === req.query.timeline) || null;
    const events = await findForTimeline({ timelineId: selected?._id });

    res.render('timeline', {
      title: selected ? `Timeline · ${selected.name}` : 'Timeline',
      groups: buildAgenda(events, new Date(), byId),
      timelines,
      selected,
      tq: selected ? `?timeline=${selected.slug}` : '',
      showBadges: !selected && timelines.length > 1
    });
  } catch (err) {
    next(err);
  }
});

export default router;
