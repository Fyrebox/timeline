// A minimal OAuth 2.1 authorization server for the Timeline MCP endpoint,
// implementing the SDK's OAuthServerProvider interface. Single-user: the
// browser consent step is gated by one password. State is in-memory, so a
// server restart requires re-authorizing from the client (fine for personal use).
import crypto from 'node:crypto';
import { InvalidTokenError, InvalidGrantError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

const rand = (n = 32) => crypto.randomBytes(n).toString('base64url');
const nowSec = () => Math.floor(Date.now() / 1000);

const CODE_TTL_MS = 5 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_SEC = 3600;

function consentPage({ requestId, clientName, error }) {
  const safe = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize Timeline</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0e1116;color:#e6edf3;font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .card{width:100%;max-width:380px;background:#161b22;border:1px solid #2d333b;border-radius:12px;padding:28px 24px}
  h1{font-size:19px;margin:0 0 4px}
  p{color:#8b949e;margin:0 0 18px;font-size:14px}
  label{display:block;font-size:12px;color:#8b949e;margin-bottom:6px}
  input{width:100%;box-sizing:border-box;background:#0e1116;border:1px solid #2d333b;color:#e6edf3;
    border-radius:7px;padding:10px 12px;font:inherit}
  button{width:100%;margin-top:16px;background:#4f8cff;border:none;color:#fff;border-radius:7px;
    padding:11px;font:inherit;font-weight:600;cursor:pointer}
  button:hover{background:#6ea0ff}
  .err{background:rgba(255,92,92,.12);border:1px solid rgba(255,92,92,.4);color:#ff9b9b;
    padding:8px 10px;border-radius:7px;font-size:13px;margin-bottom:14px}
  .app{display:flex;align-items:center;gap:10px;margin-bottom:16px}
  .app b{font-weight:600;color:#e6edf3}
</style></head><body>
  <form class="card" method="POST" action="/oauth/consent">
    <h1>Authorize access</h1>
    <p><b>${safe(clientName)}</b> wants to connect to your Timeline.</p>
    ${error ? `<div class="err">${safe(error)}</div>` : ''}
    <label for="password">Password</label>
    <input id="password" type="password" name="password" autocomplete="current-password" autofocus required>
    <input type="hidden" name="requestId" value="${safe(requestId)}">
    <button type="submit">Authorize</button>
  </form>
</body></html>`;
}

export function createOAuthProvider({ password, staticClient } = {}) {
  const clients = new Map();
  const pending = new Map(); // requestId -> { clientId, clientName, params, expiresAt }
  const authCodes = new Map(); // code -> { clientId, codeChallenge, redirectUri, scopes, expiresAt }
  const accessTokens = new Map(); // token -> AuthInfo
  const refreshTokens = new Map(); // token -> { clientId, scopes }

  if (staticClient) clients.set(staticClient.client_id, staticClient);

  const clientsStore = {
    getClient: (id) => clients.get(id),
    registerClient: (info) => {
      clients.set(info.client_id, info); // SDK already assigned client_id/secret
      return info;
    }
  };

  function issueTokens(clientId, scopes = ['timeline'], reuseRefresh) {
    const access_token = rand(32);
    accessTokens.set(access_token, { token: access_token, clientId, scopes, expiresAt: nowSec() + TOKEN_TTL_SEC });
    let refresh_token = reuseRefresh;
    if (!refresh_token) {
      refresh_token = rand(32);
      refreshTokens.set(refresh_token, { clientId, scopes });
    }
    return { access_token, token_type: 'bearer', expires_in: TOKEN_TTL_SEC, scope: scopes.join(' '), refresh_token };
  }

  const provider = {
    get clientsStore() {
      return clientsStore;
    },

    async authorize(client, params, res) {
      const requestId = rand(18);
      pending.set(requestId, {
        clientId: client.client_id,
        clientName: client.client_name || client.client_id,
        params,
        expiresAt: Date.now() + PENDING_TTL_MS
      });
      res.set('Content-Type', 'text/html').send(
        consentPage({ requestId, clientName: client.client_name || client.client_id })
      );
    },

    async challengeForAuthorizationCode(client, code) {
      const rec = authCodes.get(code);
      if (!rec || rec.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
      return rec.codeChallenge;
    },

    async exchangeAuthorizationCode(client, code) {
      const rec = authCodes.get(code);
      if (!rec || rec.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
      authCodes.delete(code);
      if (rec.expiresAt < Date.now()) throw new InvalidGrantError('Authorization code expired');
      return issueTokens(client.client_id, rec.scopes);
    },

    async exchangeRefreshToken(client, refreshToken, scopes) {
      const rec = refreshTokens.get(refreshToken);
      if (!rec || rec.clientId !== client.client_id) throw new InvalidGrantError('Invalid refresh token');
      return issueTokens(client.client_id, scopes?.length ? scopes : rec.scopes, refreshToken);
    },

    async verifyAccessToken(token) {
      const info = accessTokens.get(token);
      if (!info || (info.expiresAt && info.expiresAt < nowSec())) {
        throw new InvalidTokenError('Token expired or invalid');
      }
      return info;
    },

    async revokeToken(client, request) {
      accessTokens.delete(request.token);
      refreshTokens.delete(request.token);
    }
  };

  // Invoked by the POST /oauth/consent route after the user enters the password.
  function completeConsent(requestId, submittedPassword) {
    const p = pending.get(requestId);
    if (!p || p.expiresAt < Date.now()) {
      pending.delete(requestId);
      return { errorPage: consentPage({ requestId, clientName: 'Unknown', error: 'This request expired. Please reconnect from your client.' }) };
    }
    if (!password) {
      return { errorPage: consentPage({ requestId, clientName: p.clientName, error: 'OAuth is not configured on the server (no password set).' }) };
    }
    if (submittedPassword !== password) {
      return { errorPage: consentPage({ requestId, clientName: p.clientName, error: 'Incorrect password.' }) };
    }

    pending.delete(requestId);
    const code = rand(24);
    const { params, clientId } = p;
    authCodes.set(code, {
      clientId,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      scopes: params.scopes?.length ? params.scopes : ['timeline'],
      expiresAt: Date.now() + CODE_TTL_MS
    });

    const url = new URL(params.redirectUri);
    url.searchParams.set('code', code);
    if (params.state) url.searchParams.set('state', params.state);
    return { redirectTo: url.toString() };
  }

  return { provider, completeConsent };
}
