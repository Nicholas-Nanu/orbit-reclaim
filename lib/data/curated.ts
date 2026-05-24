import type {
  DebrisType,
  Jurisdiction,
  MaterialClass,
  MissionStatus,
} from "@/lib/db/schema";

/**
 * Hand-curated physical/mission attributes for well-known objects. These
 * override the heuristic estimates during catalog import so the showcase
 * objects have meaningful (not generic) salvage/compliance scores.
 * Orbit + name still come live from Space-Track.
 */
export type CuratedPhysical = {
  type: DebrisType;
  jurisdiction: Jurisdiction;
  launchCountry: string;
  launchYear: number;
  massKg: number;
  crossSectionM2: number;
  intact: boolean;
  materialClass: MaterialClass;
  missionStatus: MissionStatus;
  endOfLifeYear: number | null;
  hasPropellant: boolean;
  hasThrusters: boolean;
  estimatedYearsToDecay: number;
  conjunctions30d: number;
  neighborsWithin50km: number;
  deltaVToReachKms: number;
};

const RB = (o: Partial<CuratedPhysical>): CuratedPhysical => ({
  type: "rocket_body",
  jurisdiction: "RU",
  launchCountry: "Russia",
  launchYear: 1990,
  massKg: 8900,
  crossSectionM2: 32,
  intact: true,
  materialClass: "al_li_alloy",
  missionStatus: "defunct",
  endOfLifeYear: 1990,
  hasPropellant: false,
  hasThrusters: false,
  estimatedYearsToDecay: 150,
  conjunctions30d: 8,
  neighborsWithin50km: 8,
  deltaVToReachKms: 1.0,
  ...o,
});

const SAT = (o: Partial<CuratedPhysical>): CuratedPhysical => ({
  type: "defunct_satellite",
  jurisdiction: "US",
  launchCountry: "USA",
  launchYear: 2000,
  massKg: 1000,
  crossSectionM2: 9,
  intact: true,
  materialClass: "comsat_electronics",
  missionStatus: "defunct",
  endOfLifeYear: 2015,
  hasPropellant: false,
  hasThrusters: false,
  estimatedYearsToDecay: 100,
  conjunctions30d: 6,
  neighborsWithin50km: 6,
  deltaVToReachKms: 1.0,
  ...o,
});

