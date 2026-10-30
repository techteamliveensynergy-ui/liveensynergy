import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { placeholderForCategory } from "@/lib/event-images";
import { Marquee } from "@/components/site/Marquee";
import { FinalCta } from "@/components/site/FinalCta";

export const metadata = {
  title: "For brands",
  description:
    "Research campaigns with live-event audiences: an LES-designed survey, promotion by participating artists and organisers, ticket discounts for participants and a campaign report for you.",
};

/**
 * "For brands" (the Figma site design, #82). Prices and participant numbers
 * come from campaign_packages, so this page can't disagree with what a
 * brand is invoiced; the per-package extras the table doesn't hold yet
 * (question counts, single/multi event) are PACKAGE_EXTRAS below — to be
 * confirmed with Sakshi, and moved into the table if admins need to edit them.
 */
type Pkg = {
  slug: string;
  name: string;
  description: string | null;
  participant_count: number | null;
  price_gbp: number | null;
  is_custom_price: boolean;
  min_price_gbp: number | null;
};

const PACKAGE_EXTRAS: Record<string, { accent: string; extras: string[] }> = {
  starter: { accent: "var(--color-les-lime)", extras: ["12 survey questions", "8 post-event questions", "Single event"] },
  growth: { accent: "var(--color-les-coral)", extras: ["16 survey questions", "10 post-event questions", "Single event"] },
  premium: { accent: "var(--color-les-teal)", extras: ["20 survey questions", "12 post-event questions", "Multi-event"] },
};

