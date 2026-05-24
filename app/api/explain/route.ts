import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { debrisObjects } from "@/lib/db/schema";
import { scoreObject } from "@/lib/scoring";
import {
  AI_MODEL,
  buildPrompt,
  getClient,
  type ScoredObject,
} from "@/lib/claude";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  objectId: z.string().optional(),
  mode: z.enum(["score_explanation", "persona_brief", "comparison"]),
  persona: z
    .enum(["operator", "insurer", "agency", "removal_provider"])
    .optional(),
  comparisonIds: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { mode, objectId, comparisonIds } = parsed;
  const persona = parsed.persona ?? "operator";

  const ids =
    mode === "comparison"
      ? (comparisonIds ?? [])
      : objectId
        ? [objectId]
        : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No object id(s) provided" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(debrisObjects)
    .where(inArray(debrisObjects.id, ids));
  if (rows.length === 0) {
    return NextResponse.json({ error: "Object(s) not found" }, { status: 404 });
  }

  // Preserve requested order (matters for comparison narratives).
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items: ScoredObject[] = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((object) => ({ object, scores: scoreObject(object) }));

  const { system, user } = buildPrompt(items, mode, persona);

  let llmStream: AsyncIterable<{
    type: string;
    delta?: { type: string; text?: string };
  }>;
  try {
    const client = getClient();
    llmStream = (await client.messages.create({
      model: AI_MODEL,
      // deepseek-v4-pro is a reasoning model: it spends tokens "thinking"
      // (hidden) before the answer, so the budget must cover both.
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
      stream: true,
    })) as unknown as typeof llmStream;
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let emitted = false;
      try {
        for await (const event of llmStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta?.type === "text_delta" &&
            event.delta.text
          ) {
            emitted = true;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        if (!emitted) {
          controller.enqueue(
            encoder.encode("No explanation was generated. Please retry."),
          );
        }
      } catch {
        if (!emitted) {
          controller.enqueue(encoder.encode("[stream interrupted] Please retry."));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
