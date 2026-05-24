import { NextResponse } from "next/server";
import { isNotNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { debrisObjects } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compact TLE feed for the globe's ambient point cloud. Field names are short to
// keep the payload small (~34k objects). Cached for an hour (data refreshes nightly).
export async function GET() {
  const rows = await db
    .select({
      id: debrisObjects.id,
      l1: debrisObjects.line1,
      l2: debrisObjects.line2,
      t: debrisObjects.type,
    })
    .from(debrisObjects)
    .where(isNotNull(debrisObjects.line1));

  const data = rows
    .filter((r) => r.l1 && r.l2)
    .map((r) => ({ id: r.id, l1: r.l1, l2: r.l2, t: r.t }));

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
