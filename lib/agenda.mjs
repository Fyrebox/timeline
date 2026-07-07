// Server-side agenda construction: turn a flat list of events into day groups,
// dropping past events and skipping empty days. Uses the server's local time,
// which for this single-user local app is the user's time.

const pad = (n) => String(n).padStart(2, '0');

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
 * @returns Array<{ key, label, events: Array<{ id, title, color, allDay, timeText }> }>
 */
export function buildAgenda(events, now = new Date()) {
  const nowMs = now.getTime();
  const sorted = [...events].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const groups = new Map();

  for (const evt of sorted) {
    const start = new Date(evt.startsAt);
    const end = evt.endsAt ? new Date(evt.endsAt) : null;
    if ((end || start).getTime() < nowMs) continue; // already ended -> drop

    const key = dayKey(start);
    if (!groups.has(key)) {
      groups.set(key, { key, label: formatDayLabel(start, now), events: [] });
    }
    groups.get(key).events.push({
      id: String(evt._id),
      title: evt.title,
      color: evt.color || '#4f8cff',
      allDay: !!evt.allDay,
      timeText: evt.allDay ? 'All day' : formatRange(start, end),
      notes: evt.notes || ''
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
      color: '#4f8cff',
      notes: ''
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
    notes: evt.notes || ''
  };
}