const gbp = (n: number) => `£${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

const CAN_DO = [
  { title: "Reach", body: "Connect with relevant live-event audiences through promotion by participating artists and organisers." },
  { title: "Engage", body: "Invite active participation through an LES-designed survey featuring your brand and campaign material." },
  { title: "Understand", body: "Receive survey responses without participants' direct contact details, alongside aggregated insights." },
  { title: "Support", body: "Fund audience ticket incentives and create extra engagement around participating live events." },
];

const JOURNEY = [
  { actor: "Brand", title: "Research objective", body: "You define what you want to learn from live-event audiences." },
  { actor: "LES", title: "Survey design", body: "We build the questionnaire and campaign experience around your objective." },
  { actor: "Artist & event", title: "Audience promotion", body: "Participating artists and organisers promote the campaign to their audiences." },
  { actor: "Audience", title: "Survey participation", body: "Fans respond to the survey and can opt in to hear more from your brand." },
  { actor: "Discount", title: "Unique ticket code", body: "Each eligible participant receives a single-use discount code for the event." },
  { actor: "Brand", title: "Insights + report", body: "You receive aggregated insights and campaign reporting within the agreed scope." },
];

const DELIVERS = [
  { icon: "◈", title: "Custom research", body: "An LES-designed questionnaire shaped around your research objective." },
  { icon: "◉", title: "Audience reach", body: "Promotion through participating artists, organisers and agreed campaign channels." },
  { icon: "◎", title: "Survey responses", body: "Responses supplied without participants' direct contact details." },
  { icon: "◐", title: "Campaign reporting", body: "Aggregated findings, audience insights and post-event analysis within the agreed scope." },
];

const PURPOSE = [
  { color: "var(--color-les-teal)", title: "Brands gain insight", body: "Relevant audience participation helps brands understand awareness, preferences and perceptions." },
  { color: "var(--color-les-lime)", title: "Audiences gain value", body: "People share their views and get ticket discounts through eligible campaign participation." },
  { color: "var(--color-les-coral)", title: "Artists & events gain support", body: "Campaigns bring audience engagement and ticket incentives to their events. Any further financial support is set out in the agreed arrangements." },
];

export default async function BrandsPage() {
  const supabase = await createClient();
  // Active packages are publicly readable; never select the margin.
  const { data } = await supabase
    .from("campaign_packages")
    .select("slug, name, description, participant_count, price_gbp, is_custom_price, min_price_gbp")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const packages = (data ?? []) as Pkg[];
  const fixed = packages.filter((p) => !p.is_custom_price && p.price_gbp != null);
  const custom = packages.find((p) => p.is_custom_price);
  const surveyImage = placeholderForCategory("music");

  return (
    <div className="overflow-x-hidden">
      {/* Hero */}
      <section className="les-wedge-down relative flex min-h-[85vh] flex-col justify-center overflow-hidden bg-[var(--color-les-lime)] px-5 pb-40 pt-24 md:px-10">
        <p
          aria-hidden
          className="les-poster pointer-events-none absolute left-[-2%] top-[8%] select-none whitespace-nowrap text-[var(--color-les-ink)]/[0.07]"
          style={{ fontSize: "clamp(120px, 22vw, 320px)" }}
        >
          BRANDS
        </p>
        <div className="relative z-10 mx-auto w-full max-w-[1200px]">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-[2px] w-8 bg-[var(--color-les-ink)]" />
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-les-ink)]">More than market research</p>
          </div>
          <h1 className="les-poster text-[var(--color-les-ink)]" style={{ fontSize: "clamp(52px, 9vw, 128px)" }}>
            Your brand
            <br />
            can help
            <br />
            power live
            <br />
            experiences.
          </h1>
          <p className="mt-10 max-w-[640px] text-lg leading-relaxed text-[var(--color-les-ink)]">
            When a brand works with Live En Synergy, its campaign goes beyond audience insight — it contributes to the
            live-event ecosystem and creates real engagement around participating events.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href="#packages" className="btn btn-dark h-[52px] px-8">
              Explore packages →
            </a>
            <a
              href="#journey"
              className="btn h-[52px] border border-[var(--color-les-ink)] px-8 text-[var(--color-les-ink)] hover:bg-[var(--color-les-ink)]/10"
            >
              How it works
            </a>
          </div>
        </div>
        <div className="absolute bottom-[16%] right-10 hidden h-[120px] w-[120px] items-center justify-center rounded-full border-2 border-[var(--color-les-ink)]/30 lg:flex">
          <p className="les-poster text-center text-[13px] text-[var(--color-les-ink)]">
            FOR
            <br />
            BRANDS
          </p>
        </div>
      </section>

      <Marquee words={["Reach", "Engage", "Understand", "Support"]} />

      {/* What your campaign can do */}
      <section className="px-5 py-24 md:px-10">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-16 flex items-baseline gap-4">
            <p className="les-eyebrow">Your campaign can</p>
            <div className="h-px flex-1 bg-[var(--color-les-line)]" />
          </div>
          <div className="grid gap-px bg-[var(--color-les-line)] md:grid-cols-2 lg:grid-cols-4">
            {CAN_DO.map((c, i) => (
              <div key={c.title} className="group flex flex-col gap-4 bg-[var(--color-les-ink)] p-8 transition-colors hover:bg-[var(--color-les-panel)]">
                <p className="text-[11px] text-[var(--color-les-line)] transition-colors group-hover:text-[var(--color-les-lime)]">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h2 className="les-poster break-words text-[clamp(36px,3.4vw,48px)] text-[var(--color-les-lime)]">{c.title}</h2>
                <p className="mt-auto text-sm leading-relaxed text-[var(--color-les-muted)]">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* More than a survey */}
      <section className="les-wedge-up relative overflow-hidden bg-[var(--color-les-panel)] px-5 py-32 md:px-10">
        <div className="mx-auto grid max-w-[1200px] items-center gap-16 lg:grid-cols-2">
          <div className="flex flex-col gap-8">
            <p className="les-eyebrow text-[var(--color-les-coral)]">The campaign experience</p>
            <h2 className="les-poster text-[var(--color-les-cream)]" style={{ fontSize: "clamp(52px, 7vw, 88px)" }}>
              More
              <br />
              than a
              <br />
              survey.
            </h2>
            <p className="text-[17px] leading-relaxed text-[var(--color-les-muted)]">
              Campaigns bring research and brand storytelling together in one audience experience. Your logo, tagline,
              images and video appear within the LES-designed survey.
            </p>
            <p className="border-l-2 border-[var(--color-les-lime)] pl-5 text-[15px] leading-relaxed text-[var(--color-les-cream)]">
              Eligible participants receive a unique, single-use ticket discount code, subject to campaign terms.
            </p>
          </div>
          <div className="relative" aria-hidden>
            <div className="absolute inset-0 translate-x-4 translate-y-4 rounded-[20px] bg-[var(--color-les-line)]" />
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-[20px] bg-[#1a3020]" />
            <div className="relative flex flex-col gap-5 rounded-[20px] bg-[var(--color-les-cream)] p-8">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-les-ink)]">Illustrative survey experience</p>
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={`h-2 w-2 rounded-full ${i === 0 ? "bg-[var(--color-les-ink)]" : "bg-[var(--color-les-ink)]/20"}`} />
                  ))}
                </div>
              </div>
              <p className="les-poster text-xl text-[var(--color-les-ink)]">YOUR BRAND</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={surveyImage} alt="" className="h-[160px] w-full rounded-xl object-cover" />
              <p className="les-poster text-[28px] text-[var(--color-les-ink)]">Tell us what matters to you.</p>
              <p className="text-[15px] text-[var(--color-les-ink)]">What matters most when choosing a new product?</p>
              {["Quality and performance", "Value for money", "Brand values"].map((a, i) => (
                <p
                  key={a}
                  className={`rounded-lg border px-4 py-3 text-sm ${
                    i === 0
                      ? "border-[var(--color-les-ink)] bg-[var(--color-les-ink)] text-[var(--color-les-lime)]"
                      : "border-[var(--color-les-ink)]/20 text-[var(--color-les-ink)]"
                  }`}
                >
                  {i === 0 ? "●" : "○"}&nbsp;&nbsp;{a}
                </p>
              ))}
              <p className="flex h-12 items-center justify-center rounded-lg bg-[var(--color-les-lime)] text-xs font-bold text-[var(--color-les-ink)]">
                NEXT →
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Journey */}
      <section id="journey" className="scroll-mt-20 px-5 py-24 md:px-10">
        <div className="mx-auto max-w-[1200px]">
          <p className="les-eyebrow mb-4">From objective to insight</p>
          <h2 className="les-poster mb-16 text-[var(--color-les-cream)]" style={{ fontSize: "clamp(40px, 6vw, 80px)" }}>
            A clear journey.
            <br />
            Value at every step.
          </h2>
          <div className="overflow-hidden rounded-2xl border border-[var(--color-les-line)]">
            {JOURNEY.map((s, i) => (
              <details
                key={s.title}
                open={i === 0}
                className="group border-b border-[var(--color-les-line)] last:border-b-0 open:bg-[var(--color-les-panel)]"
              >
                <summary className="flex cursor-pointer list-none items-center gap-6 px-6 py-6 md:px-8 [&::-webkit-details-marker]:hidden">
                  <span
                    className="les-poster shrink-0 text-[var(--color-les-line)] transition-colors group-open:text-[var(--color-les-lime)]"
                    style={{ fontSize: "clamp(32px, 4vw, 56px)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="hidden w-[140px] shrink-0 text-[11px] uppercase tracking-[0.18em] text-[var(--color-les-muted)] sm:block">
                    {s.actor}
                  </span>
                  <span className="les-poster min-w-0 flex-1 text-2xl text-[var(--color-les-cream)] lg:text-[32px]">{s.title}</span>
                  <span className="shrink-0 text-xl text-[var(--color-les-muted)] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="max-w-[600px] px-6 pb-6 text-[15px] leading-relaxed text-[var(--color-les-muted)] md:pl-[calc(2rem+56px+24px)]">
                  {s.body}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* What it delivers */}
      <section className="les-wedge-down bg-[var(--color-les-lime)] px-5 pb-36 pt-24 md:px-10">
        <div className="mx-auto max-w-[1200px]">
          <p className="mb-8 text-[11px] uppercase tracking-[0.18em] text-[var(--color-les-ink)]">What your campaign delivers</p>
          <h2 className="les-poster mb-16 text-[var(--color-les-ink)]" style={{ fontSize: "clamp(40px, 6vw, 80px)" }}>
            From audience
            <br />
            participation to
            <br />
            useful insight.
          </h2>
          <div className="grid gap-px bg-[var(--color-les-ink)]/20 sm:grid-cols-2">
            {DELIVERS.map((d) => (
              <div key={d.title} className="group flex flex-col gap-4 bg-[var(--color-les-lime)] p-10">
                <p aria-hidden className="text-[40px] leading-none text-[var(--color-les-ink)]/30 transition-colors group-hover:text-[var(--color-les-ink)]/60">
                  {d.icon}
                </p>
                <h3 className="les-poster text-[36px] text-[var(--color-les-ink)]">{d.title}</h3>
                <p className="text-[15px] leading-relaxed text-[var(--color-les-ink)]/70">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Purpose */}
      <section className="les-wedge-up bg-[var(--color-les-panel)] px-5 py-32 md:px-10">
        <div className="mx-auto max-w-[1200px]">
          <p className="les-eyebrow mb-8 text-[var(--color-les-coral)]">Our bigger purpose</p>
          <div className="grid gap-16 lg:grid-cols-2">
            <div>
              <h2 className="les-poster text-[var(--color-les-cream)]" style={{ fontSize: "clamp(48px, 7vw, 96px)" }}>
                More engagement.
                <br />
                More experiences.
                <br />
                More live events.
              </h2>
              <p className="mt-8 max-w-[460px] leading-relaxed text-[var(--color-les-muted)]">
                Our goal is to create more reasons for people to discover, engage with and attend live events. LES brings
                together brand research, audience participation and ticket incentives to create value around the
                experiences people care about.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-6">
              {PURPOSE.map((p) => (
                <div key={p.title} className="border-l-2 pl-6 transition-all hover:pl-8" style={{ borderColor: p.color }}>
                  <h3 className="les-poster mb-2 text-[26px]" style={{ color: p.color }}>
                    {p.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-[var(--color-les-muted)]">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section id="packages" className="scroll-mt-20 px-5 py-24 md:px-10">
        <div className="mx-auto max-w-[1200px]">
          <p className="les-eyebrow mb-4">Brand packages</p>
          <div className="mb-16 flex flex-wrap items-end justify-between gap-6">
            <h2 className="les-poster text-[var(--color-les-cream)]" style={{ fontSize: "clamp(40px, 6vw, 80px)" }}>
              Choose your
              <br />
              campaign.
            </h2>
            <p className="max-w-[420px] leading-relaxed text-[var(--color-les-muted)]">
              Research packages designed around your objectives and the scale of your campaign. Prices exclude VAT.
            </p>
          </div>

          {fixed.length > 0 && (
            <div className="mb-6 grid gap-6 md:grid-cols-3">
              {fixed.map((p) => {
                const extra = PACKAGE_EXTRAS[p.slug];
                const accent = extra?.accent ?? "var(--color-les-lime)";
                const features = [
                  p.participant_count ? `${p.participant_count} estimated participants` : null,
                  ...(extra?.extras ?? []),
                  "Audience insights",
                  "Campaign report",
                ].filter((f): f is string => !!f);
                return (
                  <div
                    key={p.slug}
                    className="les-lift group flex flex-col gap-6 rounded-2xl border border-[var(--color-les-line)] bg-[var(--color-les-panel)] p-8 hover:[border-color:var(--pkg-accent)]"
                    style={{ ["--pkg-accent" as string]: accent }}
                  >
                    <div className="flex items-start justify-between">
                      <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: accent }}>
                        {p.name}
                      </p>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-les-line)] text-sm text-[var(--color-les-line)] transition-colors group-hover:[border-color:var(--pkg-accent)] group-hover:[color:var(--pkg-accent)]">
                        →
                      </span>
                    </div>
                    <p className="les-poster text-[72px] leading-none text-[var(--color-les-cream)]">{gbp(p.price_gbp!)}</p>
                    <ul className="flex flex-1 flex-col gap-2">
                      {features.map((f) => (
                        <li key={f} className="flex items-center gap-3 text-sm text-[var(--color-les-muted)]">
                          <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: accent }} />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/auth/sign-up?role=brand"
                      className="flex h-12 items-center justify-center rounded-lg border text-[13px] font-bold transition-colors group-hover:[background:var(--pkg-accent)] group-hover:[color:var(--color-les-ink)]"
                      style={{ borderColor: accent, color: accent }}
                    >
                      Choose {p.name} →
                    </Link>
                  </div>
                );
              })}
            </div>
          )}

          {custom && (
            <div className="relative overflow-hidden rounded-2xl border border-[var(--color-les-line)] bg-[var(--color-les-panel)]">
              <span className="absolute inset-y-0 left-0 w-1 bg-[var(--color-les-lime)]" />
              <div className="flex flex-wrap items-center justify-between gap-8 px-8 py-8 md:px-10">
                <div>
                  <p className="les-eyebrow mb-2">{custom.name}</p>
                  <p className="les-poster text-[48px] leading-none text-[var(--color-les-cream)]">
                    {custom.min_price_gbp ? `From ${gbp(custom.min_price_gbp)}` : "Bespoke"}
                  </p>
                </div>
                <p className="max-w-[400px] flex-1 text-[15px] leading-relaxed text-[var(--color-les-muted)]">
                  A custom campaign or a bespoke brief tailored to your research needs. Talk to us about scope.
                </p>
                <Link href="/contact?subject=Enterprise%20campaign" className="btn btn-ghost h-[52px] whitespace-nowrap px-8">
                  Discuss a campaign →
                </Link>
              </div>
            </div>
          )}
          <p className="mt-4 text-xs text-[var(--color-les-muted)]/70">
            Participant figures are estimates. Final campaign scope, incentives and delivery terms are agreed with LES
            before launch.
          </p>
        </div>
      </section>

      <FinalCta />
    </div>
  );
}
