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
