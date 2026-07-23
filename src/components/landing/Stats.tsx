const STATS = [
  { value: "3-sided", label: "Marketplace model" },
  { value: "Verified", label: "Two-step attendance" },
  { value: "9% + VAT", label: "Flat platform fee" },
  { value: "£0", label: "Minimum sponsorship budget" },
];

export function Stats() {
  return (
    <section className="border-y border-black/5 bg-white">
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
