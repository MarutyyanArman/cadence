/**
 * Shared recharts styling, in its own module on purpose.
 *
 * These constants are imported by client chart components, while ChartCard is
 * a server component that reads the chosen dictionary — and so reaches
 * `next/headers`. Keeping them together would pull a server-only module into
 * the client bundle and fail the build.
 */
export const tooltipStyle = {
  backgroundColor: "var(--color-bg-elevated)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: "var(--radius-sm)",
  fontSize: 12,
  color: "var(--color-text-primary)",
} as const;

export const axisProps = {
  stroke: "var(--color-text-muted)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;
