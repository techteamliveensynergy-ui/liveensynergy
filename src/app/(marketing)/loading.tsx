/**
 * Shown the moment a public-site link is clicked, while the next page's
 * data loads. Without it a click on a data-backed page (home, /brands,
 * /events) shows nothing until the server answers, which on a slow
 * Supabase response reads as a dead link. Header and footer stay put —
 * this replaces only the page body.
 */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-[1200px] px-5 py-24 md:px-10">
      <span className="sr-only">Loading…</span>
      <div aria-hidden className="animate-pulse space-y-6">
        <div className="h-3 w-40 rounded bg-[var(--color-les-line)]" />
        <div className="h-16 w-3/4 rounded-lg bg-[var(--color-les-panel)]" />
        <div className="h-16 w-1/2 rounded-lg bg-[var(--color-les-panel)]" />
        <div className="h-4 w-2/3 rounded bg-[var(--color-les-line)]" />
        <div className="grid gap-6 pt-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-48 rounded-2xl border border-[var(--color-les-line)] bg-[var(--color-les-panel)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
