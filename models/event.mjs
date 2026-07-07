import mongoose from 'mongoose';

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

export async function createEvent(data) {
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
