import { z } from "zod";
import type { Tool, ToolContext } from "./types.js";
import { CacheManager } from "./cache.js";
import { getBundleSummaryTool } from "./getBundleSummary.js";
import { compareRoutes, analyzeAssets } from "./comparison.js";
import {
  parseSizeToBytes,
  calculateDelta,
  formatDelta,
  getRiskLevel,
  loadBudgetConfig,
  validateAgainstBudget,
} from "./utils/compare_builds/index.js";

const comparisonCache = new CacheManager<any>(60); // 60 minute TTL

/**
 * Compare two builds - calculates delta between baseline and candidate
 */
export const compareBuildTool: Tool = {
  name: "compare_builds",
  config: {
    title: "Compare Builds",
    description:
      "Compare two builds (baseline vs candidate) to analyze bundle size changes, route differences, and asset modifications. Use this when user wants to compare commits, see size changes, or evaluate if a PR increases bundle size.",
    inputSchema: {
      baselineId: z.string().describe("Commit SHA (short or full) for baseline/reference build"),
      candidateId: z.string().describe("Commit SHA (short or full) for candidate/new build"),
      project: z.string().describe("Repository name"),
    },
  },
  handler: async (
    { baselineId, candidateId, project }: { baselineId: string; candidateId: string; project: string },
    { octokit, server }: ToolContext
  ) => {
    const cacheKey = `${project}:compare:${baselineId}:${candidateId}`;

    await server.server.sendLoggingMessage({
      level: "info",
      data: JSON.stringify({
        event: "compare_builds_called",
        baselineId,
        candidateId,
        project,
      }),
    });

    try {
      // Check comparison cache first
      const cached = comparisonCache.get(cacheKey);
      if (cached) {
        await server.server.sendLoggingMessage({
          level: "info",
          data: JSON.stringify({
            event: "compare_builds_cache_hit",
            baselineId,
            candidateId,
            project,
          }),
        });

        return {
          content: [{ type: "text", text: JSON.stringify(cached, null, 2) }],
        };
      }

      // Fetch baseline bundle
      await server.server.sendLoggingMessage({
        level: "info",
        data: JSON.stringify({
          event: "compare_builds_fetching_baseline",
          baselineId,
          project,
        }),
      });

      const baselineResult = await getBundleSummaryTool.handler(
        { buildId: baselineId, project },
        { octokit, server }
      );

      const baselineData = JSON.parse(baselineResult.content[0].text);
      if (!baselineData.buildInfo) {
        throw new Error(`Failed to fetch baseline bundle for commit ${baselineId}`);
      }

      // Fetch candidate bundle
      await server.server.sendLoggingMessage({
        level: "info",
        data: JSON.stringify({
          event: "compare_builds_fetching_candidate",
          candidateId,
          project,
        }),
      });

      const candidateResult = await getBundleSummaryTool.handler(
        { buildId: candidateId, project },
        { octokit, server }
      );

      const candidateData = JSON.parse(candidateResult.content[0].text);
      if (!candidateData.buildInfo) {
        throw new Error(`Failed to fetch candidate bundle for commit ${candidateId}`);
      }

      // Calculate total sizes
      const baselineSharedBytes = parseSizeToBytes(baselineData.shared.size);
      const candidateSharedBytes = parseSizeToBytes(candidateData.shared.size);

      // Calculate total route sizes
      const baselineTotal = calculateTotalRouteSize(baselineData.top5Routes);
      const candidateTotal = calculateTotalRouteSize(candidateData.top5Routes);

      // Calculate total bundle size (routes + shared)
      const baselineBundleTotal = baselineTotal + baselineSharedBytes;
      const candidateBundleTotal = candidateTotal + candidateSharedBytes;

      // Compare routes
      const routeComparison = compareRoutes(
        baselineData.top5Routes || [],
        candidateData.top5Routes || []
      );

      // Analyze assets
      const assetAnalysis = analyzeAssets(baselineData, candidateData);

      // Calculate deltas
      const totalDelta = calculateDelta(baselineBundleTotal, candidateBundleTotal);
      const sharedDelta = calculateDelta(baselineSharedBytes, candidateSharedBytes);

      // Load budget config
      const budgetConfigs = await loadBudgetConfig();
      const projectBudget = budgetConfigs[project] || budgetConfigs["default"];
      const budgetValidation = validateAgainstBudget(
        baselineBundleTotal,
        candidateBundleTotal,
        projectBudget
      );

      // Generate recommendations
      const increasedRoutes = routeComparison
        .filter((r) => r.delta.status === "Increased")
        .slice(0, 3);

      const recommendations: string[] = [];

      // Analyze shared chunk impact
      if (sharedDelta.absolute.sizeBytes > 0) {
        const formatted = formatDelta(
          sharedDelta.absolute.sizeBytes,
          sharedDelta.percentage
        );
        recommendations.push(
          `Shared code increased by ${formatted.displaySize}. Consider tree-shaking or code-splitting.`
        );
      }

      // Find routes with largest increases
      if (increasedRoutes.length > 0) {
        const routesList = increasedRoutes
          .map((r) => `${r.path} (${r.delta.displaySize})`)
          .join(", ");
        recommendations.push(
          `Route increases detected: ${routesList}. Investigate for code duplication.`
        );
      }

      // Analyze added assets
      if (assetAnalysis.added.length > 0) {
        const addedNames = assetAnalysis.added
          .slice(0, 3)
          .map((a) => `${a.name} (${a.size})`)
          .join(", ");
        recommendations.push(`New routes/assets added: ${addedNames}.`);
      }

      // Analyze removed assets
      if (assetAnalysis.removed.length > 0) {
        const removedNames = assetAnalysis.removed
          .slice(0, 2)
          .map((r) => `${r.name} (${r.size})`)
          .join(", ");
        recommendations.push(`Removed routes/assets: ${removedNames}. Good optimization.`);
      }

      // If no significant changes
      if (recommendations.length === 0) {
        recommendations.push("No significant bundle changes detected.");
      }

      // Generate summary
      let summary = "";
      if (totalDelta.absolute.sizeBytes > 0) {
        const formatted = formatDelta(
          totalDelta.absolute.sizeBytes,
          totalDelta.percentage
        );
        summary = `Bundle size increased by ${formatted.displaySize}.`;
      } else if (totalDelta.absolute.sizeBytes < 0) {
        const formatted = formatDelta(
          totalDelta.absolute.sizeBytes,
          totalDelta.percentage
        );
        summary = `Bundle size reduced by ${formatted.displaySize}.`;
      } else {
        summary = "No bundle size change detected.";
      }

      // Determine risk level
      const riskLevel = getRiskLevel(totalDelta.percentage);

      // Format final comparison result
      const comparison = {
        metadata: {
          baselineId: baselineData.buildInfo.commitSha,
          candidateId: candidateData.buildInfo.commitSha,
          project,
          timestamp: new Date().toISOString(),
          baselineTimestamp: baselineData.buildInfo.timestamp,
          candidateTimestamp: candidateData.buildInfo.timestamp,
        },

        totalSize: {
          baseline: {
            size: formatSizeFromBytes(baselineBundleTotal),
            sizeBytes: baselineBundleTotal,
          },
          candidate: {
            size: formatSizeFromBytes(candidateBundleTotal),
            sizeBytes: candidateBundleTotal,
          },
          delta: {
            absolute: {
              size: formatSizeFromBytes(Math.abs(totalDelta.absolute.sizeBytes)),
              sizeBytes: totalDelta.absolute.sizeBytes,
            },
            displaySize: formatDelta(totalDelta.absolute.sizeBytes, totalDelta.percentage)
              .displaySize,
            percentage: totalDelta.percentage,
            status: totalDelta.status,
          },
        },

        routeComparison,

        assetAnalysis,

        sharedChunk: {
          baseline: baselineData.shared.size,
          candidate: candidateData.shared.size,
          delta: {
            size: formatSizeFromBytes(Math.abs(sharedDelta.absolute.sizeBytes)),
            displaySize: formatDelta(sharedDelta.absolute.sizeBytes, sharedDelta.percentage)
              .displaySize,
            percentage: sharedDelta.percentage,
            status: sharedDelta.status,
          },
        },

        budgetValidation,

        analysis: {
          summary,
          recommendations,
          riskLevel,
        },
      };

      // Store in comparison cache
      comparisonCache.set(cacheKey, comparison);

      await server.server.sendLoggingMessage({
        level: "info",
        data: JSON.stringify({
          event: "compare_builds_success",
          baselineId,
          candidateId,
          project,
          deltaBytes: totalDelta.absolute.sizeBytes,
          deltaPercent: totalDelta.percentage,
        }),
      });

      return {
        content: [{ type: "text", text: JSON.stringify(comparison, null, 2) }],
      };
    } catch (error: any) {
      await server.server.sendLoggingMessage({
        level: "error",
        data: JSON.stringify({
          event: "compare_builds_error",
          error: error.message,
          baselineId,
          candidateId,
          project,
        }),
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error.message,
              baselineId,
              candidateId,
              project,
            }),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Helper: Calculate total size from route array
 */
function calculateTotalRouteSize(routes: any[]): number {
  if (!routes || routes.length === 0) return 0;

  return routes.reduce((total, route) => {
    const sizeBytes = parseSizeToBytes(route.firstLoadJS);
    return total + sizeBytes;
  }, 0);
}

/**
 * Helper: Format bytes to string
 */
function formatSizeFromBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "kB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const rounded = Math.round(size * 10) / 10;
  const formatted =
    rounded === Math.round(rounded) ? Math.round(rounded).toString() : rounded.toFixed(1);

  return `${formatted} ${units[unitIndex]}`;
}
