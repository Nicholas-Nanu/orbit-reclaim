const BASE = "https://www.space-track.org";

export type GpRecord = {
  NORAD_CAT_ID: string;
  OBJECT_NAME: string;
  OBJECT_TYPE: string | null; // PAYLOAD | ROCKET BODY | DEBRIS | UNKNOWN | TBA
  COUNTRY_CODE: string | null;
  LAUNCH_DATE: string | null;
  APOAPSIS: string | null;
  PERIAPSIS: string | null;
  INCLINATION: string | null;
  ECCENTRICITY: string | null;
};

async function login(): Promise<string> {
  const identity = process.env.SPACETRACK_USER;
  const password = process.env.SPACETRACK_PASS;
  if (!identity || !password) {
    throw new Error("SPACETRACK_USER / SPACETRACK_PASS are not set in the environment.");
  }
  const r = await fetch(`${BASE}/ajaxauth/login`, {
    method: "POST",
    body: new URLSearchParams({ identity, password }),
  });
  if (!r.ok) throw new Error(`Space-Track login failed: ${r.status} ${r.statusText}`);

  const setCookies =
    typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
  const fallback = r.headers.get("set-cookie");
  const cookie = setCookies.length
    ? setCookies.map((c) => c.split(";")[0]).join("; ")
    : fallback
      ? fallback.split(";")[0]
      : "";
  if (!cookie) throw new Error("Space-Track login returned no session cookie.");
  return cookie;
}

/** Fetch the latest GP element set for every on-orbit object (decay_date = null). */
export async function fetchAllOnOrbit(): Promise<GpRecord[]> {
  const cookie = await login();
  const url =
    `${BASE}/basicspacedata/query/class/gp/decay_date/null-val` +
    `/orderby/NORAD_CAT_ID%20asc/format/json`;
  const r = await fetch(url, { headers: { Cookie: cookie } });
  if (!r.ok) {
    throw new Error(`Space-Track GP query failed: ${r.status} ${r.statusText}`);
  }
  return (await r.json()) as GpRecord[];
}
