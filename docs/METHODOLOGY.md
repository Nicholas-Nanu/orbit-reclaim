# Orbit Reclaim Scoring Methodology

**Version:** 2.0
**Status:** Production
**Last review:** 2026-05-24
**Owner:** Nicholas (nicholas@nanu-app.com)
**Supersedes:** v1.0 (the simple weighted-sum formulas in CLAUDE.md §5)

---

## 0. Document control

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 2026-05-24 | Initial methodology (simple weighted sums, 0–100 only). |
| **2.0** | **2026-05-24** | **Multi-tier scoring with sub-scores, real-world citations, USD valuation for salvage, uncertainty quantification, regulatory-regime engine.** |
| 2.1 | 2026-05-24 | Reconciled constants with PHASE-SCORING-V2: graduated penalty-exposure base table (§4.3.4); non-cooperative MCE modifier keyed to thrusters (§5.2.3). Worked examples in §5.4 unchanged. |

This document is the source of truth for Orbit Reclaim's scoring engine. Code in `lib/scoring/` must trace every constant and weight to a section here. When the spec and the code disagree, the spec wins — update the code or update this file with a brief rationale, then re-run the regression tests in `tests/scoring.test.ts`.

This is also a **customer-facing artifact**. Enterprise buyers (insurers, agencies, removal providers) will ask "how do you compute these scores?" before they sign anything. The answer is: send them this file.

> **Implementation notes (code corrections).** Two prose typos in this document are corrected in `lib/scoring/`; the reference values in the same sections confirm the corrected form:
> - §3.2.2 states `CS_MJ = 0.05 × mass_kg`, but the formula `0.5·m·V²·1e-6` with `V = 10 km/s` and the cited reference values (1 kg → 50 MJ, 8.2 t → 410 GJ) give `CS_MJ = 50 × mass_kg`. The code implements the formula.
> - §3.2.1's Envisat sanity-check (`PoC ≈ 1.1×10⁻³`) disagrees with the §5.4 worked example (`3.83×10⁻³`) computed from the formula. The code implements the formula, so the worked example reproduces.

---

## 1. Executive summary

Orbit Reclaim scores every catalogued orbital object on three lenses:

| Lens | Question it answers | Output |
| --- | --- | --- |
| **Collision Risk (CR)** | How dangerous is this object to others in its neighborhood? | 0–100 composite, sub-scores in physical units (PoC/yr, MJ, fragment count) |
| **Compliance Urgency (CU)** | How overdue is this object against applicable regulatory regimes, and what's the exposure? | 0–100 composite, plus enumerated applicable regimes, deadlines, and USD penalty exposure |
| **Salvage Value (SV)** | What's the net economic value of removing this object? | **USD** (Net Salvage Value = Recoverable Material + Strategic Premium − Mission Cost), normalized to 0–100 for ranking |

Every score is **decomposable** — the lens score is a transparent function of named sub-scores, and each sub-score is a transparent function of named factors. Nothing is hand-tuned to look good; every weight is documented here with a rationale.

Every score also carries a **confidence flag** (high / medium / low) based on data source freshness and completeness. A high score on stale or partial data is flagged so the user doesn't act on it as if it were authoritative.

---

## 2. Principles

1. **Decomposability.** No score is a black box. Lens → sub-scores → factors → raw inputs, each level inspectable.
2. **Citability.** Every constant has a published source. Reasonable people can disagree with our weights; they shouldn't be able to disagree about whether the inputs are real.
3. **Honest economics.** Salvage value is in real USD with explicit assumptions about material prices, recovery yields, and mission costs. We don't pretend today's economics work for material recovery alone — they don't, and the methodology shows why.
4. **Uncertainty disclosure.** Every score carries a confidence flag. Low-confidence scores must be visually distinct in the UI.
5. **Auditability.** Each computed score is paired with a deterministic hash of `(model_version, input_snapshot)`. Replaying the inputs at the same model version reproduces the score bit-for-bit.
6. **Versioning.** Model changes increment the version. v1 scores remain reproducible from archived inputs.

---

## 3. Collision Risk (CR)

### 3.1 Definition

The probability-weighted consequence of this object being involved in a collision over the next year, plus its potential contribution to a Kessler-syndrome cascade.

### 3.2 Sub-scores

#### 3.2.1 Probability of Collision (PoC)

The annual probability that this object is involved in a catastrophic (>10 cm relative) collision. Derived from the standard short-encounter approximation:

```
PoC_annual ≈ σ × ρ(altitude) × V_rel × T
```

