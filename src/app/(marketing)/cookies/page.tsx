import Link from "next/link";
import { LegalTabs } from "@/components/LegalTabs";

export const metadata = { title: "Cookie Policy" };

/**
 * Cookie policy (GitHub #47), written from an audit of what the site
 * actually sets. Everything listed is strictly necessary, so under UK PECR
 * no consent banner is needed. Adding analytics or advertising later (even
 * Vercel Analytics) changes that: it would need a consent banner that
 * blocks it until accepted, and a row here.
 *
 * Lifetimes Supabase controls are described, not counted in days.
 */
const COOKIES: { name: string; provider: string; purpose: string; lasts: string }[] = [
  {
    name: "sb-…-auth-token",
    provider: "Live·En·Synergy (Supabase)",
    purpose: "Keeps you signed in as you move between pages. May be split into numbered parts (…-auth-token.0, .1).",
    lasts: "Until you sign out, or your session expires",
  },
  {
    name: "les-seen",
    provider: "Live·En·Synergy",
    purpose: "Remembers that we've recently noted you as active, so we record it at most every few minutes.",
    lasts: "5 minutes",
  },
  {
    name: "Cloudflare Turnstile",
    provider: "Cloudflare",
    purpose:
      "On survey pages only: checks you're a person, not a bot, so discount codes go to real participants. Cloudflare may set a cookie for this check.",
    lasts: "Set by Cloudflare for the check",
  },
];

export default function CookiesPage() {
  return (
    <div className="bg-[var(--color-sage)]">
      <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
        <LegalTabs active="/cookies" />
        <p className="mt-6 font-serif text-[var(--color-olive-deep)]">Last updated · 28 October 2026</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          Cookie Policy
        </h1>

        <article className="mt-8 space-y-6 rounded-2xl bg-white p-7 text-sm leading-relaxed text-[var(--color-ink)]/85">
          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">What cookies are</h2>
            <p className="mt-2">
              Cookies are small files a website stores in your browser. Some are needed for a site to work at all;
              others track you for analytics or advertising.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">The short version</h2>
            <p className="mt-2">
              We only use cookies the platform needs to work — to keep you signed in and to keep surveys free of
              bots. We don&apos;t use analytics or advertising cookies, and we don&apos;t sell or share what you do
              here with advertisers. Because every cookie we set is strictly necessary, we don&apos;t ask for
              consent with a banner.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Cookies we use</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-black/10 text-[var(--color-ink)]">
                    <th className="py-2 pr-3 font-semibold">Cookie</th>
                    <th className="py-2 pr-3 font-semibold">Set by</th>
                    <th className="py-2 pr-3 font-semibold">What it&apos;s for</th>
                    <th className="py-2 font-semibold">How long</th>
                  </tr>
                </thead>
                <tbody>
                  {COOKIES.map((c) => (
                    <tr key={c.name} className="border-b border-black/5 align-top">
                      <td className="py-2 pr-3 font-mono">{c.name}</td>
                      <td className="py-2 pr-3">{c.provider}</td>
                      <td className="py-2 pr-3">{c.purpose}</td>
                      <td className="py-2">{c.lasts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Videos in surveys and profiles</h2>
            <p className="mt-2">
              Some surveys and profiles include a video from another site. YouTube videos play through YouTube&apos;s
              privacy-enhanced mode and Vimeo videos with tracking turned off, so they don&apos;t set tracking
              cookies just because a page loaded. Videos from Instagram, TikTok and Loom only load when you press
              <strong> Play video</strong>; those sites may then set their own cookies, under their own policies.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Turning cookies off</h2>
            <p className="mt-2">
              You can block or delete cookies in your browser&apos;s settings. If you block the sign-in cookie
              you won&apos;t be able to stay signed in, and if you block Cloudflare&apos;s check on survey pages the
              survey may not be able to accept your answers.
            </p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-[var(--color-ink)]">Changes</h2>
            <p className="mt-2">
              If we ever add cookies that aren&apos;t strictly necessary — for example, to measure how the site is
              used — we&apos;ll update this page and ask for your consent before setting them. For how we handle your
              personal data more generally, see our{" "}
              <Link href="/privacy" className="font-semibold text-[var(--color-brand-dark)] underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <p className="text-[var(--color-ink-soft)]">…full copy to be finalised before launch.</p>
        </article>
      </div>
    </div>
  );
}
