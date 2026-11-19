/**
 * Size parsing and formatting utilities
 */

/**
 * Parse size string to bytes
 * Supports formats: "109 kB", "1.5 MB", "0 B", "512 B", "+1.3 kB", "-5 MB"
 */
export function parseSizeToBytes(sizeString: string): number {
  if (!sizeString || sizeString === "0 B") {
    return 0;
  }

  const trimmed = sizeString.trim();
  // Handle optional +/- sign at the beginning
  const match = trimmed.match(/^([+-]?)[\s]*([\d.]+)\s*([KMGT]?B)$/i);

  if (!match) {
    throw new Error(`Invalid size format: "${sizeString}"`);
  }

  const [, sign, value, unit] = match;
  const numValue = parseFloat(value);

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  const normalizedUnit = unit.toUpperCase();
  const multiplier = multipliers[normalizedUnit] || 1;
  const baseValue = Math.round(numValue * multiplier);

  // Apply sign if present
  return sign === "-" ? -baseValue : baseValue;
}

/**
 * Format bytes to human-readable size string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "kB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  // Round to 1 decimal place, remove trailing zeros
  const rounded = Math.round(size * 10) / 10;
  const formatted = rounded === Math.round(rounded)
    ? Math.round(rounded).toString()
    : rounded.toFixed(1);

  return `${formatted} ${units[unitIndex]}`;
}

/**
 * Calculate percentage change
 * Returns null if baseline is 0 (avoid division by zero)
 */
export function calculatePercentage(baseline: number, candidate: number): number | null {
  if (baseline === 0) {
    return null;
  }

  return ((candidate - baseline) / baseline) * 100;
}

/**
 * Calculate delta with both absolute and percentage change
 */
export function calculateDelta(baseline: number, candidate: number): {
  absolute: {
    size: string;
    sizeBytes: number;
  };
  percentage: number | null;
  status: "Reduced" | "Increased" | "No change";
} {
  const diff = candidate - baseline;
  const percentage = calculatePercentage(baseline, candidate);

  let status: "Reduced" | "Increased" | "No change";
  if (diff > 0) {
    status = "Increased";
  } else if (diff < 0) {
    status = "Reduced";
  } else {
    status = "No change";
  }

  return {
    absolute: {
      size: formatBytes(Math.abs(diff)),
      sizeBytes: diff,
    },
    percentage: percentage ? Math.round(percentage * 100) / 100 : null,
    status,
  };
}

/**
 * Format delta with sign for display
 */
export function formatDelta(bytes: number, percentage: number | null): {
  size: string;
  displaySize: string;
  percentage: string;
} {
  const sign = bytes > 0 ? "+" : "";
  const size = formatBytes(Math.abs(bytes));
  const displaySize = sign + size;
  const displayPercentage = percentage !== null
    ? `${sign}${percentage.toFixed(1)}%`
    : "N/A";

  return {
    size,
    displaySize,
    percentage: displayPercentage,
  };
}
