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

const PARTIES = [
  {
    title: "Brands",
    emoji: "🎯",
    body: "Gain measurable engagement and verified outcomes — real people, at real events, remembering your name.",
  },
  {
    title: "Artists & Organisers",
    emoji: "🎤",
    body: "Secure sponsorship funding and stronger, confirmed attendance so events don't get cancelled at the last minute.",
  },
  {
    title: "Audiences",
    emoji: "🎟️",
    body: "Get tangible value — ticket reimbursements and sponsor-funded rewards — for showing up to the events you love.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-20">
      <div className="max-w-2xl">
        <span className="chip">How it works</span>
        <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
          A performance-based sponsorship ecosystem
        </h2>
        <p className="mt-4 text-lg text-[var(--color-ink-soft)]">
          Instead of sponsorship flowing straight from brand to artist, we bring
          the audience into the loop — so every pound spent drives real,
          verifiable engagement.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.n} className="card p-6">
            <div className="text-sm font-bold text-[var(--color-brand)]">
              {step.n}
            </div>
            <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              {step.body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-16 grid gap-6 md:grid-cols-3">
        {PARTIES.map((p) => (
          <div
            key={p.title}
            className="rounded-2xl border border-black/5 bg-[var(--color-mist)] p-6"
          >
            <div className="text-3xl" aria-hidden>
              {p.emoji}
            </div>
            <h3 className="mt-3 text-lg font-semibold">{p.title}</h3>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              {p.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
