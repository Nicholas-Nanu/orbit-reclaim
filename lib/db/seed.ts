import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { z } from "zod";
import { db } from "./client";
import { debrisObjects } from "./schema";

config({ path: ".env.local" });

const debrisType = z.enum([
  "rocket_body",
  "defunct_satellite",
  "fragment",
  "mission_debris",
]);
const jurisdiction = z.enum(["US", "ESA", "JP", "CN", "RU", "IN", "OTHER"]);
const materialClass = z.enum([
  "al_li_alloy",
  "titanium",
  "comsat_electronics",
  "eo_satellite",
  "mixed",
  "unknown",
]);
const missionStatus = z.enum(["active", "defunct", "unknown"]);

const debrisSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: debrisType,
  launchYear: z.number().int().nullable().optional(),
  launchCountry: z.string().nullable().optional(),
  jurisdiction: jurisdiction.nullable().optional(),
  massKg: z.number(),
  crossSectionM2: z.number(),
  intact: z.boolean(),
  materialClass: materialClass.nullable().optional(),
  altitudeKm: z.number(),
  inclinationDeg: z.number(),
  eccentricity: z.number(),
  estimatedYearsToDecay: z.number().nullable().optional(),
  missionStatus: missionStatus.nullable().optional(),
  endOfLifeYear: z.number().int().nullable().optional(),
  hasPropellant: z.boolean(),
  hasThrusters: z.boolean(),
  conjunctions30d: z.number().int(),
  neighborsWithin50km: z.number().int(),
  deltaVToReachKms: z.number().nullable().optional(),
  catalogSource: z.string(),
});

async function seed() {
  const raw = readFileSync(
    join(process.cwd(), "data", "sample-debris.json"),
    "utf-8",
  );
  const rows = z.array(debrisSchema).parse(JSON.parse(raw));

  console.log(`Validated ${rows.length} objects. Upserting…`);

  for (const row of rows) {
    await db
      .insert(debrisObjects)
      .values(row)
      .onConflictDoUpdate({ target: debrisObjects.id, set: row });
  }

  console.log(`Seeded ${rows.length} debris objects.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
