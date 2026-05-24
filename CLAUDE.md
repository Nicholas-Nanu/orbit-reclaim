# Orbit Reclaim — Project Spec

> This file is the source of truth for Claude Code. Read it at the start of every session. When the spec and the code disagree, the spec wins — update the code (or update this file with a brief rationale).

---

## 1. Product

**Orbit Reclaim** is a decision-support dashboard for the space debris ecosystem. It sits between public tracking catalogues and the organizations that need to act on debris — satellite operators, debris-removal providers, insurers, and space agencies.

**Three analytical lenses** — every object in the catalogue is scored on all three, 0–100, with a transparent factor breakdown:

1. **Collision Risk** — likelihood and consequence of conjunction events.
2. **Compliance Urgency** — regulatory pressure to deorbit or remediate (driven by IADC 25-year rule, FCC 5-year rule, jurisdiction).
3. **Salvage Value** — economic value of the object as a recyclable asset (mass, materials, accessibility, co-location).

**Status:** MVP / pitch tool. No auth, no payments. The goal is to attract partners and investors. Sample/simulated data is fine.

**Personas the demo speaks to:**

- *Satellite operators* — "Which objects threaten my constellation in the next 30 days?"
- *Debris-removal startups* — "Which targets give the best combined compliance-urgency + salvage-value ratio for my next mission?"
- *Insurers* — "What's the risk profile of this orbital regime?"
- *Space agencies* — "Which jurisdictionally-owned objects are most overdue on compliance?"

---

## 2. Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 14 (App Router) | TypeScript, strict mode. |
| Styling | Tailwind CSS | Custom theme tokens (see §6). |
| DB | Postgres (Supabase hosted) | Using Supabase (Postgres) via its connected MCP instead of Neon — same Postgres, already wired into this workspace. `DATABASE_URL` points at the Supabase pooled connection. |
| ORM | Drizzle | Lighter than Prisma, SQL-native, fast iteration. |
| Charts | Recharts | Score breakdowns, distribution plots. |
| AI | `@anthropic-ai/sdk` | Claude Sonnet 4.5 for explanations. |
| Deploy | Vercel | Free tier covers the demo. |

**Do not add:** auth, payments, websockets, Redis, Stripe, anything not in the table above. Resist scope creep — this is a pitch tool.

---

## 3. File structure

```
orbit-reclaim/
├── app/
│   ├── layout.tsx                # Root layout, dark theme
│   ├── page.tsx                  # Dashboard (catalogue table + filters)
│   ├── debris/[id]/page.tsx      # Object detail + briefing
│   ├── compare/page.tsx          # Scenario comparison (2-3 objects)
│   └── api/
│       └── explain/route.ts      # Claude API endpoint
├── components/
│   ├── DebrisTable.tsx           # Sortable, filterable table
│   ├── FilterPanel.tsx           # Altitude, jurisdiction, type, status
│   ├── ScoreBadge.tsx            # Color-coded 0-100 chip
│   ├── ScoreBreakdown.tsx        # Per-lens factor breakdown w/ bars
│   ├── ObjectBrief.tsx           # One-page brief (printable)
│   ├── OrbitVisualizer.tsx       # Optional: simple altitude/inclination plot
│   └── ExplainPanel.tsx          # AI explanation w/ loading + retry
├── lib/
│   ├── scoring/
│   │   ├── collision-risk.ts
│   │   ├── compliance.ts
│   │   ├── salvage-value.ts
│   │   ├── shared.ts             # normalize, lookup tables
│   │   └── index.ts              # combined ranker
│   ├── db/
│   │   ├── schema.ts             # Drizzle schema
│   │   ├── client.ts             # connection
│   │   └── seed.ts               # loads data/sample-debris.json
│   └── claude.ts                 # Anthropic SDK wrapper
├── data/
│   └── sample-debris.json        # ~30 seed objects
├── tests/
│   └── scoring.test.ts           # vitest, lock in formula behavior
├── tailwind.config.ts
├── drizzle.config.ts
├── .env.local                    # DATABASE_URL, ANTHROPIC_API_KEY
└── package.json
```

