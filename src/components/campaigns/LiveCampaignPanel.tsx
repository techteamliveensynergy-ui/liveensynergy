import type { ReactNode } from "react";
import Link from "next/link";

/**
 * The "live campaign" block from the Admin Portal brief (9 Oct). One
 * component for all three viewers; each page passes only what that role may
 * see, and the database enforces the same rules (0054/0058 order-form brief,
 * 0060 survey links, party code view and brand results):
 *
 *   order form        admin + brand: full · artist: "ok for artist" sections only
 *   survey links      admin, brand, artist
 *   participants      admin, brand, artist (totals)
 *   codes issued      admin, brand, artist (counts — who got which is admin-only)
 *   survey results    admin + brand only (brand: aggregated, anonymised)
 *   check-in          admin + artist (and the audience, at the venue)
 */

export type LiveCampaignViewer = "admin" | "brand" | "artist";

export interface LiveCampaignSurvey {
  id: string;
  kind: string; // pre_event | post_event
  title: string;
  status: string; // published | archived
  is_public: boolean;
  /** Counted responses, when the viewer may see it. */
  responses?: number | null;
  resultsHref?: string | null;
}

export interface LiveCampaignPanelProps {
  viewer: LiveCampaignViewer;
  siteUrl: string;
  orderForm: { href: string; label: string; note?: string } | null;
  surveys: LiveCampaignSurvey[];
  participants: { total: number; verified: number; surveysCompleted?: number | null };
  codes: { issued: number; redeemed: number; tiers: number; consented: boolean } | null;
  checkIn?: { href: string; note?: string } | null;
  /** Admin-only extras, e.g. links to the per-person code list. */
  adminLinks?: { href: string; label: string }[];
}

const WHO: Record<string, string> = {
  order: "Brand: full form · Artist: permitted sections only",
  survey: "Brand and artist",
  participants: "Brand and artist (totals)",
  codes: "Brand and artist see counts; which participant got which code is admin-only",
  results: "Brand only (aggregated, anonymised)",
  checkin: "Artist and audience",
};

function Item({
  title,
  who,
  showWho,
  children,
}: {
  title: string;
  who: string;
  showWho: boolean;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-[var(--color-mist)]/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{title}</p>
      <div className="mt-1.5 text-sm">{children}</div>
      {showWho && <p className="mt-2 text-[11px] text-[var(--color-ink-soft)]">Visible to: {who}</p>}
    </div>
  );
}

function surveyLink(siteUrl: string, s: LiveCampaignSurvey): { href: string; note: string } | null {
  if (s.status !== "published") return null;
  return s.is_public
    ? { href: `${siteUrl}/survey/${s.id}`, note: "Public link — anyone with it can respond" }
    : { href: `${siteUrl}/dashboard/surveys/${s.id}`, note: "Participants open it from their account" };
}

