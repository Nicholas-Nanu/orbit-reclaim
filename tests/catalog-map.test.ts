import { describe, it, expect } from "vitest";
import { mapToDebris } from "@/lib/data/catalog-map";
import type { GpRecord } from "@/lib/data/spacetrack";

const base: GpRecord = {
  NORAD_CAT_ID: "99999",
  OBJECT_NAME: "TEST DEB",
  OBJECT_TYPE: "DEBRIS",
  COUNTRY_CODE: "PRC",
  LAUNCH_DATE: "2007-01-11",
  APOAPSIS: "860",
  PERIAPSIS: "840",
  INCLINATION: "98.7",
  ECCENTRICITY: "0.012",
};

describe("mapToDebris", () => {
  it("maps a debris record with heuristics + computed scores", () => {
    const row = mapToDebris(base)!;
    expect(row).not.toBeNull();
    expect(row.type).toBe("fragment");
    expect(row.jurisdiction).toBe("CN");
    expect(row.intact).toBe(false);
    expect(row.altitudeKm).toBeCloseTo(850, 0);
    expect(row.catalogSource).toBe("spacetrack");
    // scores are cached on the row
    expect(typeof row.composite).toBe("number");
    expect(row.composite!).toBeGreaterThanOrEqual(0);
    expect(row.composite!).toBeLessThanOrEqual(100);
  });

  it("applies curated overrides for known objects (Envisat 27386)", () => {
    const row = mapToDebris({
      ...base,
      NORAD_CAT_ID: "27386",
      OBJECT_NAME: "ENVISAT",
      OBJECT_TYPE: "PAYLOAD",
      COUNTRY_CODE: "ESA",
      APOAPSIS: "773",
      PERIAPSIS: "767",
    })!;
    expect(row.type).toBe("defunct_satellite");
    expect(row.jurisdiction).toBe("ESA");
    expect(row.massKg).toBe(8211);
    expect(row.materialClass).toBe("eo_satellite");
    expect(row.name).toBe("ENVISAT");
  });

  it("returns null when orbital fields are missing", () => {
    expect(mapToDebris({ ...base, APOAPSIS: null })).toBeNull();
  });
});
