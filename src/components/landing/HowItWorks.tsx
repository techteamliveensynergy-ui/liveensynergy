const STEPS = [
  {
    n: "01",
    title: "Brands set a campaign",
    body: "A brand creates a sponsorship campaign — budget, target audience and reward rules (e.g. first 20 sign-ups). Our team matches it to a fitting artist or event.",
  },
  {
    n: "02",
    title: "Artists list their events",
    body: "Artists and organisers list upcoming events open for sponsorship, and describe the branding value they can offer in return.",
  },
  {
    n: "03",
    title: "Audiences show up",
    body: "Fans register, buy their ticket and attend. Once attendance is verified, the sponsor-funded reward — like a ticket reimbursement — is released.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-20">
      <div className="max-w-2xl">
        <span className="chip">How it works</span>
        <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          A performance-based sponsorship ecosystem
        </h2>
        <p className="mt-4 text-lg text-[var(--color-ink-soft)]">
          Instead of sponsorship flowing straight from brand to artist, we bring
          the audience into the loop — so every pound spent drives real,
          verifiable engagement.
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
