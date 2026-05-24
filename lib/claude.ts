import Anthropic from "@anthropic-ai/sdk";
import type { DebrisObject } from "@/lib/db/schema";
import type { ObjectScores, ScoreResult } from "@/lib/scoring";

// Uses the Anthropic SDK pointed at DeepSeek's Anthropic-compatible endpoint
// (https://api.deepseek.com/anthropic). See CLAUDE.md §2/§7.
export const AI_MODEL = process.env.AI_MODEL ?? "deepseek-v4-flash";

const BASE_URL =
  process.env.ANTHROPIC_BASE_URL ?? "https://api.deepseek.com/anthropic";

export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local.");
  }
  return new Anthropic({ apiKey, baseURL: BASE_URL });
}

export type Persona = "operator" | "insurer" | "agency" | "removal_provider";
export type ExplainMode = "score_explanation" | "persona_brief" | "comparison";

const PERSONA_LABEL: Record<Persona, string> = {
  operator: "satellite operator protecting an active constellation",
  insurer: "space-insurance underwriter assessing risk exposure",
  agency: "space agency overseeing regulatory compliance",
  removal_provider: "debris-removal provider selecting mission targets",
};

export type ScoredObject = { object: DebrisObject; scores: ObjectScores };

/** Formats a lens with its 0–100 sub-scores and physical/USD detail strings. */
function formatLens(name: string, result: ScoreResult): string {
  const subs = result.subScores
    .map((ss) => {
      const weighted =
        ss.weight > 0 ? ` (weight ${Math.round(ss.weight * 100)}%)` : "";
      const detail = ss.detail ? ` — ${ss.detail}` : "";
      return `    - ${ss.label}: ${ss.score.toFixed(0)}/100${weighted}${detail}`;
    })
    .join("\n");
  return `  ${name}: ${result.score.toFixed(1)}/100 [confidence: ${result.confidence}]\n${subs}`;
}

function formatObject({ object, scores }: ScoredObject): string {
  const cMeta = scores.compliance.meta ?? {};
  const sMeta = scores.salvage.meta ?? {};
  const regimes = cMeta.applicableRegimes ?? "—";
  return [
    `Object: ${object.name} (NORAD ${object.id})`,
    `Type: ${object.type.replace(/_/g, " ")}; Jurisdiction: ${object.jurisdiction ?? "unknown"}; Status: ${object.missionStatus ?? "unknown"}`,
    `Orbit: ${object.altitudeKm} km altitude, ${object.inclinationDeg}° inclination, eccentricity ${object.eccentricity}`,
    `Physical: ${object.massKg} kg, ${object.crossSectionM2} m² cross-section, intact=${object.intact}`,
    `Composite: ${scores.composite.toFixed(1)}/100 (overall confidence: ${scores.confidence})`,
    formatLens("Collision Risk", scores.collisionRisk),
    formatLens("Compliance Urgency", scores.compliance),
    `    Applicable regulatory regimes: ${regimes}`,
    formatLens("Salvage Value (0–100 is the catalog percentile of Net Salvage Value)", scores.salvage),
    `    Net Salvage Value: ${usd(sMeta.nsvTodayUsd)} today, ${usd(sMeta.nsv2035Usd)} projected 2035`,
    `    Penalty exposure: ${usd(cMeta.penaltyExposureUsd)}`,
  ].join("\n");
}

/** Formats a meta USD value (already rounded to whole dollars) compactly. */
function usd(value: number | string | undefined): string {
  if (typeof value !== "number") return "—";
  const sign = value < 0 ? "−" : "";
  const a = Math.abs(value);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}k`;
  return `${sign}$${a.toFixed(0)}`;
}

export function buildPrompt(
  items: ScoredObject[],
  mode: ExplainMode,
  persona: Persona,
): { system: string; user: string } {
  const audience = PERSONA_LABEL[persona];

  const groundingRules = `Cite specific sub-scores and the real USD figures (Net Salvage Value today vs 2035, penalty exposure) and physical units (probability of collision per year, kinetic energy) from the data — never invent values. Salvage's 0–100 is a catalog percentile of Net Salvage Value; quote the USD, not just the percentile. If a lens confidence is "low" or "medium", note the uncertainty rather than overstating the finding.`;

  if (mode === "comparison") {
    const system = `You are an analyst at Orbit Reclaim, a decision-support service for the space debris ecosystem. You are given several objects, each with orbital parameters and three decomposed scores (collision risk, compliance urgency, salvage value) with sub-scores, USD economics, applicable regulatory regimes, and confidence flags. Write a comparative analysis in 120–180 words. Lead with which object the ${audience} should prioritize and why. ${groundingRules} End with one clear recommendation.`;
    const user = `Compare the following objects:\n\n${items.map(formatObject).join("\n\n")}`;
    return { system, user };
  }

  const system = `You are an analyst at Orbit Reclaim, a decision-support service for the space debris ecosystem. Given an object's orbital parameters and its three decomposed scores (with sub-scores, USD economics, applicable regulatory regimes, and confidence flags), write a plain-language explanation in 120–180 words. Lead with the headline finding. ${groundingRules} End with one recommended action for the ${audience}.`;
  const user = formatObject(items[0]);
  return { system, user };
}
