import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 py-24 text-center">
      <p className="font-mono text-6xl font-semibold tracking-tight text-gold">
        404
      </p>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Object not in catalogue
        </h1>
        <p className="mt-2 max-w-sm font-mono text-xs uppercase tracking-wider text-muted">
          This orbit is empty — the requested object or page could not be found.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-sm border border-gold bg-gold/10 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-gold transition-colors hover:bg-gold/20"
      >
        ← Return to catalogue
      </Link>
    </div>
  );
}
