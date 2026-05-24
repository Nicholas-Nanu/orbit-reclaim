import { describe, it, expect } from "vitest";
import { canonicalize, hashInputs } from "@/lib/scoring/audit";
import type { ScoringInput } from "@/lib/scoring";

const base: ScoringInput = {
  type: "rocket_body",
  launchYear: 1985,
  massKg: 8900,
  crossSectionM2: 32,
  altitudeKm: 847,
  inclinationDeg: 71,
  eccentricity: 0.001,
  conjunctions30d: 14,
  estimatedYearsToDecay: 180,
  jurisdiction: "RU",
  endOfLifeYear: 1985,
  missionStatus: "defunct",
  hasPropellant: false,
  hasThrusters: false,
  intact: true,
  materialClass: "al_li_alloy",
  deltaVToReachKms: 0.9,
  neighborsWithin50km: 12,
};

describe("audit hash", () => {
  it("same inputs → same hash (deterministic, 16 hex chars)", () => {
    const h1 = hashInputs(base);
    const h2 = hashInputs({ ...base });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("different inputs → different hash", () => {
    expect(hashInputs(base)).not.toBe(hashInputs({ ...base, massKg: 8901 }));
  });

  it("ignores non-input fields (extra DB columns don't change the hash)", () => {
    const withExtras = {
      ...base,
      id: "16111",
      name: "SL-16 R/B",
      collisionRisk: 99.1,
      lastUpdated: new Date().toISOString(),
    } as unknown as ScoringInput;
    expect(hashInputs(withExtras)).toBe(hashInputs(base));
  });

  it("canonical form has sorted keys", () => {
    const keys = Object.keys(JSON.parse(canonicalize(base)));
    expect(keys).toEqual([...keys].sort());
  });
});
