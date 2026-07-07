// HTTP endpoint for the Timeline MCP server, mounted at /mcp.
// Stateless Streamable HTTP transport, protected by OAuth (bearer access token
// issued by our authorization server). A static MCP_TOKEN is also accepted as a
// convenience for CLI/testing.
import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { createTimelineServer } from '../mcp/build-server.mjs';

const rpcError = (message, code = -32000) => ({ jsonrpc: '2.0', error: { code, message }, id: null });

export default function mcpRouter({ provider, resourceMetadataUrl }) {
  const router = Router();
  const oauthGuard = requireBearerAuth({ verifier: provider, resourceMetadataUrl });

  // Accept the static token if configured, otherwise fall through to OAuth.
  function auth(req, res, next) {
    const staticToken = process.env.MCP_TOKEN;
    if (staticToken && req.headers.authorization === `Bearer ${staticToken}`) {
      req.auth = { token: staticToken, clientId: 'static', scopes: ['timeline'] };
      return next();
    }
    return oauthGuard(req, res, next); // 401 + WWW-Authenticate (resource metadata) if missing/invalid
  }

  router.use(auth);

  router.post('/', async (req, res) => {
    const server = createTimelineServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true
    });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp] request error:', err);
      if (!res.headersSent) res.status(500).json(rpcError('Internal server error.'));
    }
  });

  const methodNotAllowed = (req, res) => res.status(405).json(rpcError('Method not allowed. Use POST for /mcp.'));
  router.get('/', methodNotAllowed);
  router.delete('/', methodNotAllowed);

  return router;
}
