export const metadata = { title: "About us" };

export default function AboutPage() {
  return (
    <article className="bg-[var(--color-mist)]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <span className="chip">Our story</span>
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-5xl">
          Sponsorship, <span className="font-serif font-normal">re-imagined</span>.
        </h1>
        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-[var(--color-ink-soft)] md:text-base">
          <p>
            Live·En·Synergy was born from a simple frustration: sponsorship
            rarely reaches the audience. Traditional sponsorship flows straight
            from a brand to an artist or event — the people actually showing up
            never see a penny of it.
          </p>
          <p>
            We rebuilt it as a three-sided marketplace so brands can fund what
            matters, artists fill the room, and audiences get real value for
            showing up. Brands gain measurable engagement and verified
            outcomes. Artists and organisers gain sponsorship funding and
            stronger, confirmed attendance. Audiences receive tangible value —
            from ticket reimbursements to exclusive sponsor-funded rewards.
          </p>
          <p>
            By turning sponsorship into a performance-based engagement model,
            we create a more transparent, accountable and effective ecosystem
            for live events — so promising events don&apos;t get cancelled at
            the last minute, and every pound of sponsorship drives real
            engagement.
          </p>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-black/5 bg-white p-5">
            <p className="font-display text-xl font-semibold text-[var(--color-brand-dark)]">
              3-sided
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              Marketplace model
            </p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white p-5">
            <p className="font-display text-xl font-semibold text-[var(--color-purple-deep)]">
              Verified
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              Two-step attendance
            </p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white p-5">
            <p className="font-display text-xl font-semibold text-[var(--color-olive-deep)]">
              Transparent
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              Flat pricing
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-black/5 bg-white">
        <div className="mx-auto grid max-w-5xl gap-4 px-5 py-16 sm:grid-cols-3">
          {[
            {
              k: "Brands",
              v: "Measurable engagement & verified outcomes",
              tint: "bg-[var(--color-gold)]",
            },
            {
              k: "Artists",
              v: "Funding & confirmed attendance",
              tint: "bg-[var(--color-lavender)]",
            },
            {
              k: "Audiences",
              v: "Rewards & reimbursed tickets",
              tint: "bg-[var(--color-sage)]",
            },
          ].map((x) => (
            <div key={x.k} className={`rounded-2xl p-6 ${x.tint}`}>
              <p className="font-display font-semibold text-[var(--color-ink)]">
                {x.k}
              </p>
              <p className="mt-1 text-sm text-[var(--color-ink)]/75">{x.v}</p>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
