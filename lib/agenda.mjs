// Server-side agenda construction: turn a flat list of events into day groups,
// dropping past events and skipping empty days. Uses the server's local time,
// which for this single-user local app is the user's time.

import { randomColor } from './colors.mjs';

const pad = (n) => String(n).padStart(2, '0');

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Escape HTML, then turn URLs into clickable links (safe: escaping happens first). */
function linkify(text) {
  return escapeHtml(text).replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi, (match) => {
    let url = match;
    let trail = '';
    const t = url.match(/[.,;:!?)\]]+$/); // don't swallow trailing punctuation
    if (t) {
      trail = t[0];
      url = url.slice(0, -trail.length);
    }
    const href = url.startsWith('http') ? url : `https://${url}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${trail}`;
  });
}

export const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function toDateInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDayLabel(day, now) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const that = new Date(day); that.setHours(0, 0, 0, 0);
  const diffDays = Math.round((that - today) / 86400000);
  const base = day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  if (diffDays === 0) return `Today · ${base}`;
  if (diffDays === 1) return `Tomorrow · ${base}`;
  return base;
}

function formatRange(start, end) {
  const opts = { hour: 'numeric', minute: '2-digit' };
  const s = start.toLocaleTimeString([], opts);
  return end ? `${s} – ${end.toLocaleTimeString([], opts)}` : s;
}

/**
 * Build day groups from a flat event list. Past events that were never marked
 * done are kept (so the user can scroll up to find them); each event carries a
 * `past` flag, and the first still-upcoming event is flagged `isNext` so the
 * view can anchor the scroll position there.
 *
 * Pass `timelinesById` (Map of String(id) -> timeline) to annotate each event
 * with its timeline's name/color for the badge in the "All" view.
 *
 * @returns Array<{ key, label, past, events: Array<{ id, title, color, allDay, timeText, past, isNext, timelineName, timelineColor }> }>
 */
export function buildAgenda(events, now = new Date(), timelinesById = null) {
  const nowMs = now.getTime();
  const sorted = [...events].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const groups = new Map();
  let nextMarked = false;

  for (const evt of sorted) {
    const start = new Date(evt.startsAt);
    const end = evt.endsAt ? new Date(evt.endsAt) : null;
    const past = (end || start).getTime() < nowMs;

    const key = dayKey(start);
    if (!groups.has(key)) {
      groups.set(key, { key, label: formatDayLabel(start, now), past: true, events: [] });
    }
    const group = groups.get(key);
    if (!past) group.past = false; // a day with any upcoming event isn't "past"

    const isNext = !past && !nextMarked;
    if (isNext) nextMarked = true;

    const tl = timelinesById?.get(String(evt.timelineId)) || null;

    group.events.push({
      id: String(evt._id),
      title: evt.title,
      color: evt.color || '#4f8cff',
      allDay: !!evt.allDay,
      timeText: evt.allDay ? 'All day' : formatRange(start, end),
      notes: evt.notes || '',
      notesHtml: evt.notes ? linkify(evt.notes) : '',
      past,
      isNext,
      timelineName: tl ? tl.name : '',
      timelineColor: tl ? tl.color : ''
    });
  }

  return [...groups.values()];
}

/** Build the form model for the new/edit form (local date/time strings). */
export function toFormModel(evt) {
  if (!evt) {
    const now = new Date();
    return {
      id: null,
      title: '',
      date: toDateInput(now),
      startTime: '09:00',
      endTime: '',
      allDay: false,
      color: randomColor(),
      notes: '',
      timelineId: ''
    };
  }
  const start = new Date(evt.startsAt);
  const end = evt.endsAt ? new Date(evt.endsAt) : null;
  return {
    id: String(evt._id),
    title: evt.title,
    date: toDateInput(start),
    startTime: toTimeInput(start),
    endTime: end ? toTimeInput(end) : '',
    allDay: !!evt.allDay,
    color: evt.color || '#4f8cff',
    notes: evt.notes || '',
    timelineId: evt.timelineId ? String(evt.timelineId) : ''
  };
}
