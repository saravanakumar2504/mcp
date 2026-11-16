import { z } from "zod";
import type { Tool, ToolContext } from "./types.js";

/**
 * List builds tool - retrieves build reports and commit IDs for a project
 */
export const listBuildsTool: Tool = {
  name: "list_builds",
  config: {
    title: "List Builds",
    description: "List all recent builds, workflow runs, and commit history for a repository. Use this when user wants to see available builds, latest builds, all builds, recent commits, or workflow runs for a project.",
    inputSchema: {
      project: z.string().describe("Repository name"),
      branch: z.string().optional().describe("Branch name (defaults to 'main')"),
    },
  },
  handler: async (
    { project, branch = "main" }: { project: string; branch?: string },
    { octokit, server }: ToolContext
  ) => {
    // Send structured log via MCP protocol
    await server.server.sendLoggingMessage({
      level: "info",
      data: JSON.stringify({
        event: "list_builds_called",
        owner: process.env.GITHUB_OWNER,
        repo: project,
        branch,
      }),
    });

    try {
      const { data } = await octokit.actions.listWorkflowRunsForRepo({
        owner: process.env.GITHUB_OWNER!,
        repo: project,
        branch: branch,
      });

      // Send structured log via MCP protocol
      await server.server.sendLoggingMessage({
        level: "info",
        data: JSON.stringify({
          event: "list_builds_success",
          count: data.workflow_runs.length,
          repo: project,
          branch,
        }),
      });

      const builds = data.workflow_runs.map((run) => ({
        buildId: run.id,
        commitId: run.head_sha,
        status: run.status,
        conclusion: run.conclusion,
        date: run.created_at,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(builds, null, 2) }],
      };
    } catch (error: any) {
      // Send error log via MCP protocol
      await server.server.sendLoggingMessage({
        level: "error",
        data: JSON.stringify({
          event: "list_builds_error",
          error: error.message,
          repo: project,
          branch,
        }),
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error.message,
              repo: project,
              branch,
            }),
          },
        ],
        isError: true,
      };
    }
  },
};
