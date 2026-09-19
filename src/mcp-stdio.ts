import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createMcpServer } from "./mcp";

// Keep stdout exclusively for MCP JSON-RPC messages. Serve both protocol eras.
const handle = serveStdio(createMcpServer, { legacy: "serve", maxSubscriptions: 0 });
process.once("SIGINT", () => { void handle.close(); });
process.once("SIGTERM", () => { void handle.close(); });
