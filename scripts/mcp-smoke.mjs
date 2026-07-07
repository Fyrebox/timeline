// End-to-end smoke test for the Timeline MCP server. Spawns the server over
// stdio (as a real MCP client would), exercises every tool, and cleans up.
// Run: node scripts/mcp-smoke.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const transport = new StdioClientTransport({
  command: 'node',
  args: ['--env-file-if-exists=.env', 'mcp/server.mjs'],
  cwd: root
});

const client = new Client({ name: 'smoke', version: '1.0.0' });

// The second text block of every tool result is the JSON payload.
const payload = (res) => JSON.parse(res.content.at(-1).text);
const summary = (res) => res.content[0].text;

await client.connect(transport);

const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name).join(', '));

// 1) next_events
const list = await client.callTool({ name: 'next_events', arguments: { limit: 3 } });
console.log('\nnext_events(3):', summary(list));
console.log(payload(list).map((e) => `  • ${e.startsAt}  ${e.title}`).join('\n'));

// 2) create_event (tomorrow)
const startsAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const created = await client.callTool({
  name: 'create_event',
  arguments: { title: 'MCP smoke test', startsAt, color: '#ff5c5c', notes: 'temp' }
});
const id = payload(created).id;
console.log('\ncreate_event:', summary(created), '-> id', id);

// 3) update_event
const updated = await client.callTool({
  name: 'update_event',
  arguments: { id, title: 'MCP smoke test (edited)' }
});
console.log('update_event:', summary(updated), '-> title', payload(updated).title);

// 4) verify it shows up
const after = await client.callTool({ name: 'next_events', arguments: { limit: 50 } });
const present = payload(after).some((e) => e.id === id);
console.log('appears in next_events:', present);

// 5) delete_event (cleanup)
const deleted = await client.callTool({ name: 'delete_event', arguments: { id } });
console.log('delete_event:', summary(deleted));

// 6) error path
const bad = await client.callTool({ name: 'update_event', arguments: { id, title: 'ghost' } });
console.log('update after delete (expect error):', bad.isError, '-', bad.content[0].text);

await client.close();

const passed =
  tools.length === 4 &&
  payload(updated).title === 'MCP smoke test (edited)' &&
  present === true &&
  bad.isError === true;

console.log(`\n${passed ? 'PASS ✅' : 'FAIL ❌'}`);
process.exit(passed ? 0 : 1);