---

## 4. Data model

```typescript
// lib/db/schema.ts (Drizzle)
export const debrisObjects = pgTable('debris_objects', {
  // Identity
  id: text('id').primaryKey(),                    // NORAD ID
  name: text('name').notNull(),
  type: text('type').$type<DebrisType>().notNull(),
  launchYear: integer('launch_year'),
  launchCountry: text('launch_country'),
  jurisdiction: text('jurisdiction').$type<Jurisdiction>(),

  // Physical
  massKg: real('mass_kg').notNull(),
  crossSectionM2: real('cross_section_m2').notNull(),
  intact: boolean('intact').notNull().default(false),
  materialClass: text('material_class').$type<MaterialClass>(),

  // Orbital
  altitudeKm: real('altitude_km').notNull(),
  inclinationDeg: real('inclination_deg').notNull(),
  eccentricity: real('eccentricity').notNull().default(0),
  estimatedYearsToDecay: real('estimated_years_to_decay'),

  // Mission
  missionStatus: text('mission_status').$type<MissionStatus>(),
  endOfLifeYear: integer('end_of_life_year'),
  hasPropellant: boolean('has_propellant').notNull().default(false),
  hasThrusters: boolean('has_thrusters').notNull().default(false),

  // Dynamic risk
  conjunctions30d: integer('conjunctions_30d').notNull().default(0),
  neighborsWithin50km: integer('neighbors_within_50km').notNull().default(0),
  deltaVToReachKms: real('delta_v_to_reach_kms'),

  // Source
  catalogSource: text('catalog_source').notNull().default('simulated'),
  lastUpdated: timestamp('last_updated').defaultNow(),
});

type DebrisType = 'rocket_body' | 'defunct_satellite' | 'fragment' | 'mission_debris';
type Jurisdiction = 'US' | 'ESA' | 'JP' | 'CN' | 'RU' | 'IN' | 'OTHER';
type MaterialClass = 'al_li_alloy' | 'titanium' | 'comsat_electronics' | 'eo_satellite' | 'mixed' | 'unknown';
type MissionStatus = 'active' | 'defunct' | 'unknown';
```

**Scores are not stored.** They are computed on the fly from the row + the formulas in §5. This keeps weightings tweakable without migrations.

---

## 5. Scoring engine (the core IP)

All scores are 0–100, computed as weighted sums of normalized 0–1 factors. **Every score returned to the UI must include its factor breakdown** so the dashboard can render transparent "why" panels. This is non-negotiable — explainability is the product.

### 5.1 Collision Risk

```
collisionRisk = 100 × (
  0.25 × massFactor +
  0.15 × sizeFactor +
  0.30 × altitudeDensityFactor +
  0.10 × inclinationCrossingFactor +
  0.15 × conjunctionFactor +
  0.05 × persistenceFactor
)
```

- `massFactor = clamp(log10(massKg + 1) / log10(10000), 0, 1)` — log scale, 10 t = 1.0.
- `sizeFactor = min(1, crossSectionM2 / 20)`.
- `altitudeDensityFactor` = piecewise lookup over LEO population density. Peak in the 700–900 km sun-sync corridor:
  - <300 km → 0.05
  - 300–500 km → 0.20
  - 500–700 km → 0.55
  - 700–900 km → **1.00**
  - 900–1200 km → 0.75
  - 1200–2000 km → 0.40
  - 2000–35000 km → 0.10
  - GEO (35000–36000 km) → 0.30 (low density, high consequence)
- `inclinationCrossingFactor = sin(inclinationDeg × π/180)` — polar/sun-sync crosses more planes than equatorial.
- `conjunctionFactor = min(1, conjunctions30d / 20)`.
- `persistenceFactor = 1 / (1 + (estimatedYearsToDecay ?? 1000) / 10)` — fast-decaying objects are self-solving.

### 5.2 Compliance Urgency

