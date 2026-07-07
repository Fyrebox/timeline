import mongoose from 'mongoose';
import { randomColor } from '../lib/colors.mjs';

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, default: null },
    allDay: { type: Boolean, default: false },
    color: { type: String, default: '#4f8cff' },
    notes: { type: String, default: '' }
  },
  { timestamps: true }
);

export const Event = mongoose.model('Event', eventSchema);

/**
 * Upcoming events for the agenda view: everything from the start of today
 * onward, sorted ascending. The client drops events that have already ended,
 * so we fetch from midnight to keep any in-progress event visible.
 */
export async function findUpcoming({ from = startOfToday(), limit = 500 } = {}) {
  return Event.find({ startsAt: { $gte: from } })
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
export async function findNext({ limit = 10, now = new Date() } = {}) {
  return Event.find({
    $or: [
      { endsAt: { $gte: now } },
      { endsAt: null, startsAt: { $gte: now } }
    ]
  })
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

export async function getEvent(id) {
  return Event.findById(id).lean();
}