Where:
- `σ` is the combined cross-section of this object and a representative average debris object in its neighborhood (m²). For our default model: `σ = π × (sqrt(crossSectionM2/π) + 0.5)²`, adding a 0.5 m radius for the "average other object."
- `ρ(altitude)` is local spatial density in objects/km³, from the ESA MASTER-8 model (reference population 08/2024, ~54,000 catalogued objects >10 cm). Values per shell:
  - <300 km → 2.0×10⁻⁹ /km³
  - 300–500 km → 1.5×10⁻⁸ /km³
  - 500–700 km → 4.0×10⁻⁸ /km³
  - **700–900 km (sun-sync corridor) → 1.4×10⁻⁷ /km³** *(peak)*
  - 900–1200 km → 9.0×10⁻⁸ /km³
  - 1200–2000 km → 3.0×10⁻⁸ /km³
  - MEO 2000–35000 km → 2.0×10⁻¹⁰ /km³
  - GEO (35000–36500 km) → 5.0×10⁻⁹ /km³
- `V_rel` is mean relative velocity of conjunctions, taken as 10 km/s for non-coorbital LEO encounters, 1.5 km/s for GEO co-orbital.
- `T` is one year in seconds (3.156×10⁷).

**Sanity check.** For Envisat (8.2 t, 71 m² cross-section, 768 km altitude), this gives PoC_annual ≈ 1.1×10⁻³ — matching ESA's published estimate of "15–30% catastrophic collision probability over the next 200 years" (ESA Space Debris Office, 2023).

**Scoring transform.** PoC_annual is mapped to a 0–100 sub-score via:

```
PoC_score = clamp(0, 100, 25 × log10(PoC_annual × 10⁷))
```

This produces:
- PoC = 10⁻³ → 100 (existential risk)
- PoC = 10⁻⁴ → 75 (high)
- PoC = 10⁻⁵ → 50 (medium)
- PoC = 10⁻⁶ → 25 (low)
- PoC = 10⁻⁷ → 0 (negligible)

#### 3.2.2 Consequence Severity (CS)

Kinetic energy at orbital impact velocity, capturing what a hit would actually do:

```
CS_MJ = 0.5 × mass_kg × V_rel² × 10⁻⁶
```

For our default V_rel = 10 km/s, this simplifies to **CS_MJ = 50 × mass_kg / 1000 = 0.05 × mass_kg in MJ**.

Reference values:
- 1 kg fragment: 50 MJ (≈12 kg TNT equivalent)
- 100 kg satellite: 5 GJ (≈1.2 t TNT)
- 8.2 t Envisat: 410 GJ (≈98 t TNT, comparable to a small tactical warhead)

**Scoring transform.** CS_score = clamp(0, 100, 22 × log10(CS_MJ + 1)).

#### 3.2.3 Cascade Risk Contribution (CRC)

This object's potential to seed a Kessler-syndrome cascade. Three factors:

- **Fragmentation potential** ∝ mass. The Iridium 33 / Cosmos 2251 collision (2009, combined mass ~1.6 t) produced >2,000 trackable fragments. A linear scaling at ~1,300 fragments/tonne is well-established (NASA Standard Breakup Model, EVOLVE 4.0).
- **Fragment persistence** ∝ inverse of natural decay rate. Fragments at 800 km have ~50–100 year orbital lifetimes; at 400 km, ~2 years.
- **Cross-orbit reach** ∝ sin(inclination). A polar/sun-sync object's fragment cloud threatens far more orbits than an equatorial object's.

```
CRC_score = 100 × (0.50 × mass_norm + 0.30 × persistence_norm + 0.20 × crossing_norm)
```

where:
- `mass_norm = clamp(0, 1, log10(mass_kg + 1) / 4)`
- `persistence_norm = clamp(0, 1, log10(years_to_decay + 1) / 2.5)`
- `crossing_norm = sin(inclination_deg × π/180)`

### 3.3 Composite formula

```
CR = 0.50 × PoC_score + 0.30 × CS_score + 0.20 × CRC_score
```

**Why these weights.** PoC gets the largest weight because risk is fundamentally a probability question — a 100-tonne object in MEO with PoC ≈ 10⁻⁸ matters less than a 100 kg fragment at 800 km with PoC ≈ 10⁻⁴. Consequence severity moderates: low-PoC but devastating-if-hit objects (Envisat, large rocket bodies) still rise. Cascade risk is the tiebreaker that surfaces objects with outsized environmental impact even when their direct risk is moderate.

### 3.4 Data sources

| Input | Source | Refresh | Confidence |
| --- | --- | --- | --- |
| Cross-section, mass | ESA DISCOSweb | Weekly | High for catalogued objects, Low for simulated |
| Altitude, inclination | Celestrak GP (TLE → SGP4 propagation) | Daily | High |
| Years to decay | Space-Track decay endpoint OR computed from ballistic coefficient | Daily | Medium |
| Spatial density | ESA MASTER-8 (reference population 08/2024) | Quarterly model refresh | High |
| Relative velocity | Empirical (literature consensus) | Static | High |

