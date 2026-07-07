// End-to-end OAuth smoke test for the /mcp endpoint. Simulates what an MCP
// client (e.g. Claude) does: discover metadata, dynamically register, run the
// PKCE authorization-code flow (with the browser consent POST), exchange the
// code, refresh, and call a tool with the access token.
//
// Usage: BASE=http://localhost:3210 OAUTH_PASSWORD=... node scripts/mcp-oauth-smoke.mjs
import crypto from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = (process.env.BASE || 'http://localhost:3210').replace(/\/$/, '');
const PASSWORD = process.env.OAUTH_PASSWORD || process.env.MCP_TOKEN;
if (!PASSWORD) {
  console.error('Set OAUTH_PASSWORD (or MCP_TOKEN) to the server consent password.');
  process.exit(1);
}

const b64url = (buf) => buf.toString('base64url');
const j = async (res) => {
  const t = await res.text();
  try { return JSON.parse(t); } catch { return t; }
};
const results = {};

// 0) Unauthenticated /mcp must 401 with a WWW-Authenticate pointing to resource metadata.
{
  const r = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  });
  results.unauth401 = r.status === 401;
  results.wwwAuthHasResourceMetadata = /resource_metadata=/.test(r.headers.get('www-authenticate') || '');
}

// 1) Protected-resource metadata -> authorization server.
const prm = await j(await fetch(`${BASE}/.well-known/oauth-protected-resource/mcp`));
const asUrl = prm.authorization_servers[0];
results.discoveredAS = asUrl;

// 2) Authorization-server metadata.
const asMeta = await j(await fetch(`${asUrl.replace(/\/$/, '')}/.well-known/oauth-authorization-server`));
const { authorization_endpoint, token_endpoint, registration_endpoint } = asMeta;
results.hasEndpoints = !!(authorization_endpoint && token_endpoint && registration_endpoint);

// 3) Dynamic client registration.
const redirectUri = 'http://localhost:9999/callback';
const reg = await j(
  await fetch(registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'oauth-smoke',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_post'
    })
  })
);
results.registered = !!reg.client_id;
const clientId = reg.client_id;
const clientSecret = reg.client_secret;

// 4) PKCE + authorize -> consent page.
const codeVerifier = b64url(crypto.randomBytes(32));
const codeChallenge = b64url(crypto.createHash('sha256').update(codeVerifier).digest());
const state = b64url(crypto.randomBytes(8));
const authUrl = new URL(authorization_endpoint);
authUrl.search = new URLSearchParams({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: redirectUri,
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
  scope: 'timeline',
  state
}).toString();
const consentHtml = await (await fetch(authUrl)).text();
const requestId = (consentHtml.match(/name="requestId" value="([^"]+)"/) || [])[1];
results.gotConsentForm = !!requestId;

// 5) Submit consent (the password step), capture the redirect with ?code=.
const consentRes = await fetch(`${BASE}/oauth/consent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ requestId, password: PASSWORD }).toString(),
  redirect: 'manual'
});
const location = consentRes.headers.get('location') || '';
const code = new URL(location, BASE).searchParams.get('code');
const returnedState = new URL(location, BASE).searchParams.get('state');
results.gotCode = !!code;
results.stateRoundTrips = returnedState === state;

// 6) Exchange code -> tokens.
const tok = await j(
  await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier
    }).toString()
  })
);
results.gotAccessToken = !!tok.access_token;
results.gotRefreshToken = !!tok.refresh_token;

// 7) Wrong password is rejected (fresh authorize -> consent -> bad password).
{
  const a = new URL(authorization_endpoint);
  a.search = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri,
    code_challenge: codeChallenge, code_challenge_method: 'S256', scope: 'timeline', state
  }).toString();
  const html = await (await fetch(a)).text();
  const rid = (html.match(/name="requestId" value="([^"]+)"/) || [])[1];
  const bad = await fetch(`${BASE}/oauth/consent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ requestId: rid, password: 'wrong' }).toString(),
    redirect: 'manual'
  });
  results.wrongPasswordRejected = bad.status !== 302; // no redirect issued
}

// 8) Use the access token against /mcp via the real transport.
const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${tok.access_token}` } }
});
const client = new Client({ name: 'oauth-smoke', version: '1.0.0' });
await client.connect(transport);
const tools = (await client.listTools()).tools.map((t) => t.name);
const list = await client.callTool({ name: 'next_events', arguments: { limit: 2 } });
results.toolCallWorks = list.content?.length > 0;
results.toolCount = tools.length;
await client.close();

// 9) Refresh token grant.
const refreshed = await j(
  await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tok.refresh_token,
      client_id: clientId,
      client_secret: clientSecret
    }).toString()
  })
);
results.refreshWorks = !!refreshed.access_token;

console.log(JSON.stringify(results, null, 2));
const passed = Object.entries(results).every(([k, v]) => (k === 'discoveredAS' || k === 'toolCount' ? true : v === true));
console.log(`\n${passed ? 'PASS ✅' : 'FAIL ❌'}`);
process.exit(passed ? 0 : 1);
