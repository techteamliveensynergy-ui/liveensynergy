import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Marquee } from "@/components/site/Marquee";
import { FinalCta } from "@/components/site/FinalCta";
import { createClient } from "@/lib/supabase/server";
import { getPublicLiveEvents } from "@/lib/public-event";
import { formatEventDateTime } from "@/lib/event-time";
import { eventImage } from "@/lib/event-images";
import { FAQS } from "@/lib/faqs";

/**
 * Home page in the public-site design (#82): lime hero, marquee, the three
 * sides of the platform, how it works, live campaigns, what a brand gets,
 * packages teaser, FAQs, closing band. Copy carried over from the previous
 * home page (already on the new model and "partner" wording); package
 * prices come from campaign_packages, live events from public_live_events()
 * (0095) — that section hides itself when there's nothing live.
 */

const SIDES = [
  {
    eyebrow: "For brands",
    title: "Real audiences, real answers.",
    body: "Choose a campaign package and tell us who you want to reach. We put your brand in front of live-event audiences and come back with research, insights and a performance report.",
    href: "/brands",
    cta: "Explore brand campaigns",
    color: "var(--color-les-lime)",
  },
  {
    eyebrow: "For artists & organisers",
    title: "Partnership for your events.",
    body: "List your upcoming events. When a brand campaign fits, we match it to you: you deliver the agreed branding, like social mentions and onsite presence, and get paid for it.",
    href: "/auth/sign-up?role=artist",
    cta: "List your events",
    color: "var(--color-les-coral)",
  },
  {
    eyebrow: "For audiences",
    title: "Share your view, get a reward.",
    body: "Go to events you'd love anyway and answer the partner's short survey. Once your response passes our quality check, you get a discount code.",
    href: "/events",
    cta: "Find a live campaign",
    color: "var(--color-les-teal)",
  },
];

const STEPS = [
  {
    title: "A brand chooses a package",
    body: "The brand picks a campaign package and tells us its objective, target audience, location and what it wants to learn. Our team sets up the campaign and its research survey.",
  },
  {
    title: "We match it to live events",
    body: "We select suitable artists' and organisers' events and audiences. The artist delivers the agreed branding, such as social media mentions and onsite presence.",
  },
  {
    title: "Audiences take part",
    body: "Ticket holders answer the partner's survey and check in at the venue. Responses that pass our quality check earn a discount code, and the brand gets the insights.",
  },
];

const BENEFITS = [
  ["Reach", "Put your brand in front of real live-event audiences."],
  ["Targeting", "Define your audience by demographics, interests and event type."],
  ["Research", "Collect targeted consumer feedback through a custom research survey."],
  ["Engagement", "Incentivise genuine participation with a tangible consumer benefit."],
  ["Brand awareness", "Build awareness through branded campaign touchpoints you can measure."],
  ["Emotional impact", "Associate your brand with a positive experience people value."],
  ["Insights", "Understand your audience through demographics, responses and findings."],
  ["Measurement", "See reach, engagement and brand perception in a performance report."],
  ["Campaign management", "We run it from setup and recruitment to rewards and reporting."],
];

