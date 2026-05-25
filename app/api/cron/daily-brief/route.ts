import { NextRequest, NextResponse } from "next/server";
import { refreshDailyBrief } from "@/lib/home/brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel cron sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const brief = await refreshDailyBrief();
    return NextResponse.json(brief);
  } catch (err) {
    const message = err instanceof Error ? err.message : "brief generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
