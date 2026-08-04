"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner } from "@/components/onboarding/parts";
import { FileDrop } from "@/components/ui/FileDrop";
import { BANNER_HINT, IMAGE_HINT } from "@/lib/upload-limits";
import { EVENT_TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/event-time";
import { computePlatformFee, netSponsorshipBudget } from "@/lib/constants";
import { createSponsoredEvent, type SponsoredState } from "../actions";

export interface ListingOption {
  id: string;
  name: string;
  eventDate: string | null;
  startTime: string | null;
  timezone: string;
  venue: string | null;
  location: string | null;
  ticketPrice: number | null;
  capacity: number | null;
  imageUrl: string | null;
  artistName: string | null;
}

export interface CampaignOption {
  id: string;
  label: string;
  budget: number;
}

/** How many branding creatives a sponsorship can carry. */
const ASSET_SLOTS = 5;

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Creating…" : "Create sponsored event"}
    </button>
  );
}

export function SponsoredEventForm({
  mode = "brand",
  listings,
  campaigns,
  brandLogoUrl,
}: {
  /** Who is initiating. Drives which side the campaign picker identifies. */
  mode?: "brand" | "artist";
  listings: ListingOption[];
  campaigns: CampaignOption[];
  brandLogoUrl: string | null;
}) {
  const isBrand = mode === "brand";
  const [state, formAction] = useActionState<SponsoredState, FormData>(
    createSponsoredEvent,
    {},
  );

  const [listingId, setListingId] = useState("");
  const [budget, setBudget] = useState<number | "">("");
  const [ticketPrice, setTicketPrice] = useState<number | "">("");

  const listing = useMemo(
    () => listings.find((l) => l.id === listingId) ?? null,
    [listingId, listings],
  );

  /**
   * Picking a listing refills the event fields. Keyed so React remounts the
   * inputs and picks up the new defaultValue — otherwise the old value sticks.
   */
  const fillKey = listing?.id ?? "blank";

  const effectiveTicket =
    ticketPrice === "" ? (listing?.ticketPrice ?? null) : Number(ticketPrice);

  // The service fee comes off the top, so the reward pot — and everything
  // derived from it — works off the net figure, never the gross budget.
  const fee = budget !== "" && budget > 0 ? computePlatformFee(Number(budget)) : null;
  const netBudget = budget === "" ? null : netSponsorshipBudget(Number(budget));
  const sponsorableCount =
    netBudget != null && effectiveTicket != null && effectiveTicket > 0
      ? Math.floor(netBudget / effectiveTicket)
      : null;

  return (
    <form action={formAction} className="space-y-6">
      <ErrorBanner error={state.error} />

      <FormSection
        title="Link the match"
        description="Choosing a listed event fills in its details and links the artist automatically."
      >
        <Field label="Linked event listing" htmlFor="listing_id">
          <select
            id="listing_id"
            name="listing_id"
            className="select"
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
          >
            <option value="">None — enter details manually</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.artistName ? ` — ${l.artistName}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Artist / act name"
          htmlFor="artist_display_name"
          hint="Shown on the sponsorship alongside your brand."
        >
          <input
            key={`artist-${fillKey}`}
            id="artist_display_name"
            name="artist_display_name"
            className="input"
            defaultValue={listing?.artistName ?? ""}
          />
        </Field>

        <Field
          label={isBrand ? "Linked campaign" : "Brand's campaign brief"}
          htmlFor="campaign_id"
          required={!isBrand}
          hint={
            isBrand
              ? undefined
              : "Which brief you're proposing against — this is how we know which brand to send it to."
          }
        >
          <select
            id="campaign_id"
            name="campaign_id"
            className="select"
            required={!isBrand}
            defaultValue=""
          >
            <option value="">{isBrand ? "None" : "Select a campaign…"}</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </FormSection>

      <FormSection title="Event details">
        <Field label="Event name" htmlFor="name" required>
          <input
            key={`name-${fillKey}`}
            id="name"
            name="name"
            className="input"
            required
            defaultValue={listing?.name ?? ""}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Event date" htmlFor="event_date">
            <input
              key={`date-${fillKey}`}
              id="event_date"
              name="event_date"
              type="date"
              className="input"
              defaultValue={listing?.eventDate ?? ""}
            />
          </Field>
          <Field label="Start time" htmlFor="start_time" hint="Local to the venue.">
            <input
              key={`time-${fillKey}`}
              id="start_time"
              name="start_time"
              type="time"
              className="input"
              defaultValue={listing?.startTime?.slice(0, 5) ?? ""}
            />
          </Field>
          <Field
            label="Time zone"
            htmlFor="timezone"
            hint="Everyone sees the venue's local time; GMT/BST switches are handled automatically."
          >
            <select
              key={`tz-${fillKey}`}
              id="timezone"
              name="timezone"
              className="select"
              defaultValue={listing?.timezone ?? DEFAULT_TIMEZONE}
            >
              {EVENT_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Ticket price (GBP)"
            htmlFor="ticket_price_gbp"
            hint="Used to work out how many people the budget can cover."
          >
            <input
              key={`ticket-${fillKey}`}
              id="ticket_price_gbp"
              name="ticket_price_gbp"
              type="number"
              min={0}
              step="0.01"
              className="input"
              defaultValue={listing?.ticketPrice ?? ""}
              onChange={(e) =>
                setTicketPrice(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
            />
          </Field>
        </div>
        <Field label="Venue details" htmlFor="venue_details">
          <input
            key={`venue-${fillKey}`}
            id="venue_details"
            name="venue_details"
            className="input"
            defaultValue={listing?.venue ?? ""}
          />
        </Field>
        <Field label="Location" htmlFor="location">
          <input
            key={`loc-${fillKey}`}
            id="location"
            name="location"
            className="input"
            placeholder="City, Country"
            defaultValue={listing?.location ?? ""}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Event banner / artwork"
        description="Either side can supply the creative — upload the final artwork here once it's agreed. Until then we'll show the artist's and your brand's profile images side by side."
      >
        <Field label="Banner image" htmlFor="banner">
          <FileDrop
            name="banner"
            hint={BANNER_HINT}
            currentUrl={listing?.imageUrl ?? brandLogoUrl}
            label="Drag the event artwork here, or click to browse"
          />
        </Field>
      </FormSection>

      <FormSection
        title="Branding"
        description="Branding guidelines and assets for this sponsorship. The Live·En·Synergy team also uses these for branded emails to participants and for display on the portal."
      >
        <Field
          label="Branding guidelines"
          htmlFor="branding_guidelines"
          hint="How your brand and the artist should appear together — logo placement, colours, tone, anything off-limits."
        >
          <textarea
            id="branding_guidelines"
            name="branding_guidelines"
            className="textarea"
            rows={4}
          />
        </Field>

        <div className="grid gap-3">
          <p className="field-hint">
            Upload up to {ASSET_SLOTS} images, and say what each one is.
          </p>
          {Array.from({ length: ASSET_SLOTS }, (_, i) => (
            <div
              key={i}
              className="grid gap-3 rounded-xl border border-black/10 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            >
              <FileDrop
                name={`asset_${i}`}
                hint={i === 0 ? IMAGE_HINT : undefined}
                label={`Asset ${i + 1}`}
              />
              <div>
                <label className="field-label" htmlFor={`asset_desc_${i}`}>
                  What is this?
                </label>
                <input
                  id={`asset_desc_${i}`}
                  name={`asset_desc_${i}`}
                  className="input"
                  placeholder="e.g. brand logo, artist performance image"
                />
              </div>
            </div>
          ))}
        </div>
      </FormSection>

      <FormSection title="Sponsorship">
        <Field
          label="Budget (GBP)"
          htmlFor="budget_gbp"
          hint="The gross amount committed. The Live·En·Synergy service fee comes out of this — the breakdown below shows what's left for audience rewards."
        >
          <input
            id="budget_gbp"
            name="budget_gbp"
            type="number"
            min={0}
            step="0.01"
            className="input"
            value={budget}
            onChange={(e) =>
              setBudget(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </Field>

        {fee && netBudget != null && (
          <div className="rounded-xl bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
            <p>
              Service fee{" "}
              <span className="font-semibold">£{fee.feeIncVat.toLocaleString("en-GB", { maximumFractionDigits: 0 })}</span>{" "}
              inc. VAT · available for rewards{" "}
              <span className="font-semibold">
                £{netBudget.toLocaleString("en-GB", { maximumFractionDigits: 0 })}
              </span>
            </p>
            {sponsorableCount != null && (
              <p className="mt-1">
                At £{effectiveTicket!.toLocaleString("en-GB")} a ticket, that
                covers roughly{" "}
                <span className="font-semibold">
                  {sponsorableCount.toLocaleString("en-GB")}
                </span>{" "}
                {sponsorableCount === 1 ? "person" : "people"}.
              </p>
            )}
          </div>
        )}

        <Field
          label="Reward rules"
          htmlFor="reward_rules"
          hint="e.g. first 50 sign-ups get a full ticket refund"
        >
          <textarea id="reward_rules" name="reward_rules" className="textarea" />
        </Field>
        <Field label="Sponsorship terms" htmlFor="terms">
          <textarea id="terms" name="terms" className="textarea" />
        </Field>
      </FormSection>

      <FormSection
        title="Audience participation"
        description="How audience members join, and how their attendance gets confirmed."
      >
        <Field
          label="Participation deadline"
          htmlFor="participation_deadline"
          hint="Date and time after which no new sign-ups are accepted."
        >
          <input
            id="participation_deadline"
            name="participation_deadline"
            type="datetime-local"
            className="input"
          />
        </Field>
        <Field
          label="How will the audience confirm physical attendance?"
          htmlFor="attendance_method"
          hint="See the general FAQs if you're not sure — the team can help set this up."
        >
          <textarea
            id="attendance_method"
            name="attendance_method"
            className="textarea"
            rows={3}
            placeholder="Artist will provide confirmation after ticket scan at the box office, or display a QR code at the venue."
          />
        </Field>
      </FormSection>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