const gbp = (n: number) => `£${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

export default async function HomePage() {
  const supabase = await createClient();
  const [live, { data: pkgRows }] = await Promise.all([
    getPublicLiveEvents(supabase),
    supabase.from("campaign_packages").select("price_gbp").eq("is_active", true).not("price_gbp", "is", null),
  ]);
  const prices = ((pkgRows ?? []) as { price_gbp: number }[]).map((p) => Number(p.price_gbp));
  const fromPrice = prices.length ? Math.min(...prices) : null;

  return (
    <div className="les-site min-h-screen overflow-x-hidden">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="les-wedge-down relative flex min-h-[85vh] flex-col justify-center overflow-hidden bg-[var(--color-les-lime)] px-5 pb-40 pt-20 md:px-10">
          <p
            aria-hidden
            className="les-poster pointer-events-none absolute right-[-3%] top-[6%] select-none whitespace-nowrap text-[var(--color-les-ink)]/[0.07]"
            style={{ fontSize: "clamp(140px, 26vw, 380px)" }}
          >
            LIVE
          </p>
          <div className="relative z-10 mx-auto w-full max-w-[1200px]">
            <div className="mb-6 flex items-center gap-3">
              <span className="h-[2px] w-8 bg-[var(--color-les-ink)]" />
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-les-ink)]">
                A partnership marketplace for live events
              </p>
            </div>
            <h1 className="les-poster text-[var(--color-les-ink)]" style={{ fontSize: "clamp(56px, 10vw, 140px)" }}>
              Where brands,
              <br />
              artists &amp; audiences
              <br />
              meet.
            </h1>
            <p className="mt-10 max-w-[600px] text-lg leading-relaxed text-[var(--color-les-ink)]">
              Brands reach real live-event audiences and learn what they think. Artists get partnered. Fans share their
              view and get a discount code for it.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/brands" className="btn btn-dark h-[52px] px-8">
                I&apos;m a brand →
              </Link>
              <Link
                href="/auth/sign-up?role=artist"
                className="btn h-[52px] border border-[var(--color-les-ink)] px-8 text-[var(--color-les-ink)] hover:bg-[var(--color-les-ink)]/10"
              >
                I&apos;m an artist / organiser
              </Link>
              <Link
                href="/events"
                className="btn h-[52px] border border-[var(--color-les-ink)] px-8 text-[var(--color-les-ink)] hover:bg-[var(--color-les-ink)]/10"
              >
                Find an event
              </Link>
            </div>
          </div>
        </section>

        <Marquee words={["Brands", "Artists", "Audiences", "Live events"]} />

        {/* Three sides */}
        <section className="px-5 py-24 md:px-10">
          <div className="mx-auto max-w-[1200px]">
            <div className="mb-16 flex items-baseline gap-4">
              <p className="les-eyebrow">Everyone wins</p>
              <div className="h-px flex-1 bg-[var(--color-les-line)]" />
            </div>
            <div className="grid gap-px bg-[var(--color-les-line)] lg:grid-cols-3">
              {SIDES.map((s) => (
                <Link
                  key={s.eyebrow}
                  href={s.href}
                  className="group flex flex-col gap-5 bg-[var(--color-les-ink)] p-8 transition-colors hover:bg-[var(--color-les-panel)] md:p-10"
                >
                  <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: s.color }}>
                    {s.eyebrow}
                  </p>
                  <h2 className="les-poster text-[44px] text-[var(--color-les-cream)]">{s.title}</h2>
                  <p className="text-[15px] leading-relaxed text-[var(--color-les-muted)]">{s.body}</p>
                  <p className="mt-auto pt-4 text-sm font-bold transition-transform group-hover:translate-x-1" style={{ color: s.color }}>
                    {s.cta} →
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="les-wedge-up scroll-mt-20 bg-[var(--color-les-panel)] px-5 py-32 md:px-10">
          <div className="mx-auto max-w-[1200px]">
            <p className="les-eyebrow mb-4 text-[var(--color-les-coral)]">How it works</p>
            <h2 className="les-poster mb-16 text-[var(--color-les-cream)]" style={{ fontSize: "clamp(44px, 7vw, 88px)" }}>
              Three steps.
              <br />
              Three winners.
            </h2>
            <ol className="grid gap-10 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex flex-col gap-4 border-t border-[var(--color-les-line)] pt-6">
                  <span className="les-poster text-[64px] leading-none text-[var(--color-les-lime)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="les-poster text-[30px] text-[var(--color-les-cream)]">{s.title}</h3>
                  <p className="text-[15px] leading-relaxed text-[var(--color-les-muted)]">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Live now — real campaigns only; hidden when none are live */}
        {live.length > 0 && (
          <section className="px-5 py-24 md:px-10">
            <div className="mx-auto max-w-[1200px]">
              <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="les-eyebrow mb-4">Live now</p>
                  <h2 className="les-poster text-[var(--color-les-cream)]" style={{ fontSize: "clamp(40px, 6vw, 72px)" }}>
                    Take part, get a<br />
                    ticket discount.
                  </h2>
                </div>
                <Link href="/events" className="btn btn-ghost h-[52px] px-8">
                  All events →
                </Link>
              </div>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {live.slice(0, 3).map((e) => {
                  const image = eventImage(e.banner_url, e.category);
                  const when = formatEventDateTime({ date: e.event_date, time: e.start_time, timeZone: e.timezone });
                  return (
                    <Link
                      key={e.id}
                      href={`/events/${e.id}`}
                      className="les-lift block overflow-hidden rounded-2xl border border-[var(--color-les-line)] bg-[var(--color-les-panel)] hover:border-[var(--color-les-lime)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.src} alt={image.alt} className="h-44 w-full object-cover" />
                      <div className="space-y-2 p-5">
                        {(e.brand_name || e.artist_name) && (
                          <p className="flex items-center gap-2 text-sm font-bold text-[var(--color-les-lime)]">
                            {e.brand_logo_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={e.brand_logo_url} alt="" className="h-6 w-6 rounded bg-white object-contain p-0.5" />
                            )}
                            <span className="truncate">{[e.brand_name, e.artist_name].filter(Boolean).join(" × ")}</span>
                          </p>
                        )}
                        <h3 className="les-poster text-[26px] text-[var(--color-les-cream)]">{e.name}</h3>
                        <p className="text-sm text-[var(--color-les-muted)]">
                          {[when ?? "Date to be confirmed", e.venue].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* What a campaign gives a brand */}
        <section className="les-wedge-down bg-[var(--color-les-lime)] px-5 pb-36 pt-24 md:px-10">
          <div className="mx-auto max-w-[1200px]">
            <p className="mb-8 text-[11px] uppercase tracking-[0.18em] text-[var(--color-les-ink)]">For brands</p>
            <div className="mb-16 flex flex-wrap items-end justify-between gap-8">
              <h2 className="les-poster text-[var(--color-les-ink)]" style={{ fontSize: "clamp(40px, 6vw, 80px)" }}>
                More than
                <br />
                market research.
              </h2>
              <div className="flex flex-col items-start gap-4">
                {fromPrice != null && (
                  <p className="les-poster text-[40px] leading-none text-[var(--color-les-ink)]">
                    Packages from {gbp(fromPrice)}
                    <span className="ml-2 align-middle font-sans text-xs font-normal">ex. VAT</span>
                  </p>
                )}
                <Link href="/brands#packages" className="btn btn-dark h-[52px] px-8">
                  See packages →
                </Link>
              </div>
            </div>
            <div className="grid gap-px bg-[var(--color-les-ink)]/20 sm:grid-cols-2 lg:grid-cols-3">
              {BENEFITS.map(([title, body]) => (
                <div key={title} className="flex flex-col gap-3 bg-[var(--color-les-lime)] p-8">
                  <h3 className="les-poster text-[30px] text-[var(--color-les-ink)]">{title}</h3>
                  <p className="text-[15px] leading-relaxed text-[var(--color-les-ink)]/70">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section className="px-5 py-24 md:px-10">
          <div className="mx-auto max-w-[900px]">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="les-eyebrow mb-4">The short answers</p>
                <h2 className="les-poster text-[var(--color-les-cream)]" style={{ fontSize: "clamp(40px, 6vw, 72px)" }}>
                  Frequently asked.
                </h2>
              </div>
              <Link href="/faqs" className="btn btn-ghost h-[52px] px-8">
                All FAQs →
              </Link>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[var(--color-les-line)]">
              {FAQS.slice(0, 4).map((item) => (
                <details key={item.q} className="group border-b border-[var(--color-les-line)] last:border-b-0 open:bg-[var(--color-les-panel)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 px-6 py-5 [&::-webkit-details-marker]:hidden">
                    <span className="text-[17px] font-bold text-[var(--color-les-cream)]">{item.q}</span>
                    <span className="shrink-0 text-xl text-[var(--color-les-lime)] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="px-6 pb-6 text-[15px] leading-relaxed text-[var(--color-les-muted)]">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
