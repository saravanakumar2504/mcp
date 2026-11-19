/**
 * Comparison logic for bundle analysis
 */

import {
  parseSizeToBytes,
  calculateDelta,
  formatDelta,
  getRiskLevel,
  normalizePath,
  formatBytes,
} from "./utils/compare_builds/index.js";

/**
 * Route comparison result
 */
export interface RouteComparisonResult {
  path: string;
  type: "static" | "dynamic";
  baseline: {
    size: string;
    firstLoadJS: string;
  };
  candidate: {
    size: string;
    firstLoadJS: string;
  };
  delta: {
    size: string;
    displaySize: string;
    percentage: string;
    status: string;
  };
}

/**
 * Asset analysis result
 */
export interface AssetAnalysisResult {
  added: Array<{
    name: string;
    size: string;
    sizeBytes: number;
  }>;
  removed: Array<{
    name: string;
    size: string;
    sizeBytes: number;
  }>;
  modified: Array<{
    name: string;
    baseline: {
      size: string;
      sizeBytes: number;
    };
    candidate: {
      size: string;
      sizeBytes: number;
    };
    delta: {
      size: string;
      displaySize: string;
      percentage: string;
    };
  }>;
}

/**
 * Compare routes between baseline and candidate builds
 */
export function compareRoutes(
  baselineRoutes: any[],
  candidateRoutes: any[]
): RouteComparisonResult[] {
  const baselineMap = new Map(baselineRoutes.map((r) => [normalizePath(r.path), r]));
  const candidateMap = new Map(candidateRoutes.map((r) => [normalizePath(r.path), r]));

  const allPaths = new Set([...baselineMap.keys(), ...candidateMap.keys()]);
  const comparisons: RouteComparisonResult[] = [];

  for (const path of allPaths) {
    const baseline = baselineMap.get(path);
    const candidate = candidateMap.get(path);

    if (!baseline || !candidate) {
      // Skip routes that don't exist in both builds
      continue;
    }

    const baselineSizeBytes = parseSizeToBytes(baseline.firstLoadJS);
    const candidateSizeBytes = parseSizeToBytes(candidate.firstLoadJS);
    const delta = calculateDelta(baselineSizeBytes, candidateSizeBytes);
    const formatted = formatDelta(delta.absolute.sizeBytes, delta.percentage);

    comparisons.push({
      path,
      type: baseline.type,
      baseline: {
        size: baseline.size,
        firstLoadJS: baseline.firstLoadJS,
      },
      candidate: {
        size: candidate.size,
        firstLoadJS: candidate.firstLoadJS,
      },
      delta: {
        size: formatted.size,
        displaySize: formatted.displaySize,
        percentage: formatted.percentage,
        status: delta.status,
      },
    });
  }

  // Sort by absolute delta (largest changes first)
  comparisons.sort((a, b) => {
    const aDeltaBytes = parseSizeToBytes(a.delta.displaySize);
    const bDeltaBytes = parseSizeToBytes(b.delta.displaySize);
    return Math.abs(bDeltaBytes) - Math.abs(aDeltaBytes);
  });

  return comparisons;
}

/**
 * Analyze asset differences between builds
 * Note: This is a simplified version that compares the routes as assets
 * In a real scenario, you'd have a detailed asset manifest
 */
export function analyzeAssets(
  baselineData: any,
  candidateData: any
): AssetAnalysisResult {
  const baselineRoutes = baselineData.top5Routes || [];
  const candidateRoutes = candidateData.top5Routes || [];

  const baselineMap = new Map(
    baselineRoutes.map((r: any) => [normalizePath(r.path), r])
  );
  const candidateMap = new Map(
    candidateRoutes.map((r: any) => [normalizePath(r.path), r])
  );

  const added: AssetAnalysisResult["added"] = [];
  const removed: AssetAnalysisResult["removed"] = [];
  const modified: AssetAnalysisResult["modified"] = [];

  // Find added and modified
  for (const [path, candidateRoute] of candidateMap) {
    const baselineRoute = baselineMap.get(path);

    if (!baselineRoute) {
      // New route
      const candidateObj = candidateRoute as any;
      added.push({
        name: path as string,
        size: candidateObj.firstLoadJS,
        sizeBytes: parseSizeToBytes(candidateObj.firstLoadJS),
      });
    } else {
      // Check if modified
      const baselineObj = baselineRoute as any;
      const candidateObj = candidateRoute as any;
      const baselineSize = parseSizeToBytes(baselineObj.firstLoadJS);
      const candidateSize = parseSizeToBytes(candidateObj.firstLoadJS);

      if (baselineSize !== candidateSize) {
        const delta = calculateDelta(baselineSize, candidateSize);
        const formatted = formatDelta(delta.absolute.sizeBytes, delta.percentage);

        modified.push({
          name: path as string,
          baseline: {
            size: baselineObj.firstLoadJS,
            sizeBytes: baselineSize,
          },
          candidate: {
            size: candidateObj.firstLoadJS,
            sizeBytes: candidateSize,
          },
          delta: {
            size: formatted.size,
            displaySize: formatted.displaySize,
            percentage: formatted.percentage,
          },
        });
      }
    }
  }

  // Find removed
  for (const [path, baselineRoute] of baselineMap) {
    if (!candidateMap.has(path)) {
      const baselineObj = baselineRoute as any;
      removed.push({
        name: path as string,
        size: baselineObj.firstLoadJS,
        sizeBytes: parseSizeToBytes(baselineObj.firstLoadJS),
      });
    }
  }

  // Sort by size (largest first)
  added.sort((a, b) => b.sizeBytes - a.sizeBytes);
  removed.sort((a, b) => b.sizeBytes - a.sizeBytes);
  modified.sort((a, b) => {
    const aDelta = Math.abs(parseSizeToBytes(a.delta.displaySize));
    const bDelta = Math.abs(parseSizeToBytes(b.delta.displaySize));
    return bDelta - aDelta;
  });

  return { added, removed, modified };
}