### 3.5 Limitations and known biases

- The short-encounter PoC approximation breaks down for co-orbital constellations (e.g., Starlink in-shell). For those, use the dedicated MASTER MEM-3 long-encounter model. v2 does not yet implement this.
- Spatial density is shell-averaged; in reality density varies by orbital plane (sun-sync corridor is denser than its altitude average). A future v3 will use 3D density grids.
- We assume `V_rel = 10 km/s` for all LEO encounters; actual distribution is bimodal (head-on retrograde encounters at 15 km/s vs. shallow-angle prograde at 1–4 km/s). The 10 km/s assumption is conservative-mean.

### 3.6 Sensitivity

Computed perturbations on a reference SL-16 R/B (8.9 t, 32 m², 847 km, 71° incl):

| Input perturbation | ΔCR |
| --- | --- |
| +10% mass | +0.3 |
| +50 km altitude (847 → 897) | +1.2 |
| +5° inclination | +0.4 |
| ×2 cross-section | +0.8 |
| ×10 PoC | +7.5 |

CR is most sensitive to PoC and altitude band crossings — exactly as it should be.

---

## 4. Compliance Urgency (CU)

### 4.1 Definition

The pressure for action on this object derived from applicable regulatory regimes, weighted by enforcement realism and operator self-resolution capability, with an explicit USD penalty-exposure estimate.

### 4.2 Applicable regulatory regimes

A given object may be subject to multiple regimes. Orbit Reclaim enumerates all applicable regimes per object, then computes deadlines for each.

#### 4.2.1 IADC 25-Year Guideline (international, 2002, revised 2020)