export const CURATED: Record<string, CuratedPhysical> = {
  // Rocket bodies
  "23705": RB({ launchYear: 1995, endOfLifeYear: 1995, conjunctions30d: 12, neighborsWithin50km: 10, deltaVToReachKms: 0.9 }),
  "16182": RB({ launchYear: 1985, endOfLifeYear: 1985, conjunctions30d: 10, neighborsWithin50km: 8, deltaVToReachKms: 1.0, estimatedYearsToDecay: 160 }),
  "27387": RB({ jurisdiction: "ESA", launchCountry: "ESA", launchYear: 2002, endOfLifeYear: 2002, massKg: 4540, crossSectionM2: 30, conjunctions30d: 8, neighborsWithin50km: 9, deltaVToReachKms: 1.1, estimatedYearsToDecay: 130 }),
  "19046": RB({ launchYear: 1988, endOfLifeYear: 1988, massKg: 1400, crossSectionM2: 10, conjunctions30d: 7, neighborsWithin50km: 6 }),
  "11267": RB({ launchYear: 1979, endOfLifeYear: 1979, massKg: 1400, crossSectionM2: 9.4, conjunctions30d: 6, neighborsWithin50km: 5, deltaVToReachKms: 1.2, estimatedYearsToDecay: 200 }),

  // Defunct satellites
  "27386": SAT({ jurisdiction: "ESA", launchCountry: "ESA", launchYear: 2002, massKg: 8211, crossSectionM2: 71, materialClass: "eo_satellite", endOfLifeYear: 2012, estimatedYearsToDecay: 150, conjunctions30d: 14, neighborsWithin50km: 9, deltaVToReachKms: 1.1 }),
  "21574": SAT({ jurisdiction: "ESA", launchCountry: "ESA", launchYear: 1991, massKg: 2384, crossSectionM2: 18, materialClass: "eo_satellite", endOfLifeYear: 2000, estimatedYearsToDecay: 120, conjunctions30d: 8, neighborsWithin50km: 6 }),
  "5": SAT({ launchYear: 1958, massKg: 1.5, crossSectionM2: 0.05, endOfLifeYear: 1964, estimatedYearsToDecay: 240, conjunctions30d: 1, neighborsWithin50km: 1, deltaVToReachKms: 1.4 }),
  "23533": SAT({ launchYear: 1995, massKg: 830, crossSectionM2: 7.5, intact: false, materialClass: "eo_satellite", endOfLifeYear: 2015, estimatedYearsToDecay: 130, conjunctions30d: 12, neighborsWithin50km: 14, deltaVToReachKms: 1.1 }),
  "22675": SAT({ jurisdiction: "RU", launchCountry: "Russia", launchYear: 1993, massKg: 900, crossSectionM2: 9, intact: false, materialClass: "mixed", endOfLifeYear: 2009, estimatedYearsToDecay: 90, conjunctions30d: 11, neighborsWithin50km: 20 }),
  "32395": SAT({ jurisdiction: "RU", launchCountry: "Russia", launchYear: 2007, massKg: 1415, crossSectionM2: 12, endOfLifeYear: 2020, estimatedYearsToDecay: 50000, conjunctions30d: 1, neighborsWithin50km: 3, deltaVToReachKms: 3.6 }),
  "24842": SAT({ launchYear: 1997, massKg: 689, crossSectionM2: 8.5, endOfLifeYear: 2018, estimatedYearsToDecay: 60, conjunctions30d: 10, neighborsWithin50km: 14 }),
  "24812": SAT({ launchYear: 1997, massKg: 1500, crossSectionM2: 28, endOfLifeYear: 2017, estimatedYearsToDecay: 100000, conjunctions30d: 2, neighborsWithin50km: 4, deltaVToReachKms: 4.3 }),
  "29155": SAT({ launchYear: 2006, massKg: 3133, crossSectionM2: 28, endOfLifeYear: 2017, estimatedYearsToDecay: 100000, conjunctions30d: 1, neighborsWithin50km: 3, deltaVToReachKms: 4.2 }),
  "8820": SAT({ launchYear: 1976, massKg: 406, crossSectionM2: 1.1, materialClass: "mixed", endOfLifeYear: 1976, estimatedYearsToDecay: 100000, conjunctions30d: 1, neighborsWithin50km: 1, deltaVToReachKms: 2.5 }),
  "20437": SAT({ jurisdiction: "OTHER", launchCountry: "UK", launchYear: 1990, massKg: 50, crossSectionM2: 0.6, materialClass: "mixed", endOfLifeYear: 2005, estimatedYearsToDecay: 90, conjunctions30d: 4, neighborsWithin50km: 5, deltaVToReachKms: 0.9 }),
  "41783": SAT({ jurisdiction: "IN", launchCountry: "India", launchYear: 2016, massKg: 10, crossSectionM2: 0.3, materialClass: "mixed", endOfLifeYear: 2018, estimatedYearsToDecay: 25, conjunctions30d: 3, neighborsWithin50km: 6, deltaVToReachKms: 0.7 }),

  // Active satellites
  "58221": SAT({ launchYear: 2024, massKg: 295, crossSectionM2: 3.7, missionStatus: "active", endOfLifeYear: null, hasPropellant: true, hasThrusters: true, estimatedYearsToDecay: 5, conjunctions30d: 2, neighborsWithin50km: 30, deltaVToReachKms: 0.3 }),
  "27424": SAT({ launchYear: 2002, massKg: 2934, crossSectionM2: 16, materialClass: "eo_satellite", missionStatus: "active", endOfLifeYear: null, hasPropellant: true, hasThrusters: true, estimatedYearsToDecay: 60, conjunctions30d: 5, neighborsWithin50km: 8, deltaVToReachKms: 0.8 }),
  "40118": SAT({ jurisdiction: "CN", launchCountry: "China", launchYear: 2014, massKg: 2100, crossSectionM2: 14, materialClass: "eo_satellite", missionStatus: "active", endOfLifeYear: null, hasPropellant: true, hasThrusters: true, estimatedYearsToDecay: 30, conjunctions30d: 4, neighborsWithin50km: 7, deltaVToReachKms: 0.7 }),
  "48274": SAT({ jurisdiction: "CN", launchCountry: "China", launchYear: 2021, massKg: 22000, crossSectionM2: 78, materialClass: "mixed", missionStatus: "active", endOfLifeYear: null, hasPropellant: true, hasThrusters: true, estimatedYearsToDecay: 1, conjunctions30d: 6, neighborsWithin50km: 4, deltaVToReachKms: 0.2 }),
};