function SurveyBlock({
  label,
  survey,
  siteUrl,
  viewer,
}: {
  label: string;
  survey: LiveCampaignSurvey | undefined;
  siteUrl: string;
  viewer: LiveCampaignViewer;
}) {
  if (!survey) return <p className="text-[var(--color-ink-soft)]">No {label.toLowerCase()} published yet.</p>;
  const link = surveyLink(siteUrl, survey);
  return (
    <>
      <p className="font-medium">{survey.title}</p>
      {link ? (
        <>
          <a href={link.href} target="_blank" rel="noopener noreferrer" className="break-all text-[var(--color-brand-dark)] underline">
            {link.href.replace(/^https?:\/\//, "")}
          </a>
          <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{link.note}</p>
        </>
      ) : (
        <p className="text-[var(--color-ink-soft)]">Closed</p>
      )}
      {survey.responses != null && (
        <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
          {survey.responses} response{survey.responses === 1 ? "" : "s"} counted
        </p>
      )}
      {viewer !== "artist" && survey.resultsHref && (
        <Link href={survey.resultsHref} className="mt-1 inline-block text-xs font-semibold text-[var(--color-brand-dark)] underline">
          {viewer === "admin" ? "Results & downloads →" : "View results →"}
        </Link>
      )}
    </>
  );
}

export function LiveCampaignPanel(props: LiveCampaignPanelProps) {
  const { viewer, siteUrl, orderForm, surveys, participants, codes, checkIn, adminLinks } = props;
  const showWho = viewer === "admin";
  const pre = surveys.find((s) => s.kind === "pre_event");
  const post = surveys.find((s) => s.kind === "post_event");

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Live campaign</h2>
        {viewer === "admin" && (
          <p className="text-xs text-[var(--color-ink-soft)]">Each box shows who else can see it.</p>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Item title="Order form" who={WHO.order} showWho={showWho}>
          {orderForm ? (
            <>
              <Link href={orderForm.href} className="font-semibold text-[var(--color-brand-dark)] underline">
                {orderForm.label}
              </Link>
              {orderForm.note && <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{orderForm.note}</p>}
            </>
          ) : (
            <p className="text-[var(--color-ink-soft)]">No order form yet.</p>
          )}
        </Item>

        <Item title="Pre-event survey" who={WHO.survey} showWho={showWho}>
          <SurveyBlock label="Pre-event survey" survey={pre} siteUrl={siteUrl} viewer={viewer} />
        </Item>

        <Item title="Post-event survey" who={WHO.survey} showWho={showWho}>
          <SurveyBlock label="Post-event survey" survey={post} siteUrl={siteUrl} viewer={viewer} />
        </Item>

        <Item title="Participants" who={WHO.participants} showWho={showWho}>
          <p className="font-display text-2xl font-semibold">{participants.total}</p>
          <p className="text-xs text-[var(--color-ink-soft)]">
            {participants.verified} attendance verified
            {participants.surveysCompleted != null ? ` · ${participants.surveysCompleted} surveys completed` : ""}
          </p>
        </Item>

        <Item title="Discount codes" who={WHO.codes} showWho={showWho}>
          {codes && codes.tiers > 0 ? (
            <>
              <p className="font-display text-2xl font-semibold">{codes.issued}</p>
              <p className="text-xs text-[var(--color-ink-soft)]">
                issued · {codes.redeemed} redeemed · {codes.consented ? "artist confirmed the codes" : "awaiting artist confirmation"}
              </p>
            </>
          ) : (
            <p className="text-[var(--color-ink-soft)]">No discount codes set up yet.</p>
          )}
          {viewer === "admin" &&
            adminLinks?.map((l) => (
              <Link key={l.href} href={l.href} className="mt-1 block text-xs font-semibold text-[var(--color-brand-dark)] underline">
                {l.label}
              </Link>
            ))}
        </Item>

        {viewer !== "brand" && (
          <Item title="Check-in" who={WHO.checkin} showWho={showWho}>
            {checkIn ? (
              <>
                <Link href={checkIn.href} className="font-semibold text-[var(--color-brand-dark)] underline">
                  Venue check-in QR
                </Link>
                {checkIn.note && <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{checkIn.note}</p>}
              </>
            ) : (
              <p className="text-[var(--color-ink-soft)]">Available once the sponsorship is confirmed.</p>
            )}
          </Item>
        )}

        {viewer !== "artist" && (
          <Item title="Survey results & analysis" who={WHO.results} showWho={showWho}>
            {surveys.some((s) => s.resultsHref) ? (
              <div className="space-y-1">
                {surveys
                  .filter((s) => s.resultsHref)
                  .map((s) => (
                    <Link key={s.id} href={s.resultsHref!} className="block font-semibold text-[var(--color-brand-dark)] underline">
                      {s.kind === "pre_event" ? "Pre-event" : "Post-event"} results →
                    </Link>
                  ))}
                {viewer === "brand" && (
                  <p className="text-xs text-[var(--color-ink-soft)]">Totals only — no names or individual answers.</p>
                )}
              </div>
            ) : (
              <p className="text-[var(--color-ink-soft)]">Results appear once a survey is published.</p>
            )}
          </Item>
        )}
      </div>
    </section>
  );
}
