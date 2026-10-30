import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatEventDateTime } from "@/lib/event-time";
import { eventImage } from "@/lib/event-images";
import { formatDate, formatDateTime } from "@/lib/format";
import { displayUrl } from "@/lib/urls";
import { opensLabel } from "@/lib/campaign-opening";
import {
  clockTime,
  codesValidUntil,
  discountHeadline,
  eventHasEnded,
  getPublicEvent,
  heroDiscount,
  redemptionLabel,
  surveyCta,
  venueLine,
  type PublicEvent,
  type SurveyCta,
} from "@/lib/public-event";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const ev = await getPublicEvent(supabase, id);
  if (!ev) return { title: "Event" };
  const title = ev.brand ? `${ev.brand.name} × ${ev.artist_name ?? ev.name}` : ev.name;
  const offer = heroDiscount(ev.tiers);
  const description = [
    ev.name,
    formatEventDateTime({ date: ev.event_date, time: ev.start_time, timeZone: ev.timezone }),
    offer ? `${offer} your ticket when you take part in a short survey` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const image = ev.banner_url ? [{ url: ev.banner_url }] : undefined;
  return {
    title,
    description,
    openGraph: { title, description, images: image, type: "website" },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image },
  };
}

/**
 * The public page for a live campaign event (GitHub #48). Sections follow
 * Sakshi's order: hero, the event, the research campaign, the discount, how
 * it works, eligibility, then Start survey. Signed-out by design — Start
 * survey goes to the public survey link, which handles accounts itself.
 * Every optional line is skipped when its field is blank.
 */
