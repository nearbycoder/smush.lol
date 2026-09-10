import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp";

// Keep stdout exclusively for MCP JSON-RPC messages.
const server = createMcpServer();
await server.connect(new StdioServerTransport());
