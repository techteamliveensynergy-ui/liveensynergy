const STATS = [
  { value: "3-sided", label: "Marketplace model" },
  { value: "Every response", label: "Quality-checked before rewards" },
  { value: "QR check-in", label: "Verified attendance" },
  { value: "End to end", label: "Campaigns run by our team" },
];

export function Stats() {
  return (
    <section className="border-y border-black/10 bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-5 py-14 md:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <div className="font-display text-2xl font-semibold text-[var(--color-brand-dark)] md:text-3xl">
              {s.value}
            </div>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
