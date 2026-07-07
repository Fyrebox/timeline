// HTTP endpoint for the Timeline MCP server, mounted at /mcp.
// Uses the MCP Streamable HTTP transport in stateless mode (a fresh server +
// transport per request), guarded by a bearer token.
//
// Protect it by setting MCP_TOKEN in the environment. Clients then send:
//   Authorization: Bearer <MCP_TOKEN>
import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createTimelineServer } from '../mcp/build-server.mjs';

const router = Router();

const rpcError = (message, code = -32000) => ({
  jsonrpc: '2.0',
  error: { code, message },
  id: null
});

// GET/DELETE aren't used in stateless mode.
const methodNotAllowed = (req, res) =>
  res.status(405).json(rpcError('Method not allowed. Use POST for /mcp.'));
router.get('/', methodNotAllowed);
router.delete('/', methodNotAllowed);

router.post('/', async (req, res) => {
  const token = process.env.MCP_TOKEN;
  if (!token) {
    // Fail closed: never expose event mutation without a configured token.
    return res.status(503).json(rpcError('MCP endpoint is not configured (set MCP_TOKEN).'));
  }
  if (req.headers.authorization !== `Bearer ${token}`) {
    return res.status(401).json(rpcError('Unauthorized.'));
  }

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

export default router;
