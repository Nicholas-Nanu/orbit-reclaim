import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiCache } from "@/lib/db/schema";
import { getClient, AI_MODEL, effortParams } from "@/lib/ai/client";
import { getHomeAggregate } from "./aggregate";

export type DailyBriefItem = {
  headline: string;
  body: string;
  citationIds?: string[];
};
export type DailyBrief = { items: DailyBriefItem[]; generatedAt: string };

const CACHE_KEY = "daily-brief";
const TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

function extractJson(text: string): { items?: DailyBriefItem[] } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const json = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
  return JSON.parse(json);
}

/** Calls DeepSeek to produce a fresh 3-item brief from the catalog aggregate. */
export async function generateDailyBrief(): Promise<DailyBrief> {
  const agg = await getHomeAggregate();
  const briefInput = {
    totalObjects: agg.totalObjects,
    totalMassTonnes: agg.totalMassTonnes,
    overdueCount: agg.overdueCount,
    totalPenaltyExposureUsd: agg.totalPenaltyExposureUsd,
    economicallyRemovableTodayCount: agg.economicallyRemovableTodayCount,
    totalNsvTodayUsd: agg.totalNsvTodayUsd,
    topByLens: agg.topByLens,
    featured: agg.featured
      ? {
          id: agg.featured.object.id,
          name: agg.featured.object.name,
          composite: agg.featured.scores.composite,
          nsvTodayUsd: agg.featured.scores.salvage.meta?.nsvTodayUsd,
          penaltyExposureUsd: agg.featured.scores.compliance.meta?.penaltyExposureUsd,
        }
      : null,
  };

  const system = `You are an analyst at Orbit Reclaim, a decision-support service for the space debris ecosystem. Produce a daily intelligence brief of exactly 3 items, ordered by importance. Each item has a punchy headline (≤8 words) and a 1–2 sentence body. Cite specific numbers from the data; never invent figures. Reference METHODOLOGY sections like "(per §3.2.1)" where relevant. Output STRICT JSON only — no prose, no code fences — matching: {"items":[{"headline":"...","body":"...","citationIds":["3.2.1"]}]}`;
  const user = JSON.stringify({ aggregate: briefInput }, null, 2);

  const client = getClient();
  const msg = await client.messages.create({
    model: AI_MODEL,
    ...effortParams("high"),
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = extractJson(text);
  const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 3) : [];
  if (items.length === 0) throw new Error("Empty brief");
  return { items, generatedAt: new Date().toISOString() };
}

async function readCache(): Promise<DailyBrief | null> {
  const [row] = await db
    .select()
    .from(aiCache)
    .where(eq(aiCache.cacheKey, CACHE_KEY))
    .limit(1);
  if (!row) return null;
  try {
    return JSON.parse(row.content) as DailyBrief;
  } catch {
    return null;
  }
}

async function writeCache(brief: DailyBrief): Promise<void> {
  const content = JSON.stringify(brief);
  await db
    .insert(aiCache)
    .values({ cacheKey: CACHE_KEY, content, modelVersion: AI_MODEL })
    .onConflictDoUpdate({
      target: aiCache.cacheKey,
      set: { content, modelVersion: AI_MODEL, cachedAt: new Date() },
    });
}

function isFresh(brief: DailyBrief): boolean {
  return Date.now() - new Date(brief.generatedAt).getTime() < TTL_MS;
}

/** Force a regeneration and persist it (used by the cron). */
export async function refreshDailyBrief(): Promise<DailyBrief> {
  const brief = await generateDailyBrief();
  await writeCache(brief);
  return brief;
}

/**
 * Vercel-safe read path (CLAUDE.md §2 caching): return the cached brief if
 * fresh; otherwise recompute, write back, and return it. On generation failure,
 * fall back to a stale cached brief if one exists, else null (panel shows a
 * graceful state — never crashes the home).
 */
export async function getDailyBrief(): Promise<DailyBrief | null> {
  let cached: DailyBrief | null = null;
  try {
    cached = await readCache();
  } catch {
    cached = null; // table may not exist yet (pre-migration); treat as miss
  }
  if (cached && isFresh(cached)) return cached;

  try {
    const fresh = await generateDailyBrief();
    try {
      await writeCache(fresh);
    } catch {
      /* persistence unavailable (e.g. pre-migration) — still return fresh */
    }
    return fresh;
  } catch {
    return cached; // stale-but-believable, or null
  }
}
