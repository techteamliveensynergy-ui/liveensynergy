export const metadata = { title: "Terms & Conditions" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16">
      <span className="chip">Legal</span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
        Terms &amp; Conditions
      </h1>
      <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
        This is placeholder content for the MVP. Replace with your finalised
        legal terms before launch.
      </p>
      <div className="mt-8 space-y-6 text-sm text-[var(--color-ink-soft)]">
        <section>
          <h2 className="text-base font-semibold text-[var(--color-ink)]">
            1. Overview
          </h2>
          <p className="mt-2">
            Live-En-Synergy provides a platform connecting brands, artists,
            event organisers and audiences for performance-based event
            sponsorship. By using the platform you agree to these terms.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-[var(--color-ink)]">
            2. Platform fees
          </h2>
          <p className="mt-2">
            Live-En-Synergy charges a minimum of £315 + VAT or 9% + VAT of the
            sponsorship budget, whichever is higher. Fees are deducted from the
            sponsorship budget provided by the brand.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-[var(--color-ink)]">
            3. Rewards &amp; verification
          </h2>
          <p className="mt-2">
            Rewards are released to audience members subject to the reward rules
            of each event and successful attendance verification.
          </p>
        </section>
      </div>
    </article>
  );
}
