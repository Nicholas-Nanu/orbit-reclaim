import { NextResponse } from "next/server";
import { z } from "zod";
import { streamText } from "@/lib/ai/client";
import { buildPrompts, type AnalyzeRequest } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const persona = z.enum(["operator", "insurer", "agency", "removal_provider"]);
const scenario = z.enum([
  "fcc-all-leo",
  "adr-cost-5x-drop",
  "geo-deorbit-mandate",
  "envisat-removed",
]);

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("explain"), objectId: z.string() }),
  z.object({ mode: z.literal("persona-brief"), objectId: z.string(), persona }),
  z.object({
    mode: z.literal("comparison"),
    objectIds: z.array(z.string()).min(2).max(4),
    criteria: z
      .enum(["composite", "collision", "compliance", "salvage", "nsv"])
      .optional(),
    persona: persona.optional(),
  }),
  z.object({ mode: z.literal("scenario"), scenario }),
  z.object({
    mode: z.literal("what-if"),
    objectId: z.string(),
    overrides: z.record(z.string(), z.unknown()),
  }),
  z.object({
    mode: z.literal("pitch"),
    objectId: z.string(),
    audience: z.enum(["investor", "customer"]).optional(),
  }),
  z.object({ mode: z.literal("catalog-analysis"), question: z.string().max(500) }),
]);

export async function POST(req: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let prompt;
  try {
    prompt = await buildPrompts(body as AnalyzeRequest);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build prompt";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let emitted = false;
      try {
        for await (const token of streamText(prompt)) {
          emitted = true;
          controller.enqueue(encoder.encode(token));
        }
        if (!emitted) {
          controller.enqueue(
            encoder.encode("No response was generated. Please retry."),
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
