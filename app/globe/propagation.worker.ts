/// <reference lib="webworker" />
import {
  twoline2satrec,
  propagate,
  eciToEcf,
  gstime,
  type SatRec,
} from "satellite.js";

type Tle = { id: string; l1: string; l2: string; t: string };
type InitMsg = { type: "init"; tles: Tle[] };
type TickMsg = { type: "tick"; epochMs: number };
type InMsg = InitMsg | TickMsg;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let recs: Array<{ sr: SatRec; ok: boolean }> = [];

ctx.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;

  if (msg.type === "init") {
    recs = msg.tles.map((t) => {
      try {
        const sr = twoline2satrec(t.l1, t.l2);
        return { sr, ok: Number(sr.error) === 0 };
      } catch {
        return { sr: {} as SatRec, ok: false };
      }
    });
    ctx.postMessage({ type: "ready", count: recs.length });
    return;
  }

  if (msg.type === "tick") {
    const date = new Date(msg.epochMs);
    const gmst = gstime(date);
    const out = new Float32Array(recs.length * 3);
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      let placed = false;
      if (rec.ok) {
        const pv = propagate(rec.sr, date);
        const pos = pv?.position;
        if (pos && typeof pos !== "boolean") {
          const ecef = eciToEcf(pos, gmst);
          out[i * 3] = ecef.x * 1000;
          out[i * 3 + 1] = ecef.y * 1000;
          out[i * 3 + 2] = ecef.z * 1000;
          placed = true;
        }
      }
      if (!placed) {
        out[i * 3] = NaN;
        out[i * 3 + 1] = NaN;
        out[i * 3 + 2] = NaN;
      }
    }
    ctx.postMessage({ type: "positions", positions: out }, [out.buffer]);
  }
};
