import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env from current working directory (project), then server directory as fallback
const serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: [
    path.join(process.cwd(), ".env"),           // Project's .env
    path.join(serverDir, ".env"),               // Server's .env
    path.join(serverDir, "..", ".env")          // Parent .env
  ],
});

import { Octokit } from "@octokit/rest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools } from "./src/tools/index.js";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const server = new McpServer(
  {
    name: "bundle-analysis-mcp",
    version: "1.0.0",
  },
  { capabilities: { logging: {} } }
);

// Register all tools
tools.forEach((tool) => {
  server.registerTool(
    tool.name,
    tool.config,
    (input: any) => tool.handler(input, { octokit, server })
  );
});

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("🚀 [MCP Server] bundle-analysis-mcp started and connected");

/*
{
  "mcpServers": {
    "bundle-analysis": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}


{
  "mcpServers": {
    "bundle-analysis": {
      "type": "stdio",
      "command": "node",
      "args": [
        "/Users/saravanakumar_kathirvel/projects/mcp/dist/server.js"
      ]
    }
  }
}*/

//  cat "/Users/saravanakumar_kathirvel/Library/Application Support/Claude/claude_desktop_config.json"

/* Visual Diagram:

┌─────────────────────────────────────┐
│  Next.js Dev Server (Parent)       │
│  Terminal: npm run dev              │
│                                     │
│  ┌───────────────────────────────┐ │
│  │  MCP Server (Child Process)   │ │
│  │                               │ │
│  │  stdout ──→ MCP Protocol     │ │
│  │            (JSON-RPC msgs)   │ │
│  │                               │ │
│  │  stderr ──→ [Inherited]      │ │
│  └───────────────┬───────────────┘ │
│                  │                  │
│                  ↓                  │
│  Your Terminal Shows Both:         │
│  - Next.js logs                    │
│  - MCP Server logs (via stderr) ✅ │
└─────────────────────────────────────┘ */
