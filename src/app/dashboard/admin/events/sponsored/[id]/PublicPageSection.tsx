import Link from "next/link";
import { displayUrl } from "@/lib/urls";
import type { EventPageCopy } from "@/lib/public-event";
import { savePublicEventPage } from "../../../marketplace-actions";

/**
 * The team's copy for the public event page (GitHub #48, 0095). Every field
 * is optional; a blank one is left off the page. The page itself only shows
 * once the event is confirmed and its campaign is paid and live.
 */
export function PublicPageSection({
  eventId,
  copy,
  isPublic,
  listingTicketUrl,
  notice,
  errorMessage,
}: {
  eventId: string;
  copy: EventPageCopy | null;
  isPublic: boolean;
  listingTicketUrl: string | null;
  notice: string | undefined;
  errorMessage: string | undefined;
}) {
  const tri = (v: boolean | null | undefined) => (v == null ? "" : v ? "yes" : "no");
  return (
    <div id="public-page" className="card scroll-mt-24 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">Public event page</h2>
        {isPublic ? (
          <Link href={`/events/${eventId}`} target="_blank" className="text-sm font-semibold text-[var(--color-brand-dark)]">
            Open public page ↗
          </Link>
        ) : (
          <span className="text-sm text-[var(--color-ink-soft)]">
            Not public yet — shows once the event is confirmed and its campaign is paid and open.
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Event details, the discount and the survey link come from the event, its reward tiers and the campaign&apos;s
        published survey. Add anything else here. Blank fields are left off the page.
      </p>

      {notice === "page_saved" && (
        <p className="mt-3 rounded-lg bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          ✓ Public page details saved.
        </p>
      )}
      {notice === "page_error" && (
        <p className="mt-3 rounded-lg bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          {errorMessage || "Couldn't save the page details."}
        </p>
      )}

      <form action={savePublicEventPage} className="mt-5 space-y-6">
        <input type="hidden" name="event_id" value={eventId} />

        <fieldset className="space-y-3">
          <legend className="font-semibold">About the event</legend>
          <label className="block">
            <span className="field-label">Event description</span>
            <textarea name="event_description" rows={3} className="textarea mt-1" defaultValue={copy?.event_description ?? ""} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Age restriction</span>
              <input name="age_restriction" className="input mt-1" placeholder="e.g. 18+ (ID required)" defaultValue={copy?.age_restriction ?? ""} />
            </label>
            <label className="block">
              <span className="field-label">Official ticket link</span>
              <input name="ticket_url" className="input mt-1" defaultValue={displayUrl(copy?.ticket_url)} />
              {listingTicketUrl && (
                <span className="field-hint">Blank uses the listing&apos;s link: {displayUrl(listingTicketUrl)}</span>
              )}
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold">About the research campaign</legend>
          <label className="block">
            <span className="field-label">What the survey is about</span>
            <textarea name="research_about" rows={2} className="textarea mt-1" defaultValue={copy?.research_about ?? ""} />
            <span className="field-hint">Blank uses the survey&apos;s own description.</span>
          </label>
          <label className="block">
            <span className="field-label">Why the brand wants feedback</span>
            <textarea name="research_why" rows={2} className="textarea mt-1" defaultValue={copy?.research_why ?? ""} />
          </label>
          <label className="block">
            <span className="field-label">Approximate time to complete (minutes)</span>
            <input name="survey_minutes" type="number" min={1} max={120} className="input mt-1 w-[8rem]" defaultValue={copy?.survey_minutes ?? ""} />
          </label>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold">Your ticket discount</legend>
          <label className="block">
            <span className="field-label">Eligible ticket categories</span>
            <input name="eligible_tickets" className="input mt-1" placeholder="e.g. General admission and VIP" defaultValue={copy?.eligible_tickets ?? ""} />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["booking_fees_excluded", "Booking fees excluded?", copy?.booking_fees_excluded],
                ["single_use", "Single use?", copy?.single_use],
                ["combinable", "Combines with other offers?", copy?.combinable],
              ] as const
            ).map(([name, label, value]) => (
              <label key={name} className="block">
                <span className="field-label">{label}</span>
                <select name={name} className="select mt-1" defaultValue={tri(value)}>
                  <option value="">Not stated</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>
            ))}
          </div>
          <label className="block">
            <span className="field-label">Code limits</span>
            <input name="code_limit_note" className="input mt-1" placeholder="e.g. One code per person, while codes last" defaultValue={copy?.code_limit_note ?? ""} />
          </label>
          <label className="block">
            <span className="field-label">Extra offer lines</span>
            <textarea name="offer_lines" rows={3} className="textarea mt-1" defaultValue={(copy?.offer_lines ?? []).join("\n")} />
            <span className="field-hint">One per line. Expiry and where to redeem come from the reward tiers.</span>
          </label>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold">Eligibility</legend>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Always shown: 18 or over and a UK resident, and the quality check.
          </p>
          <label className="block">
            <span className="field-label">Participation limit</span>
            <input name="participation_limit" className="input mt-1" placeholder="One response per person." defaultValue={copy?.participation_limit ?? ""} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="account_required" defaultChecked={copy?.account_required ?? false} />
            A Live·En·Synergy account is needed to take part
          </label>
          <label className="block">
            <span className="field-label">Extra eligibility lines</span>
            <textarea name="eligibility_lines" rows={3} className="textarea mt-1" defaultValue={(copy?.eligibility_lines ?? []).join("\n")} />
            <span className="field-hint">One per line.</span>
          </label>
        </fieldset>

        <button type="submit" className="btn btn-primary">
          Save page details
        </button>
      </form>
    </div>
  );
}
