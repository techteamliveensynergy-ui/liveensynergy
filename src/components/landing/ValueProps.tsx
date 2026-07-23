const CARDS = [
  {
    eyebrow: "For brands",
    title: "Measurable engagement, verified outcomes.",
    body: "Set your budget and reward rules. Only pay for attendance you can prove — no wasted spend on empty seats.",
    bg: "bg-[var(--color-gold)]",
  },
  {
    eyebrow: "For artists",
    title: "Funding & guaranteed seats.",
    body: "List an open event, get matched with a brand, and confirm the room before the doors open.",
    bg: "bg-[var(--color-lavender)]",
  },
  {
    eyebrow: "For audience",
    title: "Show up, get rewarded.",
    body: "Ticket reimbursements and sponsor-funded perks for verified attendance at events you'd love anyway.",
    bg: "bg-[var(--color-sage)]",
  },
];

export function ValueProps() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20">
      <div className="max-w-2xl">
        <p className="font-serif text-[var(--color-ink-soft)]">
          Three sides, one synergy
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Everyone in the loop wins something real
        </h2>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {CARDS.map((c) => (
          <div
            key={c.eyebrow}
            className={`flex min-h-[240px] flex-col rounded-2xl p-7 ${c.bg}`}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-soft)]">
              {c.eyebrow}
            </span>
            <h3 className="mt-3 font-display text-2xl font-semibold leading-tight text-[var(--color-ink)]">
              {c.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink)]/80">
              {c.body}
            </p>
            <div className="mt-auto flex justify-end pt-5">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-white text-lg">
                →
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