```
complianceUrgency = 100 × (
  0.40 × overdueFactor +
  0.25 × jurisdictionalPressureFactor +
  0.15 × altitudePersistenceFactor +
  0.10 × missionStatusFactor +
  0.10 × (1 − deorbitFeasibilityFactor)
)
```

- `overdueFactor`: years past applicable deorbit deadline, clamped 0–10, divided by 10.
  - Deadline = EOL year + (5 if US-licensed and post-2022, else 25).
- `jurisdictionalPressureFactor`:
  - US → 1.00 (FCC 5-year rule, active enforcement)
  - ESA → 0.70
  - JP → 0.70
  - IN → 0.50
  - CN → 0.40
  - RU → 0.40
  - OTHER/unknown → 0.30
- `altitudePersistenceFactor`: 1 − `naturalDecayFactor(altitude)` where decay is fast below 600 km.
  - <400 km → 0.10
  - 400–600 km → 0.30
  - 600–800 km → 0.70
  - 800–1000 km → 0.90
  - >1000 km → 1.00
- `missionStatusFactor`: defunct = 1.0, active = 0.0, unknown = 0.5.
- `deorbitFeasibilityFactor`: has propellant AND thrusters = 1.0, has thrusters only = 0.4, neither = 0.0. (Subtracted: an object that *can't* deorbit itself is more urgent for external action.)

### 5.3 Salvage Value

```
salvageValue = 100 × (
  0.30 × massFactor +
  0.25 × materialValueFactor +
  0.20 × intactnessFactor +
  0.15 × accessibilityFactor +
  0.10 × coLocationFactor
)
```

- `massFactor`: same as collision risk.
- `materialValueFactor` by `materialClass`:
  - `al_li_alloy` (modern rocket stages) → 0.85
  - `titanium` (older rocket stages, pressure vessels) → 0.95
  - `comsat_electronics` (gold, rare earths) → 0.90
  - `eo_satellite` (mixed, solar panels) → 0.70
  - `mixed` → 0.50
  - `unknown` → 0.30
- `intactnessFactor`: 1.0 if `intact === true`, 0.1 otherwise. Fragments are essentially unrecoverable.
- `accessibilityFactor`: `1 − min(1, deltaVToReachKms / 5)`. Sub-5 km/s = reachable, beyond = expensive.
- `coLocationFactor`: `min(1, neighborsWithin50km / 10)` — clustered targets enable multi-grab missions.

### 5.4 Return shape

Every scoring function must return:

```typescript
type ScoreResult = {
  score: number;              // 0-100, rounded to 1 decimal
  factors: Array<{
    name: string;             // e.g. "altitudeDensityFactor"
    label: string;            // human-readable, e.g. "Altitude density (700-900 km)"
    weight: number;           // 0-1, sums to 1 across factors
    rawValue: number;         // 0-1 normalized
    contribution: number;     // weight × rawValue × 100
  }>;
};
```

The combined ranker (`lib/scoring/index.ts`) returns `{ collisionRisk, compliance, salvage, composite }` where `composite = weighted average configurable in UI` (default equal weights).

### 5.5 Test obligations

`tests/scoring.test.ts` must lock in these reference objects (thresholds calibrated against the formulas above and the seed data in `data/sample-debris.json`):

- **SL-16 R/B at 850 km** (mass 8900 kg, intact, RU jurisdiction, defunct, 12 neighbors within 50 km): collisionRisk ≥ 85, compliance ≥ 80, salvage ≥ 90.
- **Fengyun-1C fragment at 851 km** (mass 0.4 kg, not intact, unknown material, 28 neighbors within 50 km): collisionRisk in 35–55, salvage in 25–40. *Note: fragments don't score near-zero on salvage because clustering and accessibility provide a floor — that's intentional, and the AI explanation should clarify that "salvage value" here reflects multi-target mission opportunity, not single-object recovery.*
- **Active Starlink at 551 km** (mass 295 kg, intact, US, active, hasPropellant + hasThrusters): compliance ≤ 35. *An active US sat carries some compliance overhead from jurisdictional pressure (US = 1.0 × 0.25 weight = 25 points floor); this is correct and surfaces that even healthy assets need EOL planning.*

If a formula change breaks these, update both the test and the rationale comment.

---

## 6. Brand & UI tokens

```typescript
// tailwind.config.ts theme.extend.colors
{
  bg:       '#0d0d0d',  // page background
  surface:  '#161616',  // cards, table rows
  border:   '#262626',  // dividers
  text:     '#ffffff',
  muted:    '#a3a3a3',
  gold:     '#ffe11f',  // primary accent — scores, CTAs, headlines
  goldDim:  '#b89c14',  // hover/secondary gold
  // Score gradient (used in ScoreBadge)
  scoreLow:  '#3b3b3b',
  scoreMed:  '#ffe11f',
  scoreHigh: '#ff6b35',  // orange-red for >75
}
```

**Typography:** Inter for UI, JetBrains Mono for IDs/numerical data (NORAD IDs, altitudes, masses).

**Visual feel:** dense, instrument-panel, NASA-mission-control. Tables and dashboards should feel like working tools, not marketing pages. Generous use of monospace for any numerical value. Subtle gold accents only — gold is the *signal* color, used to draw the eye to high-priority items.

**Animations:** minimal. Loading spinners can be a slowly rotating satellite-orbit SVG. Avoid bouncy or playful motion.

---

## 7. AI explanation layer

`POST /api/explain` accepts:

```typescript
{
  objectId: string;
  mode: 'score_explanation' | 'persona_brief' | 'comparison';
  persona?: 'operator' | 'insurer' | 'agency' | 'removal_provider';
  comparisonIds?: string[];  // for mode='comparison'
}
```

The route loads the object(s), runs the scoring, and calls Claude with a system prompt like:

> You are an analyst at Orbit Reclaim, a decision-support service for the space debris ecosystem. Given an object's orbital parameters and its three scores with factor breakdowns, write a plain-language explanation in 120–180 words. Lead with the headline finding. Cite specific factors and numbers from the breakdown — never invent values. End with one recommended action for the {persona}.

**Streaming:** use the SDK's streaming API and render tokens as they arrive. The `ExplainPanel` component should show a typewriter effect over the dark background — feels appropriately mission-control.

**Model:** `claude-sonnet-4-5` (latest). Keep responses to ~200 words max via system prompt.

**Cost guard:** cache explanations by `(objectId, mode, persona)` in memory (no DB) for the session.

---

## 8. Conventions

- **TypeScript strict, no `any`** — prefer `unknown` + narrowing.
- **Server components by default**; client components only when interactivity demands it (filters, sort, AI panel).
- **Scoring functions are pure** — no DB calls, no fetch. They take an object literal and return a `ScoreResult`. This is what makes them testable.
- **No CSS files** — Tailwind classes only. The single exception is `globals.css` for font imports and base body styles.
- **One concept per file.** A 400-line `utils.ts` is a code smell.
- **Commit messages:** conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`).

---

## 9. Out of scope (do not build)

- Authentication, user accounts, per-user state.
- Payment / billing.
- Real-time TLE ingestion (we use seeded data).
- Mobile-responsive layouts (the demo is presented on a laptop/projector — desktop-first, 1280px minimum is fine).
- Internationalization.
- Any feature that requires a backend job runner.

---

## 10. Definition of done for MVP

- [ ] Catalogue page loads in <1 s with 30+ seeded objects, sortable on all three scores.
- [ ] Filter panel narrows by altitude band, jurisdiction, type, mission status.
- [ ] Object detail page shows all orbital params, all three score breakdowns with visible weights, and an AI-generated brief.
- [ ] AI explanation streams in <3 s to first token.
- [ ] Scoring tests pass.
- [ ] Deployed to Vercel with a shareable URL.
- [ ] Brand: a non-engineer looking at it for 5 s says "this looks like space-tech."
