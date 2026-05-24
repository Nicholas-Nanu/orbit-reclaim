type Tier = {
  text: string;
  bg: string;
  border: string;
};

/** Text-color class for a 0-100 score, matching the badge tier. */
export function scoreTextClass(score: number): string {
  return tier(score).text;
}

/** Maps a 0-100 score to brand color tiers (CLAUDE.md §6 score gradient). */
function tier(score: number): Tier {
  if (score >= 75)
    return {
      text: "text-scoreHigh",
      bg: "bg-scoreHigh/10",
      border: "border-scoreHigh/40",
    };
  if (score >= 50)
    return { text: "text-gold", bg: "bg-gold/10", border: "border-gold/40" };
  if (score >= 25)
    return {
      text: "text-goldDim",
      bg: "bg-goldDim/10",
      border: "border-goldDim/30",
    };
  return { text: "text-muted", bg: "bg-white/5", border: "border-border" };
}

export function ScoreBadge({
  score,
  emphasis = false,
}: {
  score: number;
  emphasis?: boolean;
}) {
  const t = tier(score);
  return (
    <span
      className={`inline-flex min-w-[3rem] items-center justify-center rounded-sm border px-2 py-0.5 font-mono text-xs tabular-nums ${t.text} ${t.bg} ${t.border} ${emphasis ? "font-semibold" : ""}`}
    >
      {score.toFixed(1)}
    </span>
  );
}

export type Confidence = "high" | "medium" | "low";

/**
 * Confidence flag (METHODOLOGY §7). High confidence renders nothing (the
 * default, uncluttered state); medium/low get an explicit badge so a high
 * score on partial/estimated data is never mistaken for authoritative.
 */
export function ConfidenceBadge({
  confidence,
  className = "",
}: {
  confidence: Confidence;
  className?: string;
}) {
  if (confidence === "high") return null;
  const low = confidence === "low";
  return (
    <span
      title={
        low
          ? "Low confidence — a critical input is missing or simulated"
          : "Medium confidence — some inputs are estimated or stale"
      }
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
        low
          ? "border-scoreHigh/40 bg-scoreHigh/10 text-scoreHigh"
          : "border-border bg-white/5 text-muted"
      } ${className}`}
    >
      {low ? "⚠ low confidence" : "~ est. data"}
    </span>
  );
}
