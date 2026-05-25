import Link from "next/link";
import type { DailyBrief } from "@/lib/home/brief";

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export default function DailyBriefPanel({ brief }: { brief: DailyBrief | null }) {
  return (
    <section className="border-b border-border bg-surface/30">
      <div className="mx-auto max-w-[1200px] px-10 py-20">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-gold">
            Today&apos;s intelligence brief
          </span>
          {brief && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
              Updated{" "}
              {new Date(brief.generatedAt).toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "UTC",
              })}{" "}
              UTC · {timeAgo(brief.generatedAt)}
            </span>
          )}
        </div>

        {!brief ? (
          <p className="text-sm text-muted">
            Today&apos;s brief is being generated — check back shortly.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-3">
            {brief.items.map((item, i) => (
              <div key={i} className="bg-surface p-6">
                <div className="mb-3 font-mono text-2xl text-gold/60">
                  0{i + 1}
                </div>
                <h3 className="mb-2 text-base font-semibold leading-snug">
                  {item.headline}
                </h3>
                <p className="text-sm leading-relaxed text-muted">{item.body}</p>
                {item.citationIds && item.citationIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {item.citationIds.map((id) => (
                      <Link
                        key={id}
                        href={`/methodology#${id.replace(/[§.]/g, "")}`}
                        className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-goldDim hover:border-gold hover:text-gold"
                      >
                        §{id.replace(/^§/, "")}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
