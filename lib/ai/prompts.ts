import type { ReasoningEffort } from "./client";
import {
  loadScoredObjects,
  loadCatalogSummary,
  runScenario,
  serializeScored,
  applyScenario,
  type Scenario,
} from "./data";
import { methodologyIndex, sectionsText } from "./methodology";
import { scoreObject } from "@/lib/scoring";
import { getSalvageBreakpoints } from "@/lib/db/salvage-breakpoints";
import { db } from "@/lib/db/client";
import { debrisObjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type Persona = "operator" | "insurer" | "agency" | "removal_provider";

export type AnalyzeRequest =
  | { mode: "explain"; objectId: string }
  | { mode: "persona-brief"; objectId: string; persona: Persona }
  | {
      mode: "comparison";
      objectIds: string[];
      criteria?: "composite" | "collision" | "compliance" | "salvage" | "nsv";
      persona?: Persona;
    }
  | { mode: "scenario"; scenario: Scenario }
  | { mode: "what-if"; objectId: string; overrides: Record<string, unknown> }
  | { mode: "pitch"; objectId: string; audience?: "investor" | "customer" }
  | { mode: "catalog-analysis"; question: string };

const PERSONA_LABEL: Record<Persona, string> = {
  operator: "satellite operator protecting an active constellation",
  insurer: "space-insurance underwriter assessing risk exposure",
  agency: "space agency overseeing regulatory compliance",
  removal_provider: "debris-removal provider selecting mission targets",
};

const ROLE =
  "You are an analyst at Orbit Reclaim, a decision-support service for the space debris ecosystem.";

const GROUNDING = `Grounding rules:
- Every number you cite MUST appear in the data provided. Never invent figures.
- Salvage's 0–100 score is a catalog percentile of Net Salvage Value (NSV); quote the USD (today and 2035), not just the percentile.
- Quote physical units where given (probability of collision per year, kinetic energy, penalty exposure in USD).
- When you reference the methodology, cite the section as "(per §X.Y.Z)" — these render as links for the reader.
- If a lens confidence is "low" or "medium", flag the uncertainty rather than overstating.`;

function withMethodology(body: string, injectIds?: string[]): string {
  const index = `All scores follow the Orbit Reclaim methodology (v2.1). Available sections:\n${methodologyIndex()}`;
  const inject = injectIds?.length
    ? `\n\nRelevant methodology excerpts:\n${sectionsText(injectIds)}`
    : "";
  return `${ROLE}\n\n${index}${inject}\n\n${body}\n\n${GROUNDING}`;
}

export type BuiltPrompt = { system: string; user: string; effort: ReasoningEffort };

export async function buildPrompts(req: AnalyzeRequest): Promise<BuiltPrompt> {
  switch (req.mode) {
    case "explain": {
      const [item] = await loadScoredObjects([req.objectId]);
      if (!item) throw new Error("Object not found");
      const system = withMethodology(
        `Write a plain-language explanation of this object's three scores in 120–200 words. Lead with the headline finding (1 sentence). Then 1–2 sentences per lens (collision risk, compliance urgency, salvage value) citing specific sub-score values, physical units, and the USD economics. End with one concrete recommended action.`,
      );
      return { system, user: JSON.stringify(serializeScored(item), null, 2), effort: "off" };
    }

    case "persona-brief": {
      const [item] = await loadScoredObjects([req.objectId]);
      if (!item) throw new Error("Object not found");
      const system = withMethodology(
        `Write a one-page brief (120–200 words) tailored to a ${PERSONA_LABEL[req.persona]}. Lead with what matters most to this audience, cite the sub-scores/USD figures that drive that, and end with one recommended action for them.`,
      );
      return { system, user: JSON.stringify(serializeScored(item), null, 2), effort: "off" };
    }

    case "comparison": {
      const items = await loadScoredObjects(req.objectIds);
      if (items.length < 2) throw new Error("Need at least 2 objects to compare");
      const criteria = req.criteria ?? "composite";
      const audience = req.persona ? PERSONA_LABEL[req.persona] : "decision-maker";
      const system = withMethodology(
        `Compare these ${items.length} objects for a ${audience}, optimizing for ${criteria}. Lead with which object to prioritize and why, citing specific differing sub-scores and USD figures. If it's close, explain the trade-off. End with one clear recommendation. 120–200 words.`,
        ["6"],
      );
      return {
        system,
        user: JSON.stringify(items.map(serializeScored), null, 2),
        effort: "high",
      };
    }

    case "scenario": {
      const result = await runScenario(req.scenario);
      const system = withMethodology(
        `Narrate the impact of this counterfactual scenario on the analysed objects in 140–200 words. Lead with the aggregate shift (quantify it, e.g. "average compliance urgency rises N points"). Call out the most-affected objects by name with before→after values. Explain WHY using the methodology. End with one strategic implication.`,
        ["4", "5"],
      );
      return { system, user: JSON.stringify(result, null, 2), effort: "high" };
    }

    case "what-if": {
      const [base] = await loadScoredObjects([req.objectId]);
      if (!base) throw new Error("Object not found");
      const breakpoints = await getSalvageBreakpoints();
      const modifiedObj = { ...base.object, ...req.overrides } as typeof base.object;
      const modified = {
        object: modifiedObj,
        scores: scoreObject(modifiedObj, undefined, breakpoints),
      };
      const system = withMethodology(
        `The user changed one or more inputs on this object. Narrate the effect on its scores in 80–140 words. Lead with the most-changed lens, quoting both before and after values. Explain WHY the change happened, citing the methodology section(s) that drove it. End with one insight about the model's behaviour.`,
      );
      const user = JSON.stringify(
        {
          overrides: req.overrides,
          baseline: serializeScored(base),
          modified: serializeScored(modified),
        },
        null,
        2,
      );
      return { system, user, effort: "high" };
    }

    case "pitch": {
      const [item] = await loadScoredObjects([req.objectId]);
      if (!item) throw new Error("Object not found");
      const audience = req.audience ?? "investor";
      const angle =
        audience === "investor"
          ? "Frame the market opportunity and why Orbit Reclaim's decision-support matters; use this object as a vivid case study."
          : "Frame the operational value to a prospective customer; use this object to show what the product surfaces.";
      const system = withMethodology(
        `Write a punchy ~250-word ${audience} pitch paragraph. ${angle} Ground every claim in this object's real scores and USD economics. Confident but not hyperbolic.`,
      );
      return { system, user: JSON.stringify(serializeScored(item), null, 2), effort: "high" };
    }

    case "catalog-analysis": {
      const summary = await loadCatalogSummary();
      const system = withMethodology(
        `Answer the user's question using ONLY the catalog summary data. Always quantify your answer with specific numbers from the data. If the data doesn't support a clear answer, say so. 100–180 words.`,
      );
      const user = JSON.stringify({ question: req.question, summary }, null, 2);
      return { system, user, effort: "max" };
    }
  }
}

// Re-export so callers don't reach into data.ts for the override helper.
export { applyScenario };
export async function objectExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: debrisObjects.id })
    .from(debrisObjects)
    .where(eq(debrisObjects.id, id))
    .limit(1);
  return Boolean(row);
}
