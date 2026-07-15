import { Router } from 'express';
import { findForTimeline, createEvent, updateEvent, deleteEvent, completeEvent, getEvent } from '../models/event.mjs';
import { buildAgenda, toFormModel } from '../lib/agenda.mjs';

const router = Router();

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
      notes: (b.notes || '').trim()
    }
  };
}

async function renderAgenda(res, view) {
  const groups = buildAgenda(await findForTimeline());
  res.render(view, { groups });
}

// Agenda list only (used by the 60s poll).
router.get('/list', async (req, res, next) => {
  try {
    await renderAgenda(res, 'partials/agenda');
  } catch (err) { next(err); }
});

// Empty form for a new event.
router.get('/new', (req, res) => {
  res.render('partials/event-form', { mode: 'new', event: toFormModel(null) });
});

// Populated form for editing.
router.get('/:id/edit', async (req, res, next) => {
  try {
    const evt = await getEvent(req.params.id);
    if (!evt) return res.status(404).send('Event not found');
    res.render('partials/event-form', { mode: 'edit', event: toFormModel(evt) });
  } catch (err) { next(err); }
});

// Create.
router.post('/', async (req, res, next) => {
  try {
    const { data, error } = parseEventBody(req.body);
    if (error) {
      return res.render('partials/event-form', { mode: 'new', event: { ...toFormModel(null), ...req.body }, error });
    }
    await createEvent(data);
    await renderAgenda(res, 'partials/mutation-response');
  } catch (err) { next(err); }
});

// Update.
router.put('/:id', async (req, res, next) => {
  try {
    const { data, error } = parseEventBody(req.body);
    if (error) {
      const evt = await getEvent(req.params.id);
      return res.render('partials/event-form', { mode: 'edit', event: { ...toFormModel(evt), ...req.body }, error });
    }
    await updateEvent(req.params.id, data);
    await renderAgenda(res, 'partials/mutation-response');
  } catch (err) { next(err); }
});

// Mark done -> drops off the timeline.
router.post('/:id/done', async (req, res, next) => {
  try {
    await completeEvent(req.params.id);
    await renderAgenda(res, 'partials/mutation-response');
  } catch (err) { next(err); }
});

// Delete.
router.delete('/:id', async (req, res, next) => {
  try {
    await deleteEvent(req.params.id);
    await renderAgenda(res, 'partials/mutation-response');
  } catch (err) { next(err); }
});

export default router;
