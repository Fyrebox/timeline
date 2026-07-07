import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { connectMongo } from './db/mongo.mjs';
import { createOAuthProvider } from './lib/oauth-provider.mjs';
import pagesRouter from './routes/pages.mjs';
import eventsRouter from './routes/events.mjs';
import mcpRouter from './routes/mcp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';

// Public origin, used as the OAuth issuer / resource identifier.
const PUBLIC_URL = (
  process.env.PUBLIC_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${PORT}`)
).replace(/\/$/, '');

// OAuth consent password (falls back to MCP_TOKEN so there's one secret to set).
const OAUTH_PASSWORD = process.env.OAUTH_PASSWORD || process.env.MCP_TOKEN || '';

// Optional pre-registered ("static") client, for clients that require you to
// paste a client id/secret instead of doing dynamic registration.
const staticClient =
  process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET
    ? {
        client_id: process.env.OAUTH_CLIENT_ID,
        client_secret: process.env.OAUTH_CLIENT_SECRET,
        redirect_uris: (process.env.OAUTH_REDIRECT_URIS ||
          'https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_post',
        scope: 'timeline',
        client_name: 'Claude (Timeline)'
      }
    : null;

const { provider, completeConsent } = createOAuthProvider({ password: OAUTH_PASSWORD, staticClient });

const app = express();

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Cache-busting token for static assets, bumped on every restart/deploy.
const ASSET_VERSION = Date.now().toString(36);
app.use((req, res, next) => {
  res.locals.assetVersion = ASSET_VERSION;
  next();
});

// OAuth authorization-server + protected-resource metadata, /authorize, /token,
// /register (dynamic client registration), /revoke. Must be mounted at root.
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: new URL(PUBLIC_URL),
    baseUrl: new URL(PUBLIC_URL),
    resourceServerUrl: new URL(`${PUBLIC_URL}/mcp`),
    scopesSupported: ['timeline'],
    resourceName: 'Timeline'
  })
);

// Consent form submission (the browser step of the authorization flow).
app.post('/oauth/consent', async (req, res, next) => {
  try {
    const { requestId, password } = req.body;
    const result = await completeConsent(requestId, password);
    if (result.redirectTo) return res.redirect(result.redirectTo);
    return res.status(400).type('html').send(result.errorPage);
  } catch (err) {
    next(err);
  }
});

app.use('/', pagesRouter);
app.use('/events', eventsRouter);
app.use(
  '/mcp',
  mcpRouter({
    provider,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(`${PUBLIC_URL}/mcp`))
  })
);

// Basic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong.');
});

// Try Mongo (non-fatal in Phase 1), then start.
await connectMongo(MONGODB_URI);

app.listen(PORT, () => {
  console.log(`[timeline] ${PUBLIC_URL} (listening on :${PORT})`);
  if (!OAUTH_PASSWORD) console.warn('[timeline] No OAUTH_PASSWORD/MCP_TOKEN set — the /mcp OAuth consent cannot be completed.');
});
