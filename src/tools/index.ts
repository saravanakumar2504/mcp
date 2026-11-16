import { listBuildsTool } from "./listBuilds.js";
import { getBundleSummaryTool } from "./getBundleSummary.js";
import type { Tool } from "./types.js";

/**
 * Export all tools from a single entry point
 */
export const tools: Tool[] = [
  listBuildsTool,
  getBundleSummaryTool,
];
