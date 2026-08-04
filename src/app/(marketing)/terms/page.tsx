import { LegalTabs } from "@/components/LegalTabs";
import { ALL_PARTY_TERMS } from "@/lib/terms";

export const metadata = { title: "Terms & Conditions" };

export default function TermsPage() {
  return (
    <div className="bg-[var(--color-sage)]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <LegalTabs active="/terms" />
        <p className="mt-6 font-serif text-[var(--color-olive-deep)]">
          Last updated · 12 July 2026
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Terms &amp; Conditions
        </h1>

        <article className="mt-8 space-y-6 rounded-2xl bg-white p-7 text-sm leading-relaxed text-[var(--color-ink)]/85">
          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
              1. Introduction
            </h2>
            <p className="mt-2">
              These terms govern your use of the Live·En·Synergy platform as a
              Brand, Artist, Event Organiser, or Audience Member. By creating
              an account you agree to these terms.
            </p>
          </section>
          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
              2. Roles &amp; responsibilities
            </h2>
            <p className="mt-2">
              Each participant agrees to the responsibilities of their role,
              including honouring committed sponsorship budgets and reward
              rules, and providing accurate information for attendance
              verification.
            </p>
          </section>
          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
              3. Platform fees
            </h2>
            <p className="mt-2">
              Live·En·Synergy charges a minimum of £315 + VAT or 9% + VAT of the
              sponsorship budget, whichever is higher. Fees are deducted from
              the sponsorship budget provided by the brand.
            </p>
          </section>
          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
              4. Rewards &amp; verification
            </h2>
            <p className="mt-2">
              Rewards are released to audience members subject to the reward
              rules of each event and successful attendance verification.
            </p>
          </section>

          {/* Per-party terms. Each is agreed to individually at sign-up, and
              the sign-up checkbox links straight to the matching anchor —
              both read the same source (src/lib/terms.ts). */}
          {ALL_PARTY_TERMS.map((t, i) => (
            <section key={t.key} id={t.key} className="scroll-mt-24">
              <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
                {5 + i}. Terms for {t.party}
              </h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5">
                {t.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </section>
          ))}

          <p className="text-[var(--color-ink-soft)]">
            …full copy to be finalised before launch.
          </p>
        </article>
      </div>
    </div>
  );
}
