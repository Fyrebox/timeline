/**
 * Fake events for Phase 1, generated relative to "now" so the timeline always
 * has data spanning today -> 3 months out. No DB required.
 *
 * Each entry: { title, color, dayOffset, hour, minute, durationMin }
 */
const SAMPLE = [
  // --- Today ---
  { title: 'Standup', color: '#4f8cff', dayOffset: 0, hour: 9, minute: 30, durationMin: 15 },
  { title: 'Design review', color: '#a55eea', dayOffset: 0, hour: 11, minute: 0, durationMin: 60 },
  { title: 'Lunch with Sam', color: '#ff9f43', dayOffset: 0, hour: 13, minute: 0, durationMin: 45 },
  { title: 'Deep work', color: '#4b7bec', dayOffset: 0, hour: 15, minute: 0, durationMin: 90 },
  { title: 'Gym', color: '#20bf6b', dayOffset: 0, hour: 18, minute: 30, durationMin: 60 },

  // --- Tomorrow / +2 days ---
  { title: 'Team planning', color: '#4f8cff', dayOffset: 1, hour: 10, minute: 0, durationMin: 90 },
  { title: 'Dentist', color: '#fc5c65', dayOffset: 2, hour: 8, minute: 30, durationMin: 30 },
  { title: 'Client call', color: '#26de81', dayOffset: 2, hour: 16, minute: 0, durationMin: 45 },

  // --- This week (+7 days) ---
  { title: 'Flight to London', color: '#fd9644', dayOffset: 5, hour: 7, minute: 15, durationMin: 120 },
  { title: 'Conference', color: '#a55eea', dayOffset: 7, hour: 9, minute: 0, durationMin: 480 },

  // --- One month out ---
  { title: 'Project deadline', color: '#fc5c65', dayOffset: 30, hour: 17, minute: 0, durationMin: 0 },
  { title: "Mum's birthday", color: '#f7b731', dayOffset: 33, hour: 0, minute: 0, durationMin: 0 },

  // --- Three months out ---
  { title: 'Quarterly review', color: '#4b7bec', dayOffset: 90, hour: 14, minute: 0, durationMin: 120 },
  { title: 'Holiday', color: '#20bf6b', dayOffset: 95, hour: 0, minute: 0, durationMin: 0 }
];

export function generateFakeEvents(now = new Date()) {
  return SAMPLE.map((s, i) => {
    const start = new Date(now);
    start.setDate(start.getDate() + s.dayOffset);
    start.setHours(s.hour, s.minute, 0, 0);
    const allDay = s.durationMin === 0;
    const endsAt = allDay ? null : new Date(start.getTime() + s.durationMin * 60 * 1000);
    return {
      _id: `fake-${i}`,
      title: s.title,
      startsAt: start,
      endsAt,
      allDay,
      color: s.color,
      notes: ''
    };
  });
}
