import { Octokit } from "@octokit/rest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface ToolContext {
  octokit: Octokit;
  server: McpServer;
}

export interface ToolConfig {
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}

export interface Tool {
  name: string;
  config: ToolConfig;
  handler: (input: any, context: ToolContext) => Promise<{
    content: Array<{
      type: "text";
      text: string;
    }>;
  }>;
}
