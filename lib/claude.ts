import Anthropic from "@anthropic-ai/sdk";
import type { DebrisObject } from "@/lib/db/schema";
import type { ObjectScores, ScoreResult } from "@/lib/scoring";

// Uses the Anthropic SDK pointed at DeepSeek's Anthropic-compatible endpoint
// (https://api.deepseek.com/anthropic). See CLAUDE.md §2/§7.
export const AI_MODEL = process.env.AI_MODEL ?? "deepseek-v4-pro";

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

function formatLens(name: string, result: ScoreResult): string {
  const factors = result.factors
    .map(
      (f) =>
        `    - ${f.label}: weight ${Math.round(f.weight * 100)}%, raw ${f.rawValue.toFixed(2)}, contributes ${f.contribution.toFixed(1)}`,
    )
    .join("\n");
  return `  ${name}: ${result.score.toFixed(1)}/100\n${factors}`;
}

function formatObject({ object, scores }: ScoredObject): string {
  return [
    `Object: ${object.name} (NORAD ${object.id})`,
    `Type: ${object.type.replace(/_/g, " ")}; Jurisdiction: ${object.jurisdiction ?? "unknown"}; Status: ${object.missionStatus ?? "unknown"}`,
    `Orbit: ${object.altitudeKm} km altitude, ${object.inclinationDeg}° inclination, eccentricity ${object.eccentricity}`,
    `Physical: ${object.massKg} kg, ${object.crossSectionM2} m² cross-section, intact=${object.intact}`,
    `Composite: ${scores.composite.toFixed(1)}/100`,
    formatLens("Collision Risk", scores.collisionRisk),
    formatLens("Compliance Urgency", scores.compliance),
    formatLens("Salvage Value", scores.salvage),
  ].join("\n");
}

export function buildPrompt(
  items: ScoredObject[],
  mode: ExplainMode,
  persona: Persona,
): { system: string; user: string } {
  const audience = PERSONA_LABEL[persona];

  if (mode === "comparison") {
    const system = `You are an analyst at Orbit Reclaim, a decision-support service for the space debris ecosystem. You are given several objects, each with orbital parameters and three scores (collision risk, compliance urgency, salvage value) with factor breakdowns. Write a comparative analysis in 120–180 words. Lead with which object the ${audience} should prioritize and why. Cite specific factors and numbers from the breakdowns — never invent values. End with one clear recommendation.`;
    const user = `Compare the following objects:\n\n${items.map(formatObject).join("\n\n")}`;
    return { system, user };
  }

  const system = `You are an analyst at Orbit Reclaim, a decision-support service for the space debris ecosystem. Given an object's orbital parameters and its three scores with factor breakdowns, write a plain-language explanation in 120–180 words. Lead with the headline finding. Cite specific factors and numbers from the breakdown — never invent values. End with one recommended action for the ${audience}.`;
  const user = formatObject(items[0]);
  return { system, user };
}
