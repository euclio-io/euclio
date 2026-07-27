/**
 * "5m ago" / "3h ago" / "2d ago" — a duration, not a wall-clock time, so
 * Account.timezone doesn't apply here (that governs absolute-time rendering).
 */
export function formatRelativeTime(date: Date, now = new Date()): string {
  const diffSec = Math.round((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}
