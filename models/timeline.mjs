import mongoose from 'mongoose';
import { Event } from './event.mjs';
import { randomColor } from '../lib/colors.mjs';

const timelineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    color: { type: String, default: '#4f8cff' },
    // Exactly one timeline is the default: new events land there when no
    // timeline is chosen, and deleted timelines hand their events to it.
    isDefault: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const Timeline = mongoose.model('Timeline', timelineSchema);

export function slugify(name) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'timeline'
  );
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** All timelines, default first then alphabetical. */
export async function listTimelines() {
  return Timeline.find().sort({ isDefault: -1, name: 1 }).lean();
}

export async function getDefaultTimeline() {
  return Timeline.findOne({ isDefault: true }).lean();
}

/** Look a timeline up by slug, name (case-insensitive) or id. */
export async function findTimelineByRef(ref) {
  if (!ref) return null;
  const t = await Timeline.findOne({
    $or: [{ slug: ref.toLowerCase() }, { name: new RegExp(`^${escapeRegex(ref)}$`, 'i') }]
  }).lean();
  if (t) return t;
  if (mongoose.isValidObjectId(ref)) return Timeline.findById(ref).lean();
  return null;
}

async function uniqueSlug(name) {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (await Timeline.exists({ slug })) slug = `${base}-${n++}`;
  return slug;
}

export async function createTimeline({ name, color }) {
  return Timeline.create({ name, slug: await uniqueSlug(name), color: color || randomColor() });
}

export async function updateTimeline(id, { name, color }) {
  const update = {};
  if (name !== undefined) update.name = name;
  if (color !== undefined) update.color = color;
  return Timeline.findByIdAndUpdate(id, update, { new: true, runValidators: true });
}

/**
 * Delete a timeline. Its events are reassigned to the default timeline rather
 * than deleted. The default timeline itself cannot be deleted.
 */
export async function deleteTimeline(id) {
  const t = await Timeline.findById(id);
  if (!t) return { error: 'Timeline not found.' };
  if (t.isDefault) return { error: 'The default timeline cannot be deleted.' };
  const def = await getDefaultTimeline();
  const moved = await Event.updateMany({ timelineId: t._id }, { timelineId: def._id });
  await t.deleteOne();
  return { deleted: t.toObject(), movedEvents: moved.modifiedCount };
}

/**
 * Startup backfill: guarantee a default timeline exists and that every event
 * belongs to a timeline. Safe to run on every boot.
 */
export async function ensureDefaultTimeline() {
  let def = await Timeline.findOne({ isDefault: true });
  if (!def) {
    def = await Timeline.findOne(); // promote the oldest existing timeline
    if (def) {
      def.isDefault = true;
      await def.save();
    } else {
      def = await Timeline.create({ name: 'Personal', slug: 'personal', color: '#4f8cff', isDefault: true });
      console.log('[timeline] created default timeline "Personal".');
    }
  }
  const res = await Event.updateMany({ timelineId: null }, { timelineId: def._id });
  if (res.modifiedCount) {
    console.log(`[timeline] backfilled ${res.modifiedCount} event(s) into "${def.name}".`);
  }
  return def.toObject();
}
