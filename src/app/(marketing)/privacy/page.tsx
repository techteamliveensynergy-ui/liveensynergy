import { LegalTabs } from "@/components/LegalTabs";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div>
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <LegalTabs active="/privacy" />
        <p className="les-eyebrow mt-6">
          Last updated · 23 November 2026
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Privacy Policy
        </h1>

        <article className="mt-8 space-y-6 rounded-2xl border border-[var(--color-les-line)] bg-[var(--color-les-panel)] p-7 text-sm leading-relaxed text-[var(--color-ink)]/85">
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
              Checking in at an event
            </h2>
            <p className="mt-2">
              When you tap &ldquo;Check in&rdquo; at an event, your phone shares its location with us once, only
              then, and only if you allow it — to confirm you&apos;re near the venue on the day. We store how far
              you were from the venue and, for 90 days, your location rounded to about 100 metres, so our team can
              review a check-in if something looks wrong; after 90 days the location is deleted. The brand and
              the artist never see it. You can always check in by scanning the QR code at the venue instead, which
              doesn&apos;t use your location.
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
              (brand invoices and payments), Cloudflare Turnstile (protecting surveys from bots), OpenAI
              (survey write-ups, as above), Google Maps Platform (finding an event&apos;s venue when artists
              and our team set it up — no attendee data is sent) and OpenStreetMap (venue map previews for
              artists and our team). We don&apos;t sell your data.
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
