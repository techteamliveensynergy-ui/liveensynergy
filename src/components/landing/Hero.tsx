import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1200px 500px at 80% -10%, rgba(109,59,245,0.18), transparent), radial-gradient(900px 400px at 0% 10%, rgba(255,92,138,0.12), transparent)",
        }}
      />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 md:grid-cols-2 md:py-24">
        <div>
          <span className="chip">Sponsorship, reimagined</span>
          <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
            Where brands, artists and audiences{" "}
            <span className="text-[var(--color-brand)]">all win.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-[var(--color-ink-soft)]">
            Live-En-Synergy turns sponsorship into a performance-based
            engagement model. Brands fund real attendance, artists get confirmed
            audiences, and fans get their tickets reimbursed.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/auth/sign-up" className="btn btn-primary">
              Get started — it&apos;s free
            </Link>
            <Link href="/#how-it-works" className="btn btn-ghost">
              See how it works
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-6 text-sm text-[var(--color-ink-soft)]">
            <div>
              <div className="text-2xl font-bold text-[var(--color-ink)]">
                3-way
              </div>
              value exchange
            </div>
            <div>
              <div className="text-2xl font-bold text-[var(--color-ink)]">
                Verified
              </div>
              attendance &amp; outcomes
            </div>
            <div>
              <div className="text-2xl font-bold text-[var(--color-ink)]">
                £0
              </div>
              minimum budget
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="card space-y-4 p-6">
            <div className="flex items-center justify-between">
              <span className="chip">Summer Beats Festival</span>
              <span className="text-xs font-semibold text-[var(--color-brand)]">
                Available for sponsorship
              </span>
            </div>
            <div className="h-32 rounded-xl bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-accent)]" />
            <div>
              <p className="text-sm font-semibold">Reward rule</p>
              <p className="text-sm text-[var(--color-ink-soft)]">
                First 50 sign-ups get a full ticket refund.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm">
              <span>Sponsor budget</span>
              <span className="font-semibold">£5,000 – £10,000</span>
            </div>
          </div>
          <div className="card absolute -bottom-6 -left-6 hidden w-44 p-4 text-sm shadow-lg md:block">
            <p className="font-semibold text-[var(--color-brand)]">
              Attendance verified ✓
            </p>
            <p className="text-[var(--color-ink-soft)]">Reward released</p>
          </div>
        </div>
      </div>
    </section>
  );
}
