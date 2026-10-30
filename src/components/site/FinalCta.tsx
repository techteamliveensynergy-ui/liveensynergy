import Link from "next/link";

/** Shared closing band — also on the home page. */
export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-[var(--color-les-lime)] px-5 py-28 md:px-10">
      <p
        aria-hidden
        className="les-poster pointer-events-none absolute bottom-0 right-0 select-none text-[var(--color-les-ink)]/5"
        style={{ fontSize: "clamp(80px, 18vw, 260px)", lineHeight: 0.85 }}
      >
        LES
      </p>
      <div className="relative z-10 mx-auto max-w-[1200px]">
        <p className="mb-8 text-[11px] uppercase tracking-[0.18em] text-[var(--color-les-ink)]">
          Brands · Artists & organisers · Audiences
        </p>
        <h2 className="les-poster mb-10 text-[var(--color-les-ink)]" style={{ fontSize: "clamp(56px, 10vw, 120px)" }}>
          Be part of
          <br />
          the synergy.
        </h2>
        <p className="mb-10 max-w-[600px] text-lg leading-relaxed text-[var(--color-les-ink)]">
          Build a campaign, become an event partner, or take part in a campaign to share your views and get a ticket
          discount.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href="/auth/sign-up?role=brand" className="btn btn-dark h-[52px] px-8">
            Build a campaign →
          </Link>
          <Link
            href="/auth/sign-up?role=artist"
            className="btn h-[52px] border-2 border-[var(--color-les-ink)] px-8 text-[var(--color-les-ink)] hover:bg-[var(--color-les-ink)]/10"
          >
            Become an event partner →
          </Link>
          <Link
            href="/events"
            className="btn h-[52px] border-2 border-[var(--color-les-ink)] px-8 text-[var(--color-les-ink)] hover:bg-[var(--color-les-ink)]/10"
          >
            Explore campaigns →
          </Link>
        </div>
      </div>
    </section>
  );
}
