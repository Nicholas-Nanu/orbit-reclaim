export type HeroObject = {
  id: string;
  name: string;
  type: string;
  jurisdiction: string | null;
  missionStatus: string | null;
  altitudeKm: number;
  inclinationDeg: number;
  line1: string | null;
  line2: string | null;
  collision: number;
  compliance: number;
  salvage: number;
  composite: number;
};
