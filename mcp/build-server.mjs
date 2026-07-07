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

function serialize(evt) {
  return {
    id: String(evt._id),
    title: evt.title,
    startsAt: new Date(evt.startsAt).toISOString(),
    endsAt: evt.endsAt ? new Date(evt.endsAt).toISOString() : null,
    allDay: !!evt.allDay,
    color: evt.color || '#4f8cff',
    notes: evt.notes || ''
  };
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
  const server = new McpServer({ name: 'timeline', version: '1.0.0' });

  server.registerTool(
    'next_events',
    {
      title: 'List next events',
      description:
        'Return the next upcoming events (soonest first, in-progress events included). Defaults to 10.',
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional().describe('How many events to return (default 10).')
      }
    },
    async ({ limit }) => {
      const events = (await findNext({ limit: limit ?? 10 })).map(serialize);
      return ok(events, `Found ${events.length} upcoming event(s).`);
    }
  );

  server.registerTool(
    'create_event',
    {
      title: 'Create event',
      description:
        'Create a new event. Provide startsAt (and optionally endsAt) as ISO 8601 datetimes. For an all-day event set allDay=true; endsAt is then ignored.',
      inputSchema: {
        title: z.string().min(1).describe('Event title.'),
        startsAt: z.string().describe('Start as ISO 8601, e.g. 2026-07-08T14:30:00.'),
        endsAt: z.string().optional().describe('End as ISO 8601 (optional).'),
        allDay: z.boolean().optional().describe('All-day event (default false).'),
        color: z.string().optional().describe('Hex color, e.g. #4f8cff.'),
        notes: z.string().optional().describe('Free-form notes.')
      }
    },
    async ({ title, startsAt, endsAt, allDay = false, color, notes }) => {
      try {
        const { start, end } = parseWhen(startsAt, endsAt, allDay);
        const evt = await createEvent({
          title,
          startsAt: start,
          endsAt: end,
          allDay,
          ...(color ? { color } : {}),
          ...(notes ? { notes } : {})
        });
        return ok(serialize(evt.toObject()), `Created "${title}".`);
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
        'Update an existing event by id. Only the fields you pass are changed. To reschedule, pass startsAt (and endsAt).',
      inputSchema: {
        id: z.string().describe('The event id.'),
        title: z.string().min(1).optional(),
        startsAt: z.string().optional().describe('New start as ISO 8601.'),
        endsAt: z.string().nullable().optional().describe('New end as ISO 8601, or null to clear.'),
        allDay: z.boolean().optional(),
        color: z.string().optional(),
        notes: z.string().optional()
      }
    },
    async ({ id, title, startsAt, endsAt, allDay, color, notes }) => {
      try {
        const existing = await getEvent(id);
        if (!existing) return fail(`No event found with id ${id}.`);

        const update = {};
        if (title !== undefined) update.title = title;
        if (allDay !== undefined) update.allDay = allDay;
        if (color !== undefined) update.color = color;
        if (notes !== undefined) update.notes = notes;

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
        return ok(serialize(evt.toObject()), `Updated "${evt.title}".`);
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
        return ok(serialize(evt.toObject()), `Deleted "${evt.title}".`);
      } catch (err) {
        return fail(`Could not delete event: ${err.message}`);
      }
    }
  );

  return server;
}
