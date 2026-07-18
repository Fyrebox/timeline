import mongoose from 'mongoose';
import { randomColor } from '../lib/colors.mjs';

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, default: null },
    allDay: { type: Boolean, default: false },
    color: { type: String, default: '#4f8cff' },
    notes: { type: String, default: '' },
    // When set, the event has been marked done and drops off the timeline.
    completedAt: { type: Date, default: null },
    // Which timeline the event belongs to. Backfilled to the default timeline
    // on startup, so null only exists transiently.
    timelineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Timeline', default: null, index: true }
  },
  { timestamps: true }
);

export const Event = mongoose.model('Event', eventSchema);

/**
 * Every event still on the timeline (not marked done), sorted ascending. This
 * includes *past* events that were never completed, so the user can scroll up
 * to find things they still haven't dealt with. The view splits past from
 * upcoming for display.
 */
export async function findForTimeline({ limit = 500, timelineId = null } = {}) {
  const filter = { completedAt: null };
  if (timelineId) filter.timelineId = timelineId;
  return Event.find(filter)
    .sort({ startsAt: 1 })
    .limit(limit)
    .lean();
}

/**
 * Upcoming events for the agenda view: everything from the start of today
 * onward, sorted ascending. The client drops events that have already ended,
 * so we fetch from midnight to keep any in-progress event visible.
 */
export async function findUpcoming({ from = startOfToday(), limit = 500 } = {}) {
  return Event.find({ startsAt: { $gte: from }, completedAt: null })
    .sort({ startsAt: 1 })
    .limit(limit)
    .lean();
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * The next N events that haven't ended yet (in-progress events included),
 * sorted soonest-first. Used by the MCP server.
 */
export async function findNext({ limit = 10, now = new Date(), timelineId = null } = {}) {
  const filter = {
    completedAt: null,
    $or: [
      { endsAt: { $gte: now } },
      { endsAt: null, startsAt: { $gte: now } }
    ]
  };
  if (timelineId) filter.timelineId = timelineId;
  return Event.find(filter)
    .sort({ startsAt: 1 })
    .limit(limit)
    .lean();
}

export async function createEvent(data) {
  if (!data.color) data.color = randomColor();
  return Event.create(data);
}

export async function updateEvent(id, data) {
  return Event.findByIdAndUpdate(id, data, { new: true, runValidators: true });
}

export async function deleteEvent(id) {
  return Event.findByIdAndDelete(id);
}

/** Mark an event done so it drops off the timeline. */
export async function completeEvent(id, now = new Date()) {
  return Event.findByIdAndUpdate(id, { completedAt: now }, { new: true });
}

export async function getEvent(id) {
  return Event.findById(id).lean();
}