export default async function PublicEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const ev = await getPublicEvent(supabase, id);
  if (!ev) notFound();

  const cta = await surveyCta(supabase, ev);
  const page = ev.page;
  const when = formatEventDateTime(
    { date: ev.event_date, time: ev.start_time, timeZone: ev.timezone },
    { weekday: true },
  );
  const venue = venueLine(ev);
  const art = eventImage(ev.banner_url, ev.category);
  const offer = heroDiscount(ev.tiers);
  const ended = eventHasEnded(ev);

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 md:py-16">
      <Link href="/events" className="text-sm text-[var(--color-brand-dark)]">
        ← All events
      </Link>

      {/* 1. Hero */}
      <section className="mt-4 overflow-hidden rounded-3xl border border-black/10 bg-white shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art.src} alt={art.alt || ev.name} className="h-56 w-full object-cover md:h-72" />
        <div className="space-y-4 p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-2">
            {ended ? <span className="chip">Event ended</span> : <span className="chip">Live research campaign</span>}
            {ev.category && <span className="chip">{ev.category}</span>}
            {page?.subcategory && <span className="chip">{page.subcategory}</span>}
          </div>
          <PartnerLine ev={ev} />
          <div>
            {ev.campaign_name && (
              <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                {ev.campaign_name}
              </p>
            )}
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
              {ev.name}
            </h1>
          </div>
          <p className="text-[var(--color-ink-soft)]">
            {[when ?? "Date to be confirmed", venue].filter(Boolean).join(" · ")}
          </p>
          {offer && !ended && (
            <p className="inline-block rounded-2xl bg-[var(--color-brand)]/10 px-4 py-2 font-display text-lg font-semibold text-[var(--color-brand-dark)]">
              {offer} your ticket
            </p>
          )}
          {!ended && <CtaButton cta={cta} compact />}
        </div>
      </section>

      {/* 2. About the event */}
      <Section title="About the event">
        {page?.event_description && <Prose text={page.event_description} />}
        <Facts>
          <Fact label="Artist / organiser">{ev.artist_name}</Fact>
          <Fact label="Music category">
            {[ev.category, page?.subcategory].filter(Boolean).join(" · ") || null}
          </Fact>
          <Fact label="Date">{when}</Fact>
          <Fact label="Doors / start">{clockTime(ev.start_time)}</Fact>
          <Fact label="Ends">{clockTime(ev.end_time)}</Fact>
          <Fact label="Venue">{venue}</Fact>
          <Fact label="Venue details">{ev.venue_details}</Fact>
          <Fact label="Age restriction">{page?.age_restriction}</Fact>
          <Fact label="Official tickets">
            {ev.ticket_url && (
              <a href={ev.ticket_url} target="_blank" rel="noopener noreferrer" className="underline">
                {displayUrl(ev.ticket_url)}
              </a>
            )}
          </Fact>
        </Facts>
        {/* Sakshi: "a slightly smaller banner image of the event below this" —
            the listing's own artwork; skipped when it's the hero image again. */}
        {ev.event_image_url && ev.event_image_url !== ev.banner_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ev.event_image_url} alt="" className="mt-5 h-40 w-full rounded-2xl object-cover md:h-48" />
        )}
      </Section>

      {/* 3. About the research campaign */}
      <Section title="About the research campaign">
        {ev.brand && (
          <p className="text-sm text-[var(--color-ink-soft)]">
            This research is supported by <strong className="text-[var(--color-ink)]">{ev.brand.name}</strong>
            {ev.artist_name ? (
              <>
                , separately from the event&apos;s organiser, <strong className="text-[var(--color-ink)]">{ev.artist_name}</strong>
              </>
            ) : null}
            . It&apos;s run by Live·En·Synergy.
          </p>
        )}
        <Facts>
          <Fact label="What the survey is about">{page?.research_about ?? ev.survey?.description}</Fact>
          <Fact label="Why the brand wants your feedback">{page?.research_why}</Fact>
          <Fact label="Time to complete">
            {page?.survey_minutes ? `About ${page.survey_minutes} minute${page.survey_minutes === 1 ? "" : "s"}` : null}
          </Fact>
        </Facts>
        {ev.brand && (ev.brand.description || ev.brand.logo_url || ev.brand.banner_url) && (
          <div className="mt-5 overflow-hidden rounded-2xl bg-[var(--color-mist)]">
          {ev.brand.banner_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ev.brand.banner_url} alt="" className="h-32 w-full object-cover md:h-40" />
          )}
          <div className="flex gap-4 p-4">
            {ev.brand.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ev.brand.logo_url}
                alt={`${ev.brand.name} logo`}
                className="h-14 w-14 shrink-0 rounded-xl bg-white object-contain p-1"
              />
            )}
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-[var(--color-ink)]">{ev.brand.name}</p>
              {ev.brand.description && <p className="mt-1 text-[var(--color-ink-soft)]">{ev.brand.description}</p>}
              {ev.brand.website_url && (
                <a
                  href={ev.brand.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[var(--color-brand-dark)] underline"
                >
                  {displayUrl(ev.brand.website_url)}
                </a>
              )}
            </div>
          </div>
          </div>
        )}
      </Section>

      {/* 4. Your ticket discount */}
      <DiscountSection ev={ev} />

      {/* 5. How it works */}
      <Section title="How it works">
        <ol className="space-y-3">
          {[
            ["Take the survey", "Answer a short survey about the event and the brand. No account needed to start."],
            ["We check your answers", "Every response goes through a quick quality check."],
            ["Get your code", "If your response qualifies, your discount code is shown straight away and emailed to you."],
            [
              "Use it when you book",
              ev.ticket_url || redemptionLabel(ev.tiers)
                ? `Enter the code at checkout${redemptionLabel(ev.tiers) ? ` on ${redemptionLabel(ev.tiers)}` : ""} when you buy your ticket.`
                : "Enter the code at checkout when you buy your ticket.",
            ],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand)] text-sm font-semibold text-white">
                {i + 1}
              </span>
              <div className="text-sm">
                <p className="font-semibold text-[var(--color-ink)]">{title}</p>
                <p className="text-[var(--color-ink-soft)]">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
          If your response doesn&apos;t pass the quality check, no code is issued — for example when answers are
          rushed, contradictory, or a duplicate of another response.
        </p>
        <a href="#participation-faq" className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
          Participation FAQ ↓
        </a>
      </Section>

      {/* 6. Eligibility */}
      <Section title="Eligibility">
        <Bullets
          lines={[
            "You must be 18 or over and a UK resident.",
            page?.participation_limit ?? "One response per person.",
            page?.code_limit_note ?? "Codes are issued while they last, one per qualifying response.",
            "Responses are quality-checked before a code is issued.",
            page?.account_required
              ? "You'll need a Live·En·Synergy account — you can create one as you start the survey."
              : "You don't need a Live·En·Synergy account to take part.",
            ...(page?.eligibility_lines ?? []),
          ]}
        />
      </Section>

      {/* 7. Start survey and terms */}
      <section className="mt-8 rounded-3xl bg-[var(--color-ink)] p-6 text-white md:p-8">
        <h2 className="font-display text-2xl font-semibold">{ended ? "This event has ended" : "Ready to take part?"}</h2>
        {!ended && cta.kind === "open" && (
          <p className="mt-2 text-sm text-white/80">
            Codes still available: <strong>{cta.codes === "exhausted" ? "No" : cta.codes === "available" ? "Yes" : "Being set up"}</strong>
          </p>
        )}
        {!ended && ev.participation_deadline && cta.kind === "open" && (
          <p className="mt-1 text-sm text-white/80">
            Take part by <strong>{formatDateTime(ev.participation_deadline)}</strong>
          </p>
        )}
        <div className="mt-5">
          {ended ? (
            <p className="text-sm text-white/80">The survey for this event is closed. Thanks to everyone who took part.</p>
          ) : (
            <CtaButton cta={cta} />
          )}
        </div>
        <p className="mt-6 text-xs text-white/70">
          By taking part you agree to the{" "}
          <Link href="/terms" className="underline">
            participant and promotion terms
          </Link>{" "}
          and our{" "}
          <Link href="/privacy" className="underline">
            privacy policy
          </Link>
          .
        </p>
        <p className="mt-2 text-xs text-white/70">
          Questions, a complaint, or a problem with your code?{" "}
          <Link href={contactHref(ev)} className="underline">
            Contact Live·En·Synergy about this promotion
          </Link>
          .
        </p>
      </section>

      <ParticipationFaq ev={ev} />
    </div>
  );
}