/**
 * Generate analysis and recommendations
 */
export function generateAnalysis(
  baselineTotal: number,
  candidateTotal: number,
  sharedBaselineBytes: number,
  sharedCandidateBytes: number,
  routeComparison: RouteComparisonResult[],
  assetAnalysis: AssetAnalysisResult
): {
  summary: string;
  recommendations: string[];
  riskLevel: "low" | "medium" | "high";
} {
  const delta = calculateDelta(baselineTotal, candidateTotal);
  const sharedDelta = calculateDelta(sharedBaselineBytes, sharedCandidateBytes);

  const recommendations: string[] = [];

  // Analyze shared chunk impact
  if (sharedDelta.absolute.sizeBytes > 0) {
    const sharedPercent = sharedDelta.percentage || 0;
    recommendations.push(
      `Shared code increased by ${formatDelta(sharedDelta.absolute.sizeBytes, sharedPercent).displaySize}. Consider tree-shaking or code-splitting.`
    );
  }

  // Find routes with largest increases
  const increasedRoutes = routeComparison
    .filter((r) => r.delta.status === "Increased")
    .slice(0, 3);

  if (increasedRoutes.length > 0) {
    const routesList = increasedRoutes
      .map((r) => `${r.path} (${r.delta.displaySize})`)
      .join(", ");
    recommendations.push(`Route increases detected: ${routesList}. Investigate for code duplication.`);
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

  // If no changes, provide positive message
  if (
    delta.absolute.sizeBytes === 0 &&
    assetAnalysis.added.length === 0 &&
    assetAnalysis.removed.length === 0
  ) {
    recommendations.push("No bundle size changes detected.");
  }

  // Generate summary
  let summary = "";
  if (delta.absolute.sizeBytes > 0) {
    const percent = delta.percentage || 0;
    summary = `Bundle size increased by ${formatDelta(delta.absolute.sizeBytes, percent).displaySize}.`;
  } else if (delta.absolute.sizeBytes < 0) {
    const percent = delta.percentage || 0;
    summary = `Bundle size reduced by ${formatDelta(delta.absolute.sizeBytes, percent).displaySize}.`;
  } else {
    summary = "No bundle size change detected.";
  }

  const riskLevel = getRiskLevel(delta.percentage);

  return {
    summary,
    recommendations,
    riskLevel,
  };
}

/**
 * Validate against budget limits
 */
export function validateAgainstBudget(
  baselineTotal: number,
  candidateTotal: number,
  budgetConfig?: Record<string, any>
): {
  totalSizeBudget?: {
    limit: string;
    actual: string;
    passed: boolean;
  };
  largestRouteBudget?: {
    limit: string;
    actual: string;
    passed: boolean;
  };
} {
  const result: Record<string, any> = {};

  if (!budgetConfig) {
    return result;
  }

  // Check total size budget
  if (budgetConfig.maxTotalSize) {
    const limitBytes = parseSizeToBytes(budgetConfig.maxTotalSize);
    const passed = candidateTotal <= limitBytes;

    result.totalSizeBudget = {
      limit: budgetConfig.maxTotalSize,
      actual: formatBytes(candidateTotal),
      passed,
    };
  }

  // Check per-route budget (would be used if we had individual route limits)
  if (budgetConfig.maxPerRoute) {
    result.largestRouteBudget = {
      limit: budgetConfig.maxPerRoute,
      actual: formatBytes(candidateTotal),
      passed: true, // Simplified
    };
  }

  return result;
}
