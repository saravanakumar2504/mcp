/**
 * Analysis and risk assessment utilities
 */

import { getRiskLevel } from "./risk.js";
import { formatDelta } from "./size.js";

/**
 * Get delta status emoji for display
 */
export function getStatusEmoji(delta: number): string {
  if (delta > 0) return "🔴";
  if (delta < 0) return "🟢";
  return "⚪";
}

/**
 * Generate analysis summary from metrics
 */
export function generateAnalysisSummary(
  baselineBytes: number,
  candidateBytes: number,
  deltaPercent: number | null
): string {
  const diff = candidateBytes - baselineBytes;

  if (diff > 0) {
    const percent = deltaPercent || 0;
    return `Bundle size increased by ${formatDelta(diff, percent).displaySize}.`;
  } else if (diff < 0) {
    const percent = deltaPercent || 0;
    return `Bundle size reduced by ${formatDelta(diff, percent).displaySize}.`;
  } else {
    return "No bundle size change detected.";
  }
}

/**
 * Generate recommendations based on changes
 */
export function generateRecommendations(
  options: {
    sharedDeltaBytes?: number;
    sharedDeltaPercent?: number | null;
    increasedRoutes?: Array<{ path: string; displaySize: string }>;
    addedAssets?: Array<{ name: string; size: string }>;
    removedAssets?: Array<{ name: string; size: string }>;
  } = {}
): string[] {
  const recommendations: string[] = [];

  // Analyze shared chunk impact
  if (options.sharedDeltaBytes && options.sharedDeltaBytes > 0) {
    const sharedPercent = options.sharedDeltaPercent || 0;
    recommendations.push(
      `Shared code increased by ${formatDelta(options.sharedDeltaBytes, sharedPercent).displaySize}. Consider tree-shaking or code-splitting.`
    );
  }

  // Find routes with largest increases
  if (options.increasedRoutes && options.increasedRoutes.length > 0) {
    const routesList = options.increasedRoutes
      .slice(0, 3)
      .map((r) => `${r.path} (${r.displaySize})`)
      .join(", ");
    recommendations.push(`Route increases detected: ${routesList}. Investigate for code duplication.`);
  }

  // Analyze added assets
  if (options.addedAssets && options.addedAssets.length > 0) {
    const addedNames = options.addedAssets
      .slice(0, 3)
      .map((a) => `${a.name} (${a.size})`)
      .join(", ");
    recommendations.push(`New routes/assets added: ${addedNames}.`);
  }

  // Analyze removed assets
  if (options.removedAssets && options.removedAssets.length > 0) {
    const removedNames = options.removedAssets
      .slice(0, 2)
      .map((r) => `${r.name} (${r.size})`)
      .join(", ");
    recommendations.push(`Removed routes/assets: ${removedNames}. Good optimization.`);
  }

  // If no changes, provide positive message
  if (
    (!options.sharedDeltaBytes || options.sharedDeltaBytes === 0) &&
    (!options.addedAssets || options.addedAssets.length === 0) &&
    (!options.removedAssets || options.removedAssets.length === 0)
  ) {
    recommendations.push("No bundle size changes detected.");
  }

  return recommendations;
}