/** The contact form pre-filled with this event (it reads ?ref= and ?subject=). */
function contactHref(ev: PublicEvent) {
  const q = new URLSearchParams({ ref: ev.reference, subject: `Promotion: ${ev.name}` });
  return `/contact?${q}`;
}

/**
 * Sakshi: "explain what happens if validation fails — perhaps a Participation
 * FAQ link below How it works". On the page rather than a separate one so it
 * can't drift from this event's own terms; the answers describe what the
 * platform actually does (quality scoring, auto-issued codes, review of late
 * responses, aggregated-only brand results).
 */
function ParticipationFaq({ ev }: { ev: PublicEvent }) {
  const faqs: [string, ReactNode][] = [
    [
      "What happens if my response doesn't pass the check?",
      "No code is issued for that response. Responses are checked for things like answers given too quickly, failed attention questions, contradictions, and duplicates of another response. If you think we got it wrong, contact us and the team will review it.",
    ],
    [
      "When do I get my code?",
      "As soon as your response passes the check, your code is shown on screen and emailed to you. If the survey had already reached its participant limit when you answered, your response is reviewed by the team first and a code isn't guaranteed.",
    ],
    [
      "I haven't received my code, or it doesn't work",
      <>
        Check your spam or junk folder first. If it's still missing, or the ticket site won&apos;t accept it,{" "}
        <Link href={contactHref(ev)} className="underline">
          contact us
        </Link>{" "}
        with the email address you used and we&apos;ll sort it out.
      </>,
    ],
    [
      "Can I take part more than once?",
      "No — one response per person. Repeat responses are flagged as duplicates and don't receive a code.",
    ],
    [
      "Who sees my answers?",
      <>
        The brand sees combined results only, never your name or contact details. See our{" "}
        <Link href="/privacy" className="underline">
          privacy policy
        </Link>
        .
      </>,
    ],
  ];
  return (
    <section id="participation-faq" className="mt-8 scroll-mt-24">
      <h2 className="mb-4 font-display text-xl font-semibold text-[var(--color-ink)]">Participation FAQ</h2>
      <div className="space-y-3">
        {faqs.map(([q, a]) => (
          <details key={q} className="card group p-5 [&_summary]:cursor-pointer">
            <summary className="flex items-center justify-between gap-3 font-display font-semibold text-[var(--color-ink)]">
              {q}
              <span className="text-[var(--color-brand)] transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm text-[var(--color-ink-soft)]">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function PartnerLine({ ev }: { ev: PublicEvent }) {
  if (!ev.brand && !ev.artist_name) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {ev.brand && (
        <span className="flex items-center gap-2">
          {ev.brand.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ev.brand.logo_url} alt="" className="h-9 w-9 rounded-lg bg-white object-contain p-0.5 ring-1 ring-black/10" />
          )}
          <span>
            <span className="block text-xs text-[var(--color-ink-soft)]">Research partner</span>
            <span className="font-semibold text-[var(--color-ink)]">{ev.brand.name}</span>
          </span>
        </span>
      )}
      {ev.brand && ev.artist_name && <span className="text-xl text-[var(--color-ink-soft)]">×</span>}
      {ev.artist_name && (
        <span>
          <span className="block text-xs text-[var(--color-ink-soft)]">Artist / organiser</span>
          <span className="font-semibold text-[var(--color-ink)]">{ev.artist_name}</span>
        </span>
      )}
    </div>
  );
}

function DiscountSection({ ev }: { ev: PublicEvent }) {
  const page = ev.page;
  const until = codesValidUntil(ev.tiers);
  const where = redemptionLabel(ev.tiers);
  const yesNo = (v: boolean | null | undefined, yes: string, no: string) => (v == null ? null : v ? yes : no);
  const lines = [
    page?.eligible_tickets ? `Eligible tickets: ${page.eligible_tickets}` : null,
    yesNo(page?.booking_fees_excluded, "Booking fees are excluded from the discount.", "The discount also applies to booking fees."),
    until ? `Valid until ${formatDate(until)}.` : null,
    yesNo(page?.single_use, "Each code can be used once.", "Each code can be used more than once."),
    yesNo(page?.combinable, "Can be combined with other offers.", "Can't be combined with other offers."),
    where ? `Redeem on ${where}.` : null,
    ...(page?.offer_lines ?? []),
  ];
  if (ev.tiers.length === 0 && !lines.some(Boolean) && !ev.reward_rules) return null;

  return (
    <Section title="Your ticket discount">
      {ev.tiers.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {ev.tiers.map((t) => (
            <div key={t.label} className="rounded-2xl bg-[var(--color-brand)]/10 px-4 py-3">
              <p className="font-display text-xl font-semibold text-[var(--color-brand-dark)]">{discountHeadline(t)}</p>
              {ev.tiers.length > 1 && <p className="text-xs text-[var(--color-ink-soft)]">{t.label}</p>}
              {t.reward_description && t.reward_description !== discountHeadline(t) && (
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{t.reward_description}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {ev.tiers.length === 0 && ev.reward_rules && <Prose text={ev.reward_rules} />}
      <Bullets lines={lines} />
    </Section>
  );
}

function CtaButton({ cta, compact = false }: { cta: SurveyCta; compact?: boolean }) {
  const muted = (label: string, body?: string) => (
    <div>
      {/* compact = the hero (light card); otherwise the dark "Ready to take part?" panel. */}
      <span className={`btn ${compact ? "btn-ghost" : "btn-white"} pointer-events-none opacity-70`} aria-disabled="true">
        {label}
      </span>
      {body && !compact && <p className="mt-2 text-sm opacity-80">{body}</p>}
    </div>
  );
  switch (cta.kind) {
    case "ended":
      return null;
    case "no_survey":
      return muted("Survey coming soon", "The survey for this event hasn't been published yet. Check back soon.");
    case "not_open":
      return muted(opensLabel("Survey", cta.opensAt));
    case "deadline_passed":
    case "closed":
      return muted("Survey closed");
    case "open": {
      const codesOut = cta.codes === "exhausted";
      return (
        <div>
          {codesOut && (
            <p className={`mb-2 text-sm font-semibold ${compact ? "text-[var(--color-ink)]" : ""}`}>
              Codes all claimed
            </p>
          )}
          <Link href={`/survey/${cta.surveyId}`} className="btn btn-primary">
            {codesOut ? "Take the survey anyway" : "Start survey"}
          </Link>
          {!compact && (cta.full || codesOut) && (
            <p className="mt-2 text-sm opacity-80">
              {codesOut
                ? "Every discount code has been claimed. Your answers still count, but a code isn't guaranteed."
                : "This survey has reached its participant limit. Late responses are reviewed, and a code isn't guaranteed."}
            </p>
          )}
        </div>
      );
    }
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card mt-8 p-6 md:p-8">
      <h2 className="mb-4 font-display text-xl font-semibold text-[var(--color-ink)]">{title}</h2>
      {children}
    </section>
  );
}

function Prose({ text }: { text: string }) {
  return <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-[var(--color-ink-soft)]">{text}</p>;
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">{children}</dl>;
}

/** Renders nothing when there's no value — never an empty label. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === false || children === "") return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="mt-0.5 text-[var(--color-ink)]">{children}</dd>
    </div>
  );
}

function Bullets({ lines }: { lines: (string | null | undefined)[] }) {
  const shown = lines.map((l) => l?.trim()).filter((l): l is string => !!l);
  if (shown.length === 0) return null;
  return (
    <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-[var(--color-ink-soft)]">
      {shown.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
