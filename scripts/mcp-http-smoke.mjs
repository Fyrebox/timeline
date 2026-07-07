// Smoke test for the HTTP MCP endpoint (/mcp). Connects over the Streamable
// HTTP transport with the bearer token, exercises the tools, and checks that
// requests without a valid token are rejected.
//
// Usage: MCP_URL=http://localhost:3210/mcp MCP_TOKEN=... node scripts/mcp-http-smoke.mjs
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const URL_ = process.env.MCP_URL || 'http://localhost:3210/mcp';
const TOKEN = process.env.MCP_TOKEN;
if (!TOKEN) {
  console.error('Set MCP_TOKEN (same value as the server).');
  process.exit(1);
}

const payload = (res) => JSON.parse(res.content.at(-1).text);
const summary = (res) => res.content[0].text;

function makeClient(token) {
  const transport = new StreamableHTTPClientTransport(new URL(URL_), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : {}
  });
  return { client: new Client({ name: 'http-smoke', version: '1.0.0' }), transport };
}

// 1) unauthorized request should fail
let authRejected = false;
try {
  const { client, transport } = makeClient('wrong-token');
  await client.connect(transport);
  await client.close();
} catch {
  authRejected = true;
}
console.log('rejects bad token:', authRejected);

// 2) authorized flow
const { client, transport } = makeClient(TOKEN);
await client.connect(transport);

const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name).join(', '));

const list = await client.callTool({ name: 'next_events', arguments: { limit: 3 } });
console.log('\nnext_events(3):', summary(list));
console.log(payload(list).map((e) => `  • ${e.startsAt}  ${e.title}`).join('\n'));

const startsAt = new Date(Date.now() + 36 * 3600 * 1000).toISOString();
const created = await client.callTool({
  name: 'create_event',
  arguments: { title: 'HTTP MCP smoke', startsAt, color: '#26de81' }
});
const id = payload(created).id;
console.log('\ncreate_event:', summary(created), '-> id', id);

const deleted = await client.callTool({ name: 'delete_event', arguments: { id } });
console.log('delete_event:', summary(deleted));

await client.close();

const passed = authRejected && tools.length === 4 && !!id;
console.log(`\n${passed ? 'PASS ✅' : 'FAIL ❌'}`);
process.exit(passed ? 0 : 1);
