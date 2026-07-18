import { Router } from 'express';
import { findForTimeline, createEvent, updateEvent, deleteEvent, completeEvent, getEvent } from '../models/event.mjs';
import { listTimelines, getDefaultTimeline } from '../models/timeline.mjs';
import { buildAgenda, toFormModel } from '../lib/agenda.mjs';

const router = Router();

/** Re-encode the active timeline filter so it can ride along on form URLs. */
const tqOf = (req) => (req.query.timeline ? `?timeline=${encodeURIComponent(req.query.timeline)}` : '');

/** Parse form body -> event fields. Returns { data } or { error }. */
function parseEventBody(b) {
  const title = (b.title || '').trim();
  if (!title) return { error: 'Title is required.' };
  if (!b.date) return { error: 'Date is required.' };

  const [y, mo, d] = b.date.split('-').map(Number);
  const allDay = b.allDay === 'on' || b.allDay === 'true' || b.allDay === true;

  let startsAt, endsAt = null;
  if (allDay) {
    startsAt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  } else {
    const [sh, sm] = (b.startTime || '00:00').split(':').map(Number);
    startsAt = new Date(y, mo - 1, d, sh, sm, 0, 0);
    if (b.endTime) {
      const [eh, em] = b.endTime.split(':').map(Number);
      endsAt = new Date(y, mo - 1, d, eh, em, 0, 0);
    }
  }
  if (endsAt && endsAt < startsAt) return { error: 'End time must be after the start time.' };

  return {
    data: {
      title,
      startsAt,
      endsAt,
      allDay,
      color: b.color || '#4f8cff',
      notes: (b.notes || '').trim(),
      // Only set when the form sent one, so an update never clears it.
      ...(b.timelineId ? { timelineId: b.timelineId } : {})
    }
  };
}

/**
 * Render the agenda respecting the active timeline filter (?timeline=slug),
 * which every agenda-refreshing request carries so polls and mutations keep
 * the user's current view.
 */
async function renderAgenda(req, res, view) {
  const timelines = await listTimelines();
  const byId = new Map(timelines.map((t) => [String(t._id), t]));
  const selected = timelines.find((t) => t.slug === req.query.timeline) || null;
  const events = await findForTimeline({ timelineId: selected?._id });
  res.render(view, {
    groups: buildAgenda(events, new Date(), byId),
    tq: selected ? `?timeline=${selected.slug}` : '',
    showBadges: !selected && timelines.length > 1
  });
}

// Agenda list only (used by the 60s poll).
router.get('/list', async (req, res, next) => {
  try {
    await renderAgenda(req, res, 'partials/agenda');
  } catch (err) { next(err); }
});

// Empty form for a new event.
router.get('/new', async (req, res, next) => {
  try {
    const timelines = await listTimelines();
    const event = toFormModel(null);
    // Preselect the timeline being viewed, else the default.
    const selected = timelines.find((t) => t.slug === req.query.timeline);
    const def = timelines.find((t) => t.isDefault);
    event.timelineId = String((selected || def || {})._id || '');
    res.render('partials/event-form', { mode: 'new', event, timelines, tq: tqOf(req) });
  } catch (err) { next(err); }
});

// Populated form for editing.
router.get('/:id/edit', async (req, res, next) => {
  try {
    const evt = await getEvent(req.params.id);
    if (!evt) return res.status(404).send('Event not found');
    const timelines = await listTimelines();
    res.render('partials/event-form', { mode: 'edit', event: toFormModel(evt), timelines, tq: tqOf(req) });
  } catch (err) { next(err); }
});

// Create.
router.post('/', async (req, res, next) => {
  try {
    const { data, error } = parseEventBody(req.body);
    if (error) {
      const timelines = await listTimelines();
      return res.render('partials/event-form', { mode: 'new', event: { ...toFormModel(null), ...req.body }, timelines, tq: tqOf(req), error });
    }
    if (!data.timelineId) data.timelineId = (await getDefaultTimeline())?._id ?? null;
    await createEvent(data);
    await renderAgenda(req, res, 'partials/mutation-response');
  } catch (err) { next(err); }
});

// Update.
router.put('/:id', async (req, res, next) => {
  try {
    const { data, error } = parseEventBody(req.body);
    if (error) {
      const evt = await getEvent(req.params.id);
      const timelines = await listTimelines();
      return res.render('partials/event-form', { mode: 'edit', event: { ...toFormModel(evt), ...req.body }, timelines, tq: tqOf(req), error });
    }
    await updateEvent(req.params.id, data);
    await renderAgenda(req, res, 'partials/mutation-response');
  } catch (err) { next(err); }
});

// Mark done -> drops off the timeline.
router.post('/:id/done', async (req, res, next) => {
  try {
    await completeEvent(req.params.id);
    await renderAgenda(req, res, 'partials/mutation-response');
  } catch (err) { next(err); }
});

// Delete.
router.delete('/:id', async (req, res, next) => {
  try {
    await deleteEvent(req.params.id);
    await renderAgenda(req, res, 'partials/mutation-response');
  } catch (err) { next(err); }
});

export default router;