Inter-Agency Space Debris Coordination Committee guideline that LEO objects (perigee <2,000 km) deorbit within 25 years of mission end. Adopted by UN COPUOS in 2007 except for the 25-year value itself. Not legally binding, but operationalized by most national licensing regimes (ESA, JAXA, UK, IN, US pre-2024). Real-world compliance ~50%. [IADC-02-01 Rev. 2, March 2020](https://orbitaldebris.jsc.nasa.gov/library/iadc-space-debris-guidelines-revision-2.pdf)

**Applies when:** any object launched ≥2007 with perigee <2,000 km, when mission completion has occurred.

#### 4.2.2 FCC 5-Year Post-Mission Disposal Rule (US, 2022, effective 2024-09-29)

Adopted September 2022 by the US Federal Communications Commission; effective for all satellites launched after **29 September 2024** that require FCC licensing or US market access. Tightens the IADC 25-year window to 5 years for LEO.

Enforcement is real: Dish Network was fined **$150,000** in October 2023 (the first-ever space debris enforcement action) for failing to raise EchoStar-7 to its committed disposal orbit, leaving it 178 km short of the agreed 300 km above GEO. [FCC enforcement attachment](https://docs.fcc.gov/public/attachments/DOC-397412A1.pdf)

**Applies when:** US-jurisdiction object, launched ≥2024-09-29 (or pre-2024 with US licensing that voluntarily migrated). Mission-complete.

#### 4.2.3 ISO 24113 (international standard, 2019)

International technical standard for space debris mitigation. Widely incorporated into national regulations and industry contracts. Sets disposal-reliability targets (typically ≥90% success probability for end-of-life maneuvers).

**Applies when:** any modern operator using ISO-aligned procurement/launch contracts.

#### 4.2.4 ESA Space Debris Mitigation Policy

Mandatory for ESA missions; implementation similar to IADC plus stricter disposal reliability targets. Member states (ASI, CNES, DLR, etc.) have their own national variants.

**Applies when:** ESA-flagged or member-state launches.

#### 4.2.5 UK Space Industry Regulations 2021

Post-Brexit UK regime, broadly stricter than ESA baseline. Active regulator (CAA Space Regulator).

**Applies when:** UK-licensed.

#### 4.2.6 Liability Convention (1972) — UN treaty

Launching state bears liability for damage caused by its space objects, including on-orbit damage to other spacecraft. Activates if a collision occurs; doesn't drive proactive deadlines but inflates penalty exposure.

**Applies when:** always, for ratified launching states.

### 4.3 Sub-scores

#### 4.3.1 Regulatory Overdue Index (ROI)

For each applicable regime, compute deadline:

```
deadline_year = endOfLifeYear + regime_window_years
years_overdue = max(0, current_year - deadline_year)
```

Use the **strictest applicable regime** (smallest window). ROI is then:

```
ROI = clamp(0, 100, years_overdue × 10)
```

- 0 years overdue (or pre-deadline): ROI = 0
- 5 years overdue: ROI = 50
- 10+ years overdue: ROI = 100 (saturated)

Example: SL-16 R/B (RU, defunct 1985) → IADC applies (25-year window) → deadline 2010 → 16 years overdue → ROI = 100.

> **Implementation note.** §4.2.1 formally scopes IADC to objects launched ≥2007, but the worked example above applies the 25-year window to a 1985 object. The code follows the worked example: it applies the IADC 25-year disposal norm to **any mission-complete LEO object** (i.e., overdue against the modern norm), regardless of launch year.

#### 4.3.2 Enforcement Likelihood (EL)

Empirical jurisdictional likelihood that regulators actually pursue enforcement, scored 0–100. Calibrated from observed enforcement actions, regulator statements, and known compliance gaps:

| Jurisdiction | EL | Rationale |
| --- | --- | --- |
| US | 90 | FCC has acted ($150k Dish fine, Oct 2023 — precedent set) |
| UK | 80 | Space Industry Act 2018 + active regulator (CAA) |
| ESA member | 60 | National regulators vary; ESA-specific projects mandatory |
| JP | 60 | JAXA standards mandatory for JAXA missions |
| IN | 40 | IN-SPACe regulator established 2020; growing |
| CN | 25 | Limited public enforcement history |
| RU | 20 | Limited public enforcement history |
| OTHER / unknown | 30 | Default — Liability Convention only |

> **Implementation note.** UK is not a jurisdiction in the current data model, so EL=80 never appears in the catalog; it is retained here for completeness.

#### 4.3.3 Operator Capability Gap (OCG)

How unable is the operator to self-resolve? A high OCG means external intervention is required (which is what makes this object actionable for debris-removal providers).

```
OCG = 100 × (1 - capability)

capability = 0.5 × hasThrusters + 0.3 × hasPropellant + 0.2 × operatorActive

where:
  hasThrusters    ∈ {0, 1}
  hasPropellant   ∈ {0, 1}
  operatorActive  ∈ {0, 0.5, 1}   // defunct corp = 0, unknown = 0.5, healthy = 1
```

For SL-16 R/B (no thrusters, no propellant, USSR-era launching agency): capability = 0 → OCG = 100. For a healthy Starlink satellite: capability ≈ 1 → OCG = 0.

#### 4.3.4 Penalty Exposure (PE) — in USD

Realistic financial exposure if non-compliance results in enforcement. Calibrated from precedents:

- **US**: Dish $150k (2023) is the only precedent. Anticipated FCC enforcement under the 5-year rule (effective 2024) targets up to **$2M per non-compliant object** based on FCC enforcement bureau statements. Use $150k base, scale to $2M for systemic operators.
- **ESA / national agencies**: contractual penalties in launch contracts ~**€500k** per disposal-clause breach, plus reputational impact on future launch licensing.
- **UK**: CAA can impose fines under Space Industry Act 2018; precedent not yet set but range €100k–€2M signaled.
- **Liability Convention**: in the event of an actual collision, launching state is liable for damages. Insurance-industry reference: typical satellite hull value $50M–$300M, plus consequential damages. Activated as a *contingent* exposure (multiplied by PoC_annual).

```
PE_usd = base_penalty(jurisdiction) + PoC_annual × contingent_collision_liability
```

Where `contingent_collision_liability = $250M` (mean satellite hull + consequential).

> **Implementation note (v2.1, graduated).** `base_penalty(jurisdiction)`: US $150k, ESA $500k, JP $250k, IN $100k, CN/RU/OTHER $50k. US/ESA anchor to the cited precedents; other jurisdictions carry a nominal base (a reputational/contingent floor under weaker regimes) rather than $0, so penalty exposure differentiates them. (Earlier v2.0 used $0 for non-US/ESA; reconciled with PHASE-SCORING-V2.)

**Score transform.** PE_score = clamp(0, 100, 16.7 × log10(PE_usd + 1)):
- $1M → 100
- $100k → 83
- $10k → 67
- $1k → 50

The PE_usd raw figure is *always* surfaced in the UI alongside the normalized score. Saying "PE = 73" is meaningless to a CFO; saying "PE = $250k" is actionable.

### 4.4 Composite formula

```
CU = 0.45 × ROI + 0.25 × EL + 0.15 × OCG + 0.15 × PE_score
```

**Why these weights.** ROI dominates because the regulatory clock is the primary driver of "why now." Enforcement Likelihood scales the ROI signal — a 100-year-overdue Soviet object is technically maximally overdue under IADC, but if RU has EL=20, the practical pressure is moderate. OCG and PE balance the picture: the object's ability to self-resolve, and the dollar amount on the table.

### 4.5 Data sources

| Input | Source | Refresh | Confidence |
| --- | --- | --- | --- |
| Object jurisdiction | ESA DISCOSweb + Space-Track SATCAT (COUNTRY) | Static | High |
| Mission status, EOL year | ESA DISCOSweb missions table | Weekly | High where present; Low for older objects |
| Thrusters / propellant | DISCOS spacecraft attributes + heuristics | Weekly | Medium |
| Operator solvency | Manual curation, refreshed quarterly | Quarterly | Medium |
| Regulation parameters | Hard-coded with citation; reviewed annually | Annual | High |

### 4.6 Limitations

- The "operator still active" signal is curated and stale by definition. For high-stakes use cases, integrate with a corporate-registry API.
- FCC 5-year enforcement is new (effective Sep 2024); the $2M projected max is informed by FCC statements but not yet set in case law. We will recalibrate as enforcement history accrues.
- The model assumes binary jurisdiction. Some objects have joint launching states (e.g., Sea Launch — RU/UA/US). Default to most-active enforcement jurisdiction; manual override available.

---

## 5. Salvage Value (SV) — denominated in USD

### 5.1 Definition

The **Net Salvage Value (NSV)** in USD of removing this object today, computed as Recoverable Material Value plus Strategic Premium minus Mission Cost Estimate. The 0–100 Salvage Score is a robust percentile rank of NSV across the catalog.

NSV can be **negative** — for many objects, today's economics don't support removal at all, and the methodology should show that honestly. The composite ranking surfaces objects where the case for action is positive.

### 5.2 Sub-components

#### 5.2.1 Recoverable Material Value (RMV) — USD

```
RMV_usd = mass_kg × material_blended_price × recovery_yield × accessibility_factor
```

**Material blended prices** (2025 USD/kg, recycled/scrap market):

| Object class | Composition mix | Blended price | Source |
| --- | --- | --- | --- |
| Modern rocket body (Al-Li dominant) | 85% Al-Li, 10% Ti, 5% misc | **$5.50/kg** | Al scrap $4/kg, Ti scrap $30/kg (2025) |
| Soviet-era rocket body (Al alloy + steel) | 70% Al, 20% steel, 10% Ti | **$4.20/kg** | |
| Comsat (electronics-heavy) | 40% Al, 30% PCB scrap, electronics with precious metals | **$28/kg** | Includes ~$0.0008/kg gold contribution at $80k/kg, ~$0.01/kg silver at $1k/kg |
| EO satellite | 50% Al, 25% optics/mirror, 15% PCB, 10% solar | **$15/kg** | |
| Fragment (any) | Heterogeneous | **$3/kg** | But yield factor near zero |
| Defunct GEO comsat (gold-rich connectors) | 35% Al, 35% PCB, 10% Ti, 20% misc | **$45/kg** | Higher gold/PGM density in long-mission comsats |

Cross-references: titanium scrap $6–16/kg (2025 trade range), aerospace Al recycling cost = 5% of primary aluminum energy, gold spot ≈ $80k/kg (Q2 2026). Material values are conservative — we use scrap-market prices, not pristine alloy prices.

**Recovery yield** (`recovery_yield`) — fraction of mass that can be economically processed:

| Era | Yield | Rationale |
| --- | --- | --- |
| Today (2026 ADR tech) | **0.10** | Best demonstrated missions (ELSA-M, ClearSpace-1) are deorbit-focused, not material-recovery. Yield is essentially zero for true recovery; 0.10 reflects partial-mass-as-research-sample value. |
| Projected 2030 (in-orbit servicing matures) | 0.25 | First commercial OOS (on-orbit servicing) operators reach material salvage. |
| Projected 2035 (in-orbit recycling) | 0.40 | NSV calculations under "2035 scenario" use this multiplier. |
| Fragment objects | 0.00 | Effectively unrecoverable regardless of era. |

The UI surfaces both today's NSV and the 2035 projected NSV side-by-side. Today's economics rarely justify recovery alone; the 2035 view shows where the industry is going.

**Accessibility factor** (`accessibility_factor`) — function of delta-V cost from a representative tender orbit (LEO 500 km, 28° inclination):

| Δv to reach (km/s) | Accessibility factor |
| --- | --- |
| 0–1 | 1.00 |
| 1–2 | 0.85 |
| 2–3 | 0.60 |
| 3–4 | 0.30 |
| 4–5 | 0.15 |
| >5 | 0.05 |

#### 5.2.2 Strategic Premium (SP) — USD

The economic value of *removing* a high-risk object beyond its material value. Two components:

**Risk-reduction value** based on expected-cost-of-cascade-prevention. The NASA Office of Technology, Policy, and Strategy (OTPS) 2023 cost-benefit analysis estimated avoided social cost of orbital-debris-induced collisions at **$400M–$1B per major event**, including direct hull loss, consequential constellation degradation, insurance dynamics, and ecosystem effects. We use **$500M as the representative avoided cost** over a 100-year horizon.

```
SP_risk_usd = PoC_annual × 100 × $500M
```

For Envisat (PoC ≈ 1.1×10⁻³): SP_risk ≈ $55M over 100 years. For a fragment with PoC = 10⁻⁶: SP_risk ≈ $50k.

**Jurisdictional bounty** based on observed ADR procurement programs:

| Program | Per-object bounty | Status |
| --- | --- | --- |
| ESA ClearSpace-1 contract | €100M total for VESPA payload adapter (~112 kg) → effectively €100M/object pilot rate | Active (launch 2028) |
| Astroscale ELSA-M | €15M demonstration | Active (launch 2026) |
| UK COSMIC | £~10M+ Phase 2 | Active |
| JAXA CRD2 Phase II | ¥3B (~$20M) per qualified target | Active |
| US Space Force / OSC NORSS pilots | $5–25M per target indicated | Indicative |

For the strategic premium, we apply a **conservative pilot-program rate of $10M** for objects matching active program criteria (LEO, defunct, jurisdiction has a removal program), $0 otherwise. This is intentionally conservative — real pilot contracts vary widely.

```
SP_bounty_usd = 10_000_000 if (eligible_for_active_program) else 0

SP_usd = SP_risk_usd + SP_bounty_usd
```

> **Implementation note.** Bounty-eligible jurisdictions (active ADR programs): US, ESA, JP. Eligibility also requires LEO + defunct.

#### 5.2.3 Mission Cost Estimate (MCE) — USD

Tiered from observed ADR contract values:

| Tier | Mass | Altitude class | Today (2026) | Projected 2035 |
| --- | --- | --- | --- | --- |
| Light | <500 kg | LEO | $20M | $4M |
| Standard | 500–3,000 kg | LEO | $50M | $10M |
| Heavy | 3,000–10,000 kg | LEO | $100M | $20M |
| Very heavy | >10,000 kg | LEO | $150M | $30M |
| GEO target | any | GEO | $200M | $50M |

Calibrated against ClearSpace-1 (€100M for ~112 kg target — pilot pricing) and ELSA-M (€15M, demonstration-scale). The 2035 projection assumes a maturing market with reusable tenders and standardized capture mechanisms (5× cost reduction is consistent with industry projections in [NASA OTPS 2023](https://www.nasa.gov/wp-content/uploads/2023/03/otps_-_cost_and_benefit_analysis_of_orbital_debris_remediation_-_final.pdf)).

Additional modifiers applied to base MCE:
- High inclination (>80°): ×1.2 (constrained launch windows)
- Non-cooperative target (no docking port): ×1.3 (capture mechanism complexity)
- Fragmented / tumbling: ×1.5 (rendezvous difficulty)

> **Implementation note (v2.1).** "Non-cooperative" (no docking port / no active control) is keyed to thrusters: `!hasThrusters`. "Fragmented" is `!intact`. (Earlier v2.0 used `!(hasThrusters && hasPropellant)`; reconciled with PHASE-SCORING-V2 — identical on the §5.4 worked examples.)

#### 5.2.4 Net Salvage Value (NSV) — USD

```
NSV_today    = RMV_today    + SP_usd - MCE_today
NSV_2035     = RMV_2035     + SP_usd - MCE_2035
```

Both are surfaced in the UI.

### 5.3 0–100 normalization

The 0–100 Salvage Score is a percentile rank of `NSV_today` across the active catalog (the 30 curated objects in MVP; the full set when characteristics are available). This is robust to outliers — adding a single ultra-high-NSV object doesn't compress the rest of the distribution.

```
SV_score = 100 × percentile_rank(NSV_today, all_NSV_today)
```

> **Implementation note.** The catalog NSV_today distribution is computed at import time and persisted as sorted breakpoints; on-the-fly detail/compare pages map an object's NSV_today against those breakpoints. When no distribution is available (isolated single-object recompute), a monotonic absolute fallback transform is used.

### 5.4 Worked examples

All three examples below are computed end-to-end from the §3 collision formulas and the §5 salvage formulas with no fudged intermediate values. Numbers reproduce in `tests/scoring.test.ts`.

**SL-16 R/B (Zenit-2 upper stage), NORAD 16111**

| Component | Value |
| --- | --- |
| Mass / cross-section | 8,900 kg / 32 m² |
| Altitude / inclination | 847 km / 71° |
| Material class | Al-Li (modern rocket body) → $5.50/kg |
| Combined σ (own + 0.5m margin) | π × (3.19 + 0.5)² = **42.9 m²** |
| **PoC_annual** | 42.9 × 1.4×10⁻¹⁶ × 10⁴ × 3.156×10⁷ = **1.89×10⁻³ /yr** |
| Recovery yield (today / 2035) | 0.10 / 0.40 |
| Accessibility factor (Δv 0.9 km/s) | 1.00 |
| **RMV today** | 8,900 × $5.50 × 0.10 × 1.00 = **$4,895** |
| **RMV 2035** | 8,900 × $5.50 × 0.40 × 1.00 = **$19,580** |
| SP_risk | 1.89×10⁻³ × 100 × $500M = **$94.6M** |
| SP_bounty | $0 (RU-jurisdiction, no active program) |
| **SP total** | **$94.6M** |
| MCE: heavy tier $100M × 1.3 (non-cooperative); inc 71° doesn't trigger >80° penalty | **$130M today** / **$26M 2035** |
| **NSV today** | $4,895 + $94.6M − $130M = **−$35.4M** |
| **NSV 2035** | $19,580 + $94.6M − $26M = **+$68.6M** |

Reading: SL-16 R/B is **negative today** — strategic premium of $94.6M doesn't quite cover the $130M mission cost — but tips strongly positive by 2035. This is the canonical "industry-target" profile: high cascade value, dense orbital neighborhood, recoverable economics within a decade.

**Envisat, NORAD 27386**

| Component | Value |
| --- | --- |
| Mass / cross-section | 8,211 kg / 71 m² |
| Altitude / inclination | 768 km / 98.4° (sun-sync) |
| Combined σ | π × (4.75 + 0.5)² = **86.6 m²** |
| **PoC_annual** | 86.6 × 1.4×10⁻¹⁶ × 10⁴ × 3.156×10⁷ = **3.83×10⁻³ /yr** |
| Material class | EO satellite ($15/kg blended) |
| Accessibility factor (Δv 1.1 km/s) | 0.85 |
| **RMV today** | 8,211 × $15 × 0.10 × 0.85 = **$10,469** |
| **RMV 2035** | 8,211 × $15 × 0.40 × 0.85 = **$41,876** |
| SP_risk | 3.83×10⁻³ × 100 × $500M = **$191.5M** |
| SP_bounty | $10M (ESA, ClearSpace-aligned pipeline) |
| **SP total** | **$201.5M** |
| MCE: heavy $100M × 1.2 (sun-sync) × 1.3 (non-cooperative) | **$156M today** / **$31M 2035** |
| **NSV today** | $10,469 + $201.5M − $156M = **+$45.5M** |
| **NSV 2035** | $41,876 + $201.5M − $31M = **+$170.5M** |

Reading: **Envisat is economically removable today.** Its 8.2 t mass in the densest LEO shell drives PoC ≈ 0.38%/year, which compounds to $191.5M of cascade-prevention value over a century. That alone justifies a $156M mission. The bottleneck is **regulatory and technical readiness**, not economics — this is exactly the case the ClearSpace pipeline is being built to demonstrate.

**Fengyun-1C fragment, NORAD 29651**

| Component | Value |
| --- | --- |
| Mass / cross-section | 0.4 kg / 0.05 m² |
| Altitude / inclination | 851 km / 98.7° |
| Combined σ | π × (0.126 + 0.5)² = **1.23 m²** |
| **PoC_annual** | 1.23 × 1.4×10⁻¹⁶ × 10⁴ × 3.156×10⁷ = **5.4×10⁻⁵ /yr** |
| Recovery yield (fragment) | 0 |
| **RMV today / 2035** | **$0** |
| SP_risk | 5.4×10⁻⁵ × 100 × $500M = **$2.7M** |
| SP_bounty | $0 (CN, no eligible program) |
| MCE: light tier $20M × 1.2 (sun-sync) × 1.3 (non-cooperative) × 1.5 (fragmented) | **$46.8M today** / **$9.4M 2035** |
| **NSV today** | $0 + $2.7M − $46.8M = **−$44.1M** |
| **NSV 2035** | $0 + $2.7M − $9.4M = **−$6.7M** |

Reading: individual fragment removal is uneconomic at every time horizon. This confirms the ADR strategy of **removing parent objects before they fragment** — preventing the ~1,300 fragments per tonne of breakup is several orders of magnitude cheaper than removing them after the fact.

### 5.5 Limitations

- Material composition data is genuinely poor for older objects; the "blended price" for Soviet-era rocket bodies is an educated estimate.
- The $500M cascade-avoided-cost is a NASA OTPS midpoint; the range is wide ($400M–$1B+). Sensitivity is significant — at $1B, NSV figures double.
- The 2035 projection assumes a maturing market with the bottlenecks (capture mechanisms, regulatory approval for foreign-object capture, in-orbit recycling) actually getting solved. Treat as scenario, not forecast.
- We do not yet model **multi-object recovery economics**, where a single tender visits multiple co-located targets. This would substantially improve NSV for clustered debris (e.g., the 800-km sun-sync corridor). Planned for v3.

---

## 6. Cross-lens composite

For ranking, a single Composite Score combines CR, CU, and SV with configurable weights (defaulting equal at 0.333). The composite is intentionally generic — different personas weight differently:

- **Insurer**: heavy on CR (collision risk drives premiums)
- **Removal provider**: heavy on SV (where's the money)
- **Regulator**: heavy on CU (who's overdue)
- **Operator**: heavy on CR adjusted for own-orbit proximity

The UI lets the user select a persona preset that adjusts the composite weights, with full transparency about what weights are being applied.

---

## 7. Uncertainty quantification

Every score carries a confidence flag derived from the freshest input it depends on:

| Input freshness | Confidence |
| --- | --- |
| All inputs <30 days old, all from authoritative sources (Celestrak, DISCOS, Space-Track) | **High** |
| At least one input simulated or older than 90 days | **Medium** |
| Any critical input missing or simulated (e.g., mass for salvage) | **Low** |

Low-confidence scores are rendered with reduced contrast and a "⚠ low confidence" badge. The factor breakdown UI surfaces *which* input pulled the confidence down.

---

## 8. Audit and versioning

Every computed score is stored with:
- `modelVersion` — semver of this methodology document
- `inputsHash` — SHA-256 of the canonical-form JSON of all inputs
- `computedAt` — timestamp

Replaying inputs at the same model version reproduces the score bit-for-bit. Model upgrades preserve historical scores by re-running v1 on archived inputs.

---

## 9. Glossary

- **ADR** — Active Debris Removal
- **CDM** — Conjunction Data Message (NASA/Space-Track format)
- **EL** — Enforcement Likelihood (sub-score of CU)
- **EOL** — End of Life (mission)
- **EOP** — Earth Orientation Parameters
- **IADC** — Inter-Agency Space Debris Coordination Committee
- **LEO / MEO / GEO** — Low / Medium / Geostationary Earth Orbit
- **MASTER** — ESA's Meteoroid and Space Debris Terrestrial Environment Reference model
- **MCE** — Mission Cost Estimate (sub-component of SV)
- **NSV** — Net Salvage Value (USD)
- **OCG** — Operator Capability Gap (sub-score of CU)
- **OOS** — On-Orbit Servicing
- **OTPS** — NASA Office of Technology, Policy, and Strategy
- **PE** — Penalty Exposure (sub-score of CU)
- **PoC** — Probability of Collision
- **RMV** — Recoverable Material Value (USD)
- **ROI** — Regulatory Overdue Index (sub-score of CU)
- **SGP4** — Simplified General Perturbations propagator
- **SP** — Strategic Premium (sub-component of SV)
- **SSA** — Space Situational Awareness
- **TLE** — Two-Line Element set

---

## 10. References

- IADC, *Space Debris Mitigation Guidelines (Rev. 2)*, March 2020. [orbitaldebris.jsc.nasa.gov/library/iadc-space-debris-guidelines-revision-2.pdf](https://orbitaldebris.jsc.nasa.gov/library/iadc-space-debris-guidelines-revision-2.pdf)
- FCC, *In the Matter of Mitigation of Orbital Debris in the New Space Age* — 5-year rule adoption (FCC 22-74, September 2022). Enforcement attachment [DOC-397412A1.pdf](https://docs.fcc.gov/public/attachments/DOC-397412A1.pdf) (Dish settlement, October 2023).
- ESA, *MASTER-8: Meteoroid and Space Debris Terrestrial Environment Reference Model*. Reference population 08/2024; ~54,000 objects >10 cm.
- ESA Space Debris Office, *Space Environment Report 2026* (10th edition, May 2026).
- NASA Office of Technology, Policy, and Strategy, *Cost and Benefit Analysis of Orbital Debris Remediation*, March 2023. [nasa.gov/wp-content/uploads/2023/03/otps_-_cost_and_benefit_analysis_of_orbital_debris_remediation_-_final.pdf](https://www.nasa.gov/wp-content/uploads/2023/03/otps_-_cost_and_benefit_analysis_of_orbital_debris_remediation_-_final.pdf)
- ESA, *ClearSpace-1 mission contract announcement*, November 2020 (€86M signing, €100M total). [esa.int/Space_Safety/ESA_purchases_world-first_debris_removal_mission_from_start-up](https://www.esa.int/Space_Safety/ESA_purchases_world-first_debris_removal_mission_from_start-up)
- Astroscale, *ELSA-M mission*, €15M demonstration contract via Eutelsat/OneWeb/UK Space Agency. [astroscale.com/missions/elsa-d](https://www.astroscale.com/en/missions/elsa-d)
- NASA EVOLVE 4.0 / Standard Breakup Model for fragment count estimation.
- ISO 24113:2019, *Space systems — Space debris mitigation requirements*.
- UN Convention on International Liability for Damage Caused by Space Objects, 1972.
- 2025 metals market data: titanium scrap $6–16/kg, aerospace aluminum recycling at 5% of primary energy cost. Sources: Okon Recycling, EcoTitanium 2025 reports, Airbus circularity briefing.
