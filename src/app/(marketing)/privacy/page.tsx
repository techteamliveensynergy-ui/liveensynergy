import { LegalTabs } from "@/components/LegalTabs";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div className="bg-[var(--color-sage)]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <LegalTabs active="/privacy" />
        <p className="mt-6 font-serif text-[var(--color-olive-deep)]">
          Last updated · 16 October 2026
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Privacy Policy
        </h1>

        <article className="mt-8 space-y-6 rounded-2xl bg-white p-7 text-sm leading-relaxed text-[var(--color-ink)]/85">
          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
              Data we collect
            </h2>
            <p className="mt-2">
              We collect the information you provide during sign-up and
              onboarding (such as your name, contact details and profile
              information) and data needed to verify event attendance and
              release rewards.
            </p>
          </section>
          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
              How we use it
            </h2>
            <p className="mt-2">
              Your data is used to operate the platform — matching sponsors
              with artists and events, verifying attendance, and processing
              rewards. Sensitive details are never shared without your
              consent.
            </p>
          </section>
          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
              Surveys and analysis
            </h2>
            <p className="mt-2">
              When you answer a sponsored event&apos;s survey, the brand behind it sees totals and charts only —
              never your name, contact details or your individual answers. To write up the results, our team may
              use OpenAI&apos;s service to summarise them. Before anything is sent, names, email addresses,
              phone numbers and other identifying columns are removed; OpenAI receives the worked-out figures
              and a sample of written answers, and does not use them to train its models.
            </p>
          </section>
          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
              Services we use
            </h2>
            <p className="mt-2">
              We rely on a small number of providers to run the platform, each handling only what it needs:
              Supabase (secure database and sign-in), Vercel (hosting), Resend (sending our emails), Stripe
              (brand invoices and payments), Cloudflare Turnstile (protecting surveys from bots) and OpenAI
              (survey write-ups, as above). We don&apos;t sell your data.
            </p>
          </section>
          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
              Cookies
            </h2>
            <p className="mt-2">
              We only use cookies the platform needs to work — to keep you signed in and to keep surveys free of
              bots — and no analytics or advertising cookies. Our{" "}
              <a href="/cookies" className="font-semibold text-[var(--color-brand-dark)] underline">
                Cookie Policy
              </a>{" "}
              lists each one.
            </p>
          </section>
          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">
              Your rights
            </h2>
            <p className="mt-2">
              You can access, correct or delete your personal data at any time
              from your profile, or by contacting our team.
            </p>
          </section>
          <p className="text-[var(--color-ink-soft)]">
            …full copy to be finalised before launch.
          </p>
        </article>
      </div>
    </div>
  );
}
