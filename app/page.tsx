function OrbitRingPlaceholder() {
  return (
    <svg
      viewBox="0 0 240 240"
      className="h-56 w-56 text-border"
      fill="none"
      aria-hidden="true"
    >
      {/* Static orbital shells */}
      <ellipse cx="120" cy="120" rx="100" ry="42" stroke="currentColor" strokeWidth="1" />
      <ellipse
        cx="120"
        cy="120"
        rx="100"
        ry="42"
        stroke="currentColor"
        strokeWidth="1"
        transform="rotate(60 120 120)"
      />
      <ellipse
        cx="120"
        cy="120"
        rx="100"
        ry="42"
        stroke="currentColor"
        strokeWidth="1"
        transform="rotate(120 120 120)"
      />
      {/* Central body */}
      <circle cx="120" cy="120" r="10" fill="#ffe11f" />
      <circle cx="120" cy="120" r="18" stroke="#b89c14" strokeWidth="1" />
      {/* Orbiting satellite */}
      <g className="animate-orbit">
        <circle cx="220" cy="120" r="3.5" fill="#ffffff" />
      </g>
    </svg>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-8 py-5">
        <h1 className="text-xl font-semibold tracking-tight">Catalogue</h1>
        <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted">
          Collision risk · Compliance urgency · Salvage value
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-16 text-center">
        <OrbitRingPlaceholder />
        <div>
          <p className="font-mono text-sm uppercase tracking-widest text-muted">
            Catalogue table arrives in Phase 5
          </p>
          <p className="mt-2 max-w-md text-sm text-muted">
            30 tracked objects, scored across three analytical lenses with
            transparent factor breakdowns.
          </p>
        </div>
      </div>
    </div>
  );
}
