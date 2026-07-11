export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-5 py-16">
      <span className="chip">Legal</span>
      <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
        Privacy Policy
      </h1>
      <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
        This is placeholder content for the MVP. Replace with your finalised
        privacy policy before launch.
      </p>
      <div className="mt-8 space-y-6 text-sm text-[var(--color-ink-soft)]">
        <section>
          <h2 className="text-base font-semibold text-[var(--color-ink)]">
            Data we collect
          </h2>
          <p className="mt-2">
            We collect the information you provide during sign-up and onboarding
            (such as your name, contact details and profile information) and data
            needed to verify event attendance and release rewards.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-[var(--color-ink)]">
            How we use it
          </h2>
          <p className="mt-2">
            Your data is used to operate the platform — matching sponsors with
            artists and events, verifying attendance, and processing rewards.
            Sensitive details are never shared without your consent.
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-[var(--color-ink)]">
            Your rights
          </h2>
          <p className="mt-2">
            You can access, correct or delete your personal data at any time from
            your profile, or by contacting our team.
          </p>
        </section>
      </div>
    </article>
  );
}
