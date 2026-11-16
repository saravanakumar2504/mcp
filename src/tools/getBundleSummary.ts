import { z } from "zod";
import AdmZip from "adm-zip";
import type { Tool, ToolContext } from "./types.js";

/**
 * Get bundle summary tool - retrieves bundle analysis for a specific build
 */
export const getBundleSummaryTool: Tool = {
  name: "get_bundle_summary",
  config: {
    title: "Get Bundle Summary",
    description: "Get detailed bundle analysis report for a specific commit including bundle sizes, route sizes, largest routes, static/dynamic route counts, and webpack bundle statistics. Use this when user wants bundle analysis, bundle size, bundle report, or route sizes for a specific commit SHA.",
    inputSchema: {
      buildId: z.string().describe("Commit SHA (short or full) to get bundle analysis for"),
      project: z.string().describe("Repository name"),
    },
  },
  handler: async (
    { buildId, project }: { buildId: string; project: string },
    { octokit, server }: ToolContext
  ) => {
    await server.server.sendLoggingMessage({
      level: "info",
      data: JSON.stringify({
        event: "get_bundle_summary_called",
        buildId,
        project,
      }),
    });

    try {
      // Step 1: Find workflow run for this commit (accepts short or full SHA)
      const workflowRun = await findWorkflowRun(octokit, project, buildId);

      // Step 2: Find bundle artifact (use full SHA for artifact name)
      const artifact = await findBundleArtifact(octokit, project, workflowRun.id, workflowRun.fullSha);

      // Step 3: Download and extract artifact
      const bundleData = await downloadAndExtract(octokit, project, artifact.id);

      // Step 4: Format summary
      const summary = formatSummary(bundleData);

      await server.server.sendLoggingMessage({
        level: "info",
        data: JSON.stringify({
          event: "get_bundle_summary_success",
          buildId,
          project,
        }),
      });

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    } catch (error: any) {
      await server.server.sendLoggingMessage({
        level: "error",
        data: JSON.stringify({
          event: "get_bundle_summary_error",
          error: error.message,
          buildId,
          project,
        }),
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error.message,
              buildId,
              project,
            }),
          },
        ],
        isError: true,
      };
    }
  },
};

// Helper functions
async function findWorkflowRun(octokit: any, project: string, commitSha: string): Promise<{ id: number; fullSha: string }> {
  // Step 1: Resolve short SHA to full SHA (if needed)
  let fullSha = commitSha;
  if (commitSha.length < 40) {
    const { data: commit } = await octokit.repos.getCommit({
      owner: process.env.GITHUB_OWNER!,
      repo: project,
      ref: commitSha,
    });
    fullSha = commit.sha;
  }

  // Step 2: Find workflow runs for this specific commit (using full SHA)
  const { data } = await octokit.actions.listWorkflowRunsForRepo({
    owner: process.env.GITHUB_OWNER!,
    repo: project,
    head_sha: fullSha,
    per_page: 1,
  });

  if (data.workflow_runs.length === 0) {
    throw new Error(`No workflow runs found for commit ${fullSha}`);
  }

  const workflowRun = data.workflow_runs[0];

  return {
    id: workflowRun.id,
    fullSha: fullSha,
  };
}

async function findBundleArtifact(octokit: any, project: string, runId: number, commitSha: string): Promise<{ id: number }> {
  // List all artifacts for this workflow run
  const { data } = await octokit.actions.listWorkflowRunArtifacts({
    owner: process.env.GITHUB_OWNER!,
    repo: project,
    run_id: runId,
  });

  // Find the bundle-report artifact
  const artifactName = `bundle-report-${commitSha}`;
  const artifact = data.artifacts.find((a: any) => a.name === artifactName);

  if (!artifact) {
    throw new Error(`Artifact "${artifactName}" not found. Available: ${data.artifacts.map((a: any) => a.name).join(", ")}`);
  }

  return {
    id: artifact.id,
  };
}

async function downloadAndExtract(octokit: any, project: string, artifactId: number): Promise<any> {
  // Download artifact as ZIP
  const { data } = await octokit.actions.downloadArtifact({
    owner: process.env.GITHUB_OWNER!,
    repo: project,
    artifact_id: artifactId,
    archive_format: "zip",
  });

  // Convert to Buffer (data is ArrayBuffer)
  const zipBuffer = Buffer.from(data as ArrayBuffer);

  // Extract ZIP
  const zip = new AdmZip(zipBuffer);

  // Find bundle-stats.json in ZIP
  const bundleStatsEntry = zip.getEntry("bundle-stats.json");

  if (!bundleStatsEntry) {
    throw new Error("bundle-stats.json not found in artifact ZIP");
  }

  // Read and parse JSON
  const content = bundleStatsEntry.getData().toString("utf8");
  const bundleData = JSON.parse(content);

  return bundleData;
}

function formatSummary(bundleData: any): any {
  // Extract top 5 largest routes (excluding API routes with 0 B)
  const top5Routes = bundleData.routes
    .filter((r: any) => r.firstLoadJS !== "0 B")
    .sort((a: any, b: any) => {
      // Parse size for sorting (e.g., "109 kB" -> 109)
      const sizeA = parseFloat(a.firstLoadJS);
      const sizeB = parseFloat(b.firstLoadJS);
      return sizeB - sizeA;
    })
    .slice(0, 5)
    .map((r: any) => ({
      path: r.path,
      type: r.type,
      size: r.size,
      firstLoadJS: r.firstLoadJS,
    }));

  return {
    buildInfo: {
      commitSha: bundleData.commitSha,
      branch: bundleData.branch,
      buildId: bundleData.buildId,
      timestamp: bundleData.timestamp,
    },
    summary: {
      totalRoutes: bundleData.summary.totalRoutes,
      staticRoutes: bundleData.summary.staticRoutes,
      dynamicRoutes: bundleData.summary.dynamicRoutes,
    },
    shared: {
      size: bundleData.shared.size,
      description: bundleData.shared.description,
    },
    largestRoute: bundleData.summary.largestRoute,
    smallestRoute: bundleData.summary.smallestRoute,
    top5Routes,
  };
}
