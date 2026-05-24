import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export type DebrisType =
  | "rocket_body"
  | "defunct_satellite"
  | "fragment"
  | "mission_debris";
export type Jurisdiction = "US" | "ESA" | "JP" | "CN" | "RU" | "IN" | "OTHER";
export type MaterialClass =
  | "al_li_alloy"
  | "titanium"
  | "comsat_electronics"
  | "eo_satellite"
  | "mixed"
  | "unknown";
export type MissionStatus = "active" | "defunct" | "unknown";
export type CatalogSource =
  | "simulated"
  | "celestrak"
  | "spacetrack"
  | "esa_discos";

export const debrisObjects = pgTable("debris_objects", {
  // Identity
  id: text("id").primaryKey(), // NORAD ID
  name: text("name").notNull(),
  type: text("type").$type<DebrisType>().notNull(),
  launchYear: integer("launch_year"),
  launchCountry: text("launch_country"),
  jurisdiction: text("jurisdiction").$type<Jurisdiction>(),

  // Physical
  massKg: real("mass_kg").notNull(),
  crossSectionM2: real("cross_section_m2").notNull(),
  intact: boolean("intact").notNull().default(false),
  materialClass: text("material_class").$type<MaterialClass>(),

  // Orbital
  altitudeKm: real("altitude_km").notNull(),
  inclinationDeg: real("inclination_deg").notNull(),
  eccentricity: real("eccentricity").notNull().default(0),
  estimatedYearsToDecay: real("estimated_years_to_decay"),

  // Mission
  missionStatus: text("mission_status").$type<MissionStatus>(),
  endOfLifeYear: integer("end_of_life_year"),
  hasPropellant: boolean("has_propellant").notNull().default(false),
  hasThrusters: boolean("has_thrusters").notNull().default(false),

  // Dynamic risk
  conjunctions30d: integer("conjunctions_30d").notNull().default(0),
  neighborsWithin50km: integer("neighbors_within_50km").notNull().default(0),
  deltaVToReachKms: real("delta_v_to_reach_kms"),

  // Source
  catalogSource: text("catalog_source")
    .$type<CatalogSource>()
    .notNull()
    .default("simulated"),
  lastUpdated: timestamp("last_updated").defaultNow(),

  // Cached scores (denormalized for DB-side sort/filter/paginate at catalog scale).
  // Authoritative breakdowns are still computed on the fly on detail/compare pages.
  collisionRisk: real("collision_risk"),
  compliance: real("compliance"),
  salvage: real("salvage"),
  composite: real("composite"),
});

export type DebrisObject = typeof debrisObjects.$inferSelect;
export type NewDebrisObject = typeof debrisObjects.$inferInsert;
