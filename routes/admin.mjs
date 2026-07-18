import { Router } from 'express';
import { Event } from '../models/event.mjs';
import { listTimelines, createTimeline, updateTimeline, deleteTimeline } from '../models/timeline.mjs';
import { randomColor } from '../lib/colors.mjs';

const router = Router();

// Timeline management page.
router.get('/', async (req, res, next) => {
  try {
    const timelines = await listTimelines();
    const counts = await Event.aggregate([
      { $match: { completedAt: null } },
      { $group: { _id: '$timelineId', n: { $sum: 1 } } }
    ]);
    const countById = new Map(counts.map((c) => [String(c._id), c.n]));
    res.render('admin', {
      title: 'Timelines · Admin',
      timelines: timelines.map((t) => ({ ...t, eventCount: countById.get(String(t._id)) || 0 })),
      newColor: randomColor(),
      error: req.query.error || ''
    });
  } catch (err) { next(err); }
});

// Create a timeline.
router.post('/timelines', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.redirect(303, '/admin?error=' + encodeURIComponent('Name is required.'));
    await createTimeline({ name, color: req.body.color });
    res.redirect(303, '/admin');
  } catch (err) { next(err); }
});

// Rename / recolor.
router.post('/timelines/:id', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.redirect(303, '/admin?error=' + encodeURIComponent('Name is required.'));
    await updateTimeline(req.params.id, { name, color: req.body.color });
    res.redirect(303, '/admin');
  } catch (err) { next(err); }
});

// Delete (events are reassigned to the default timeline).
router.post('/timelines/:id/delete', async (req, res, next) => {
  try {
    const result = await deleteTimeline(req.params.id);
    if (result.error) return res.redirect(303, '/admin?error=' + encodeURIComponent(result.error));
    res.redirect(303, '/admin');
  } catch (err) { next(err); }
});

export default router;
