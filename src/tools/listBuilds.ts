import { z } from "zod";
import type { Tool, ToolContext } from "./types.js";

/**
 * List builds tool - retrieves top 10 commits from a branch (default: main)
 */
export const listBuildsTool: Tool = {
  name: "list_builds",
  config: {
    title: "List Builds",
    description: "Get top 10 commits from a branch (default: main)",
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
      const { data } = await octokit.repos.listCommits({
        owner: process.env.GITHUB_OWNER!,
        repo: project,
        sha: branch, // Branch or commit SHA
        per_page: 10, // Top 10 commits
      });

      // Send structured log via MCP protocol
      await server.server.sendLoggingMessage({
        level: "info",
        data: JSON.stringify({
          event: "list_builds_success",
          count: data.length,
          repo: project,
          branch,
        }),
      });

      const commits = data.map((commit) => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author?.name,
        email: commit.commit.author?.email,
        date: commit.commit.author?.date,
        url: commit.html_url,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(commits, null, 2) }],
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
