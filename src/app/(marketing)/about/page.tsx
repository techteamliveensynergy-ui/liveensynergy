import Link from "next/link";
import { Marquee } from "@/components/site/Marquee";
import { FinalCta } from "@/components/site/FinalCta";

export const metadata = {
  title: "About us",
  description:
    "Live En Synergy brings brand research, audience participation and ticket incentives together to create more reasons for people to go to live events.",
};

/**
 * About, in the public-site design (#82). Rewritten on the current model:
 * the older copy promised "ticket reimbursements", cash rewards and "flat
 * pricing", none of which the platform offers any more. The purpose copy is
 * the site design's ("Our bigger purpose").
 */
const PURPOSE = [
  {
    color: "var(--color-les-teal)",
    title: "Brands gain insight",
    body: "Relevant audience participation helps brands understand awareness, preferences and perceptions — from the people actually at the events.",
  },
  {
    color: "var(--color-les-lime)",
    title: "Audiences gain value",
    body: "People share their views and get a ticket discount through eligible campaign participation.",
  },
  {
    color: "var(--color-les-coral)",
    title: "Artists & events gain support",
    body: "Campaigns bring audience engagement and ticket incentives to their events. Any further financial support is set out in the agreed arrangements.",
  },
];

const PRINCIPLES = [
  ["Quality-checked", "Every survey response is checked before a discount code is issued, so brands get answers they can trust."],
  ["Private by design", "Brands see survey responses without participants' direct contact details, and results in aggregate."],
  ["Run end to end", "Our team designs the survey, matches the events, issues the codes and writes up the report."],
];

export default function AboutPage() {
  return (
    <div className="overflow-x-hidden">
      <section className="les-wedge-down relative overflow-hidden bg-[var(--color-les-lime)] px-5 pb-36 pt-20 md:px-10">
        <p
          aria-hidden
          className="les-poster pointer-events-none absolute right-[-2%] top-[10%] select-none whitespace-nowrap text-[var(--color-les-ink)]/[0.07]"
          style={{ fontSize: "clamp(120px, 22vw, 320px)" }}
        >
          STORY
        </p>
        <div className="relative z-10 mx-auto max-w-[1200px]">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-[2px] w-8 bg-[var(--color-les-ink)]" />
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-les-ink)]">Our story</p>
          </div>
          <h1 className="les-poster text-[var(--color-les-ink)]" style={{ fontSize: "clamp(52px, 9vw, 120px)" }}>
            Partnership,
            <br />
            re-imagined.
          </h1>
          <div className="mt-10 max-w-[680px] space-y-5 text-lg leading-relaxed text-[var(--color-les-ink)]">
            <p>
              Live En Synergy was born from a simple frustration: brand partnership rarely reaches the people in the
              room. Money flows from a brand to an artist or event, and the audience who actually shows up gets
              nothing out of it — and the brand learns very little about them.
            </p>
            <p>
              So we built a three-sided platform. Brands run research campaigns with live-event audiences. Artists and
              organisers promote them and gain engagement around their events. Audiences share their views and get a
              ticket discount for it.
            </p>
          </div>
        </div>
      </section>

      <Marquee words={["Brands", "Artists", "Audiences"]} />

      <section className="px-5 py-24 md:px-10">
        <div className="mx-auto grid max-w-[1200px] gap-16 lg:grid-cols-2">
          <div>
            <p className="les-eyebrow mb-8 text-[var(--color-les-coral)]">Our bigger purpose</p>
            <h2 className="les-poster text-[var(--color-les-cream)]" style={{ fontSize: "clamp(48px, 7vw, 96px)" }}>
              More engagement.
              <br />
              More experiences.
              <br />
              More live events.
            </h2>
            <p className="mt-8 max-w-[460px] leading-relaxed text-[var(--color-les-muted)]">
              Our goal is to create more reasons for people to discover, engage with and attend live events. We bring
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
      </section>

      <section className="les-wedge-up bg-[var(--color-les-panel)] px-5 py-28 md:px-10">
        <div className="mx-auto max-w-[1200px]">
          <p className="les-eyebrow mb-12">How we work</p>
          <div className="grid gap-px bg-[var(--color-les-line)] md:grid-cols-3">
            {PRINCIPLES.map(([title, body], i) => (
              <div key={title} className="flex flex-col gap-4 bg-[var(--color-les-panel)] p-8">
                <p className="text-[11px] text-[var(--color-les-lime)]">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="les-poster text-[36px] text-[var(--color-les-cream)]">{title}</h3>
                <p className="text-sm leading-relaxed text-[var(--color-les-muted)]">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-sm text-[var(--color-les-muted)]">
            Want to know more?{" "}
            <Link href="/contact" className="text-[var(--color-les-lime)] underline">
              Get in touch
            </Link>{" "}
            or read the{" "}
            <Link href="/faqs" className="text-[var(--color-les-lime)] underline">
              FAQs
            </Link>
            .
          </p>
        </div>
      </section>

      <FinalCta />
    </div>
  );
}
