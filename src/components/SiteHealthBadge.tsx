import { getHealthBand } from "@/lib/siteHealth";
import type { SiteScore } from "@/lib/siteScores";
import { cn } from "@/lib/utils";

// Band colors match the report palette (siteSummaryRenderSpec STATUS_COLORS):
// green-600 / amber-600 / red-600.
const BAND_CLASSES: Record<ReturnType<typeof getHealthBand>, string> = {
  success: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-900",
  warning: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900",
  danger: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-900",
};

interface SiteHealthBadgeProps {
  score: SiteScore | undefined;
  /** Still resolving scores — renders a subtle placeholder instead of "pending". */
  isLoading?: boolean;
  size?: "sm" | "lg";
  className?: string;
}

/**
 * Site health score pill — the one way a site score is rendered in the portal, so every
 * page shows the same number with the same banding. The score itself always comes from
 * useSiteScores (canonical siteHealth.ts formula).
 */
export function SiteHealthBadge({ score, isLoading, size = "sm", className }: SiteHealthBadgeProps) {
  const sizeClasses = size === "lg" ? "px-3 py-1.5 text-base" : "px-2.5 py-1 text-sm";

  if (!score) {
    const reason = isLoading ? "Loading site score…" : "Site score not captured yet";
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap",
          "bg-muted text-muted-foreground border-transparent",
          sizeClasses,
          className,
        )}
        title={reason}
        aria-label={reason}
      >
        {isLoading ? "…" : "—"}
        <span className={size === "lg" ? "text-sm font-normal" : "text-xs font-normal"}>Score</span>
      </span>
    );
  }

  const asOf = score.source === "snapshot" && score.capturedAt
    ? `Site health score as of ${score.capturedAt}`
    : "Site health score (computed just now)";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap",
        BAND_CLASSES[getHealthBand(score.healthScore)],
        sizeClasses,
        className,
      )}
      title={asOf}
      aria-label={`${asOf}: ${score.healthScore}%`}
    >
      {score.healthScore}%
      <span className={size === "lg" ? "text-sm font-normal" : "text-xs font-normal"}>Score</span>
    </span>
  );
}

export default SiteHealthBadge;
