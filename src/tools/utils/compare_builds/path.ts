/**
 * Path normalization utilities
 */

/**
 * Normalize path for comparison (remove trailing slashes, etc.)
 */
export function normalizePath(path: string): string {
  return path.replace(/\/$/, "") || "/";
}
