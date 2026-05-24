export default function AboutPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-8 py-5">
        <h1 className="text-xl font-semibold tracking-tight">About</h1>
        <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted">
          Orbit Reclaim · decision support
        </p>
      </div>
      <div className="px-8 py-8">
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Orbit Reclaim sits between public tracking catalogues and the
          organizations that need to act on debris — satellite operators,
          debris-removal providers, insurers, and space agencies. Every tracked
          object is scored across collision risk, compliance urgency, and
          salvage value, each with a transparent factor breakdown.
        </p>
      </div>
    </div>
  );
}
