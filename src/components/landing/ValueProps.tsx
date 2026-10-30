// New-model copy (#37), from the Brand Portal and Packages Details briefs in
// docs/New-model. Needs Sakshi's sign-off before it goes live.
const CARDS = [
  {
    eyebrow: "For brands",
    title: "Real audiences, real answers.",
    body: "Choose a campaign package and tell us who you want to reach. We put your brand in front of live-event audiences and come back with research, insights and a performance report.",
    bg: "bg-[var(--color-gold)]",
  },
  {
    eyebrow: "For artists & organisers",
    title: "Partnership for your events.",
    body: "List your upcoming events. When a brand campaign fits, we match it to you: you deliver the agreed branding, like social mentions and onsite presence, and get paid for it.",
    bg: "bg-[var(--color-lavender)]",
  },
  {
    eyebrow: "For audiences",
    title: "Share your view, get a reward.",
    body: "Go to events you'd love anyway and answer the partner's short survey. Once your response passes our quality check, you get a discount code.",
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
