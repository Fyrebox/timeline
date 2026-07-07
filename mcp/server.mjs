// Stdio entry for the Timeline MCP server (for Claude Desktop / Claude Code,
// which launch it as a subprocess). For the HTTP endpoint see routes/mcp.mjs.
//
// Run standalone: node --env-file-if-exists=.env mcp/server.mjs
import mongoose from 'mongoose';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createTimelineServer } from './build-server.mjs';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('[mcp] MONGODB_URI is not set. Provide it via .env or the environment.');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
console.error(`[mcp] connected to MongoDB: ${mongoose.connection.name}`);

const server = createTimelineServer();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[mcp] timeline MCP server ready on stdio.');
