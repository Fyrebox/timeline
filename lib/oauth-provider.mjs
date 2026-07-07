// A minimal OAuth 2.1 authorization server for the Timeline MCP endpoint,
// implementing the SDK's OAuthServerProvider interface. Single-user: the
// browser consent step is gated by one password.
//
// State is persisted in MongoDB (see models/oauth.mjs), so issued tokens and
// registered clients survive restarts/redeploys — no reconnect needed.
import crypto from 'node:crypto';
import { InvalidTokenError, InvalidGrantError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import {
  OAuthClient,
  OAuthAccessToken,
  OAuthRefreshToken,
  OAuthAuthCode,
  OAuthPending
} from '../models/oauth.mjs';

const rand = (n = 32) => crypto.randomBytes(n).toString('base64url');

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
  async function issueTokens(clientId, scopes = ['timeline'], reuseRefresh) {
    const access_token = rand(32);
    await OAuthAccessToken.create({
      token: access_token,
      clientId,
      scopes,
      expiresAt: new Date(Date.now() + TOKEN_TTL_SEC * 1000)
    });
    let refresh_token = reuseRefresh;
    if (!refresh_token) {
      refresh_token = rand(32);
      await OAuthRefreshToken.create({ token: refresh_token, clientId, scopes });
    }
    return { access_token, token_type: 'bearer', expires_in: TOKEN_TTL_SEC, scope: scopes.join(' '), refresh_token };
  }

  const clientsStore = {
    async getClient(id) {
      if (staticClient && id === staticClient.client_id) return staticClient;
      const doc = await OAuthClient.findOne({ clientId: id }).lean();
      return doc ? doc.info : undefined;
    },
    async registerClient(info) {
      await OAuthClient.updateOne(
        { clientId: info.client_id },
        { $set: { clientId: info.client_id, info } },
        { upsert: true }
      );
      return info;
    }
  };

  const provider = {
    get clientsStore() {
      return clientsStore;
    },

    async authorize(client, params, res) {
      const requestId = rand(18);
      await OAuthPending.create({
        requestId,
        clientId: client.client_id,
        clientName: client.client_name || client.client_id,
        codeChallenge: params.codeChallenge,
        redirectUri: params.redirectUri,
        scopes: params.scopes || [],
        state: params.state || null,
        expiresAt: new Date(Date.now() + PENDING_TTL_MS)
      });
      res.set('Content-Type', 'text/html').send(
        consentPage({ requestId, clientName: client.client_name || client.client_id })
      );
    },

    async challengeForAuthorizationCode(client, code) {
      const rec = await OAuthAuthCode.findOne({ code }).lean();
      if (!rec || rec.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
      return rec.codeChallenge;
    },

    async exchangeAuthorizationCode(client, code) {
      const rec = await OAuthAuthCode.findOneAndDelete({ code }).lean(); // one-time use
      if (!rec || rec.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code');
      if (rec.expiresAt < Date.now()) throw new InvalidGrantError('Authorization code expired');
      return issueTokens(client.client_id, rec.scopes);
    },

    async exchangeRefreshToken(client, refreshToken, scopes) {
      const rec = await OAuthRefreshToken.findOne({ token: refreshToken }).lean();
      if (!rec || rec.clientId !== client.client_id) throw new InvalidGrantError('Invalid refresh token');
      return issueTokens(client.client_id, scopes?.length ? scopes : rec.scopes, refreshToken);
    },

    async verifyAccessToken(token) {
      const info = await OAuthAccessToken.findOne({ token }).lean();
      if (!info || new Date(info.expiresAt).getTime() < Date.now()) {
        throw new InvalidTokenError('Token expired or invalid');
      }
      return {
        token: info.token,
        clientId: info.clientId,
        scopes: info.scopes || [],
        expiresAt: Math.floor(new Date(info.expiresAt).getTime() / 1000)
      };
    },

    async revokeToken(client, request) {
      await OAuthAccessToken.deleteOne({ token: request.token });
      await OAuthRefreshToken.deleteOne({ token: request.token });
    }
  };

  // Invoked by the POST /oauth/consent route after the user enters the password.
  async function completeConsent(requestId, submittedPassword) {
    const p = await OAuthPending.findOne({ requestId }).lean();
    if (!p || new Date(p.expiresAt).getTime() < Date.now()) {
      await OAuthPending.deleteOne({ requestId });
      return { errorPage: consentPage({ requestId, clientName: 'Unknown', error: 'This request expired. Please reconnect from your client.' }) };
    }
    if (!password) {
      return { errorPage: consentPage({ requestId, clientName: p.clientName, error: 'OAuth is not configured on the server (no password set).' }) };
    }
    if (submittedPassword !== password) {
      return { errorPage: consentPage({ requestId, clientName: p.clientName, error: 'Incorrect password.' }) };
    }

    await OAuthPending.deleteOne({ requestId });
    const code = rand(24);
    await OAuthAuthCode.create({
      code,
      clientId: p.clientId,
      codeChallenge: p.codeChallenge,
      redirectUri: p.redirectUri,
      scopes: p.scopes?.length ? p.scopes : ['timeline'],
      expiresAt: new Date(Date.now() + CODE_TTL_MS)
    });

    const url = new URL(p.redirectUri);
    url.searchParams.set('code', code);
    if (p.state) url.searchParams.set('state', p.state);
    return { redirectTo: url.toString() };
  }

  return { provider, completeConsent };
}
