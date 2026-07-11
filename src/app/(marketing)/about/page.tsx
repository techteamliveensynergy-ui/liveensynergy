export const metadata = { title: "About us" };

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16">
      <span className="chip">About us</span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
        Creating a better sponsorship ecosystem
      </h1>
      <div className="mt-6 space-y-4 text-[var(--color-ink-soft)]">
        <p>
          Traditional sponsorship flows straight from a brand to an artist or
          event. Live-En-Synergy brings a third party into that relationship —
          the audience — and aligns the interests of everyone involved.
        </p>
        <p>
          Brands gain measurable engagement and verified outcomes. Artists and
          organisers gain sponsorship funding and stronger, confirmed
          attendance. Audiences receive tangible value and enhanced experiences,
          from ticket reimbursements to exclusive sponsor-funded rewards.
        </p>
        <p>
          By transforming sponsorship into a performance-based engagement model,
          we create a more transparent, accountable and effective ecosystem for
          live events — so promising events don&apos;t get cancelled at the last
          minute, and every pound of sponsorship drives real engagement.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          { k: "Brands", v: "Measurable engagement & verified outcomes" },
          { k: "Artists", v: "Funding & confirmed attendance" },
          { k: "Audiences", v: "Rewards & reimbursed tickets" },
        ].map((x) => (
          <div key={x.k} className="rounded-2xl bg-[var(--color-mist)] p-5">
            <p className="font-semibold">{x.k}</p>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{x.v}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
