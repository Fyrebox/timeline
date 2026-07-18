// Shared factory for the Timeline MCP server. Used by both the stdio entry
// (mcp/server.mjs) and the HTTP transport mounted at /mcp (routes/mcp.mjs).
// Assumes a Mongoose connection is already established by the caller.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  findNext,
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent
} from '../models/event.mjs';
import { listTimelines, getDefaultTimeline, findTimelineByRef } from '../models/timeline.mjs';

function serialize(evt, timelinesById) {
  const tl = timelinesById?.get(String(evt.timelineId)) || null;
  return {
    id: String(evt._id),
    title: evt.title,
    startsAt: new Date(evt.startsAt).toISOString(),
    endsAt: evt.endsAt ? new Date(evt.endsAt).toISOString() : null,
    allDay: !!evt.allDay,
    color: evt.color || '#4f8cff',
    notes: evt.notes || '',
    timeline: tl ? tl.slug : null
  };
}

async function timelineMap() {
  const timelines = await listTimelines();
  return new Map(timelines.map((t) => [String(t._id), t]));
}

/**
 * Resolve an optional timeline name/slug to a timeline doc.
 * Returns { timeline } (null when no ref given) or { error } listing valid slugs.
 */
async function resolveTimeline(ref) {
  if (!ref) return { timeline: null };
  const timeline = await findTimelineByRef(ref);
  if (timeline) return { timeline };
  const valid = (await listTimelines()).map((t) => t.slug).join(', ');
  return { error: `No timeline matches "${ref}". Valid timelines: ${valid || '(none yet)'}.` };
}

function ok(data, summary) {
  return {
    content: [
      { type: 'text', text: summary },
      { type: 'text', text: JSON.stringify(data, null, 2) }
    ]
  };
}

function fail(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function parseWhen(startsAt, endsAt, allDay) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) throw new Error(`Invalid startsAt: "${startsAt}"`);
  let end = null;
  if (!allDay && endsAt) {
    end = new Date(endsAt);
    if (Number.isNaN(end.getTime())) throw new Error(`Invalid endsAt: "${endsAt}"`);
    if (end < start) throw new Error('endsAt must be after startsAt');
  }
  return { start, end };
}

