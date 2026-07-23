import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-mist)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 top-10 h-56 w-56 rounded-full bg-[var(--color-brand-soft)]/25 md:h-72 md:w-72"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[58%] -bottom-16 h-44 w-44 rounded-full bg-[var(--color-purple)]/25"
      />
      <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 md:pb-24 md:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="chip mx-auto">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-[var(--color-olive)]"
            />
            A sponsorship marketplace for live events
          </span>
          <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight text-[var(--color-ink)] md:text-6xl">
            Where <span className="font-serif font-normal text-[var(--color-brand)]">brands</span>, artists &amp;
            audiences <span className="font-serif font-normal">meet</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-ink-soft)]">
            Fund the shows you love, fill the seats you sell, and get rewarded
            for showing up — a sponsorship engine that pays everyone back with
            proof.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/auth/sign-up?role=brand" className="btn btn-primary">
              Join as Brand →
            </Link>
            <Link href="/auth/sign-up?role=artist" className="btn btn-ghost">
              Join as Artist / Organiser
            </Link>
            <Link
              href="/events"
              className="text-sm font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-dark)]"
            >
              Explore sponsored events →
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-8 sm:grid-cols-3">
          {[
            { k: "3-way", v: "value exchange" },
            { k: "Verified", v: "attendance & outcomes" },
            { k: "£0", v: "minimum budget" },
          ].map((s) => (
            <div key={s.k} className="text-center">
              <div className="font-display text-3xl font-semibold text-[var(--color-ink)]">
                {s.k}
              </div>
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{s.v}</p>
            </div>
          ))}
        </div>

        <div className="relative mx-auto mt-16 max-w-3xl">
          <div className="card space-y-4 p-6">
            <div className="flex items-center justify-between">
              <span className="chip">Summer Beats Festival</span>
              <span className="text-xs font-semibold text-[var(--color-brand-dark)]">
                Available for sponsorship
              </span>
            </div>
            <div className="grid h-32 place-items-center rounded-xl bg-[var(--color-lavender)] font-serif text-[var(--color-purple-deep)]">
              event image
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-[var(--color-ink)]">
                  Reward rule
                </p>
                <p className="text-sm text-[var(--color-ink-soft)]">
                  First 50 sign-ups get a full ticket refund.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm sm:block sm:text-right">
                <span className="text-[var(--color-ink-soft)]">Sponsor budget</span>
                <span className="font-semibold text-[var(--color-ink)]">
                  £5,000 – £10,000
                </span>
              </div>
            </div>
          </div>
          <div className="card absolute -bottom-6 -left-6 hidden w-48 p-4 text-sm md:block">
            <p className="font-semibold text-[var(--color-olive-deep)]">
              Attendance verified ✓
            </p>
            <p className="text-[var(--color-ink-soft)]">Reward released</p>
          </div>
        </div>
      </div>
    </section>
  );
}
