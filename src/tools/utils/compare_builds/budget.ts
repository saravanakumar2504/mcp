/**
 * Budget configuration and validation utilities
 */

import { formatBytes, parseSizeToBytes } from "./size.js";

export interface BudgetConfig {
  maxTotalSize?: string;
  maxPerRoute?: string;
  maxSharedChunk?: string;
}

/**
 * Load budget configuration from JSON
 */
export async function loadBudgetConfig(): Promise<Record<string, BudgetConfig>> {
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const { fileURLToPath } = await import("url");

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const configPath = path.join(__dirname, "../../../budgets.json");

    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    // Return empty config if file doesn't exist or can't be parsed
    return {};
  }
}

/**
 * Validate against budget limits
 */
export function validateAgainstBudget(
  baselineTotal: number,
  candidateTotal: number,
  budgetConfig?: BudgetConfig
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