export function createTimelineServer() {
  const server = new McpServer({ name: 'timeline', version: '1.1.0' });

  server.registerTool(
    'list_timelines',
    {
      title: 'List timelines',
      description:
        'List all timelines (calendars) events can belong to. Use a timeline slug or name with the other tools to target a specific timeline.',
      inputSchema: {}
    },
    async () => {
      const timelines = (await listTimelines()).map((t) => ({
        id: String(t._id),
        name: t.name,
        slug: t.slug,
        color: t.color,
        isDefault: !!t.isDefault
      }));
      return ok(timelines, `Found ${timelines.length} timeline(s).`);
    }
  );

  server.registerTool(
    'next_events',
    {
      title: 'List next events',
      description:
        'Return the next upcoming events (soonest first, in-progress events included). Defaults to 10 across all timelines; pass timeline to filter.',
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional().describe('How many events to return (default 10).'),
        timeline: z.string().optional().describe('Only events from this timeline (slug or name).')
      }
    },
    async ({ limit, timeline }) => {
      const { timeline: tl, error } = await resolveTimeline(timeline);
      if (error) return fail(error);
      const byId = await timelineMap();
      const events = (await findNext({ limit: limit ?? 10, timelineId: tl?._id })).map((e) => serialize(e, byId));
      return ok(events, `Found ${events.length} upcoming event(s)${tl ? ` on "${tl.name}"` : ''}.`);
    }
  );

  server.registerTool(
    'create_event',
    {
      title: 'Create event',
      description:
        'Create a new event. Provide startsAt (and optionally endsAt) as ISO 8601 datetimes. For an all-day event set allDay=true; endsAt is then ignored. Pass timeline (slug or name, see list_timelines) to choose which timeline it belongs to; defaults to the default timeline.',
      inputSchema: {
        title: z.string().min(1).describe('Event title.'),
        startsAt: z.string().describe('Start as ISO 8601, e.g. 2026-07-08T14:30:00.'),
        endsAt: z.string().optional().describe('End as ISO 8601 (optional).'),
        allDay: z.boolean().optional().describe('All-day event (default false).'),
        color: z.string().optional().describe('Hex color, e.g. #4f8cff.'),
        notes: z.string().optional().describe('Free-form notes.'),
        timeline: z.string().optional().describe('Timeline slug or name (default: the default timeline).')
      }
    },
    async ({ title, startsAt, endsAt, allDay = false, color, notes, timeline }) => {
      try {
        const { start, end } = parseWhen(startsAt, endsAt, allDay);
        const { timeline: tl, error } = await resolveTimeline(timeline);
        if (error) return fail(error);
        const target = tl || (await getDefaultTimeline());
        const evt = await createEvent({
          title,
          startsAt: start,
          endsAt: end,
          allDay,
          timelineId: target?._id ?? null,
          ...(color ? { color } : {}),
          ...(notes ? { notes } : {})
        });
        return ok(serialize(evt.toObject(), await timelineMap()), `Created "${title}"${target ? ` on "${target.name}"` : ''}.`);
      } catch (err) {
        return fail(`Could not create event: ${err.message}`);
      }
    }
  );

  server.registerTool(
    'update_event',
    {
      title: 'Update event',
      description:
        'Update an existing event by id. Only the fields you pass are changed. To reschedule, pass startsAt (and endsAt). Pass timeline (slug or name) to move the event to another timeline.',
      inputSchema: {
        id: z.string().describe('The event id.'),
        title: z.string().min(1).optional(),
        startsAt: z.string().optional().describe('New start as ISO 8601.'),
        endsAt: z.string().nullable().optional().describe('New end as ISO 8601, or null to clear.'),
        allDay: z.boolean().optional(),
        color: z.string().optional(),
        notes: z.string().optional(),
        timeline: z.string().optional().describe('Move the event to this timeline (slug or name).')
      }
    },
    async ({ id, title, startsAt, endsAt, allDay, color, notes, timeline }) => {
      try {
        const existing = await getEvent(id);
        if (!existing) return fail(`No event found with id ${id}.`);

        const update = {};
        if (title !== undefined) update.title = title;
        if (allDay !== undefined) update.allDay = allDay;
        if (color !== undefined) update.color = color;
        if (notes !== undefined) update.notes = notes;

        if (timeline !== undefined) {
          const { timeline: tl, error } = await resolveTimeline(timeline);
          if (error) return fail(error);
          update.timelineId = tl._id;
        }

        if (startsAt !== undefined) {
          const start = new Date(startsAt);
          if (Number.isNaN(start.getTime())) return fail(`Invalid startsAt: "${startsAt}"`);
          update.startsAt = start;
        }
        if (endsAt !== undefined) {
          if (endsAt === null) {
            update.endsAt = null;
          } else {
            const end = new Date(endsAt);
            if (Number.isNaN(end.getTime())) return fail(`Invalid endsAt: "${endsAt}"`);
            update.endsAt = end;
          }
        }

        const evt = await updateEvent(id, update);
        return ok(serialize(evt.toObject(), await timelineMap()), `Updated "${evt.title}".`);
      } catch (err) {
        return fail(`Could not update event: ${err.message}`);
      }
    }
  );

  server.registerTool(
    'delete_event',
    {
      title: 'Delete event',
      description: 'Delete an event by id.',
      inputSchema: {
        id: z.string().describe('The event id.')
      }
    },
    async ({ id }) => {
      try {
        const evt = await deleteEvent(id);
        if (!evt) return fail(`No event found with id ${id}.`);
        return ok(serialize(evt.toObject(), await timelineMap()), `Deleted "${evt.title}".`);
      } catch (err) {
        return fail(`Could not delete event: ${err.message}`);
      }
    }
  );

  return server;
}
