/**
 * Risk assessment utilities
 */

/**
 * Determine risk level based on percentage change
 */
export function getRiskLevel(percentage: number | null): "low" | "medium" | "high" {
  if (percentage === null) return "low";

  const absPercentage = Math.abs(percentage);
  if (absPercentage > 20) return "high";
  if (absPercentage > 10) return "medium";
  return "low";
}
