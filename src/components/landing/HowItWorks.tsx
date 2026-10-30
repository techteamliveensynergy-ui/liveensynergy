const STEPS = [
  {
    n: "01",
    title: "A brand chooses a package",
    body: "The brand picks a campaign package and tells us its objective, target audience, location and what it wants to learn. Our team sets up the campaign and its research survey.",
  },
  {
    n: "02",
    title: "We match it to live events",
    body: "We select suitable artists' and organisers' events and audiences. The artist delivers the agreed branding, such as social media mentions and onsite presence.",
  },
  {
    n: "03",
    title: "Audiences take part",
    body: "Ticket holders answer the partner's survey and check in at the venue. Responses that pass our quality check earn a discount code, and the brand gets the insights.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-20">
      <div className="max-w-2xl">
        <span className="chip">How it works</span>
        <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Partnership that comes back with answers
        </h2>
        <p className="mt-4 text-lg text-[var(--color-ink-soft)]">
          Instead of a logo on a poster, a partner gets a conversation with the
          audience: verified participants, quality-checked research and a
          campaign report at the end.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <div key={step.n} className="relative card p-6">
            <div className="font-display text-sm font-bold text-[var(--color-brand)]">
              {step.n}
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold text-[var(--color-ink)]">
              {step.title}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              {step.body}
            </p>
            {i < STEPS.length - 1 && (
              <div
                aria-hidden
                className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-lg text-[var(--color-ink-soft)]/40 md:block"
              >
                →
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
