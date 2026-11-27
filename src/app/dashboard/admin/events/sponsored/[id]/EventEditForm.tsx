"use client";

import { useActionState } from "react";
import { ukLocalInputValue } from "@/lib/format";
import { Field } from "@/components/ui/Field";
import { ErrorBanner, SuccessBanner } from "@/components/onboarding/parts";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { EVENT_CATEGORIES } from "@/lib/constants";
import { VenuePicker } from "@/components/ui/VenuePicker";
import {
  DEFAULT_CHECKIN_RADIUS_M,
  MAX_CHECKIN_RADIUS_MILES,
  MIN_CHECKIN_RADIUS_MILES,
  metresToMiles,
  type VenueLocation,
} from "@/lib/venue";
import { useState } from "react";
import {
  adminUpdateSponsoredEvent,
  type AdminState,
} from "../../../actions";

export interface EventEditDefaults {
  id: string;
  name: string;
  event_date: string | null;
  start_time: string | null;
  venue_details: string | null;
  location: string | null;
  budget_gbp: number | null;
  participation_deadline: string | null;
  terms: string | null;
  reward_rules: string | null;
  branding_guidelines: string | null;
  attendance_method: string | null;
  /** Both live on the linked event listing, not the sponsorship itself. */
  ticket_price_gbp: number | null;
  capacity: number | null;
  /** The listing's event category (FB-00004). */
  category: string | null;
  /** Null when the sponsorship has no listing behind it. */
  listing_name: string | null;
  /** Where in-app check-in measures from, and how far it reaches (0126). */
  venue: VenueLocation;
  checkin_radius_m: number | null;
}

/**
 * Admin override of a sponsorship's details.
 *
 * Neither party can edit a confirmed deal themselves, so this is the only way
 * to move a participation deadline that has already passed, or correct a
 * budget or set of terms, without unpicking the agreement. Saving always goes
 * through a confirmation — these are two other people's agreed terms.
 */
export function EventEditForm({
  event,
  parties,
  placesEnabled = false,
}: {
  event: EventEditDefaults;
  /** Shown in the confirmation, so it's clear whose deal is being changed. */
  parties: string;
  /** Google Places is configured — otherwise the venue is entered as coordinates. */
  placesEnabled?: boolean;
}) {
  const [state, formAction] = useActionState<AdminState, FormData>(
    adminUpdateSponsoredEvent,
    {},
  );
  const [budget, setBudget] = useState<number | "">(event.budget_gbp ?? "");
  const [radiusMiles, setRadiusMiles] = useState<number | "">(
    metresToMiles(event.checkin_radius_m ?? DEFAULT_CHECKIN_RADIUS_M),
  );

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <input type="hidden" name="id" value={event.id} />
      <ErrorBanner error={state.error} />
      <SuccessBanner show={state.success} />

      <Field label="Event name" htmlFor="edit-name" required>
        <input
          id="edit-name"
          name="name"
          className="input"
          required
          defaultValue={event.name}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Event date" htmlFor="edit-date">
          <input
            id="edit-date"
            name="event_date"
            type="date"
            className="input"
            defaultValue={event.event_date ?? ""}
          />
        </Field>
        <Field label="Start time" htmlFor="edit-time" hint="Local to the venue.">
          <input
            id="edit-time"
            name="start_time"
            type="time"
            className="input"
            defaultValue={event.start_time?.slice(0, 5) ?? ""}
          />
        </Field>
        <Field label="Venue" htmlFor="edit-venue">
          <input
            id="edit-venue"
            name="venue_details"
            className="input"
            defaultValue={event.venue_details ?? ""}
          />
        </Field>
        <Field label="Location" htmlFor="edit-location">
          <input
            id="edit-location"
            name="location"
            className="input"
            placeholder="City, Country"
            defaultValue={event.location ?? ""}
          />
        </Field>
        <Field
          label="Participation deadline"
          htmlFor="edit-deadline"
          hint="Can be moved after it has passed — that's what this form is for."
        >
          <input
            id="edit-deadline"
            name="participation_deadline"
            type="datetime-local"
            className="input"
            defaultValue={ukLocalInputValue(event.participation_deadline)}
          />
        </Field>
        <Field
          label="Package value (GBP)"
          htmlFor="edit-budget"
        >
          <input
            id="edit-budget"
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

        {/* Ticket price and capacity are the listing's, and this is the only
            place they can be corrected once a deal is confirmed — the parties
            can't edit a confirmed partnership, and the ticket price is what
            "people this can cover" divides by. */}
        {event.listing_name !== null && (
          <>
            <Field
              label="Ticket price (GBP)"
              htmlFor="edit-ticket-price"
              hint={`Saved on the listing “${event.listing_name}”. Sets how many people the budget can cover.`}
            >
              <input
                id="edit-ticket-price"
                name="ticket_price_gbp"
                type="number"
                min={0}
                step="0.01"
                className="input"
                defaultValue={event.ticket_price_gbp ?? ""}
              />
            </Field>
            <Field
              label="Capacity"
              htmlFor="edit-capacity"
              hint="Total seats at the venue, as listed by the artist / organiser."
            >
              <input
                id="edit-capacity"
                name="capacity"
                type="number"
                min={0}
                step={1}
                className="input"
                defaultValue={event.capacity ?? ""}
              />
            </Field>
            <Field
              label="Category"
              htmlFor="edit-category"
              hint="The listing's event category, as shown to audiences and partners."
            >
              <select
                id="edit-category"
                name="category"
                className="select"
                defaultValue={event.category ?? ""}
              >
                <option value="">Not set</option>
                {/* Keep a stored value that isn't in today's list (an older
                    category) selectable, so saving doesn't silently clear it. */}
                {event.category && !(EVENT_CATEGORIES as readonly string[]).includes(event.category) && (
                  <option value={event.category}>{event.category}</option>
                )}
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </div>

      {/* In-app check-in (0126): where it measures from and how far it reaches. */}
      <div id="venue-location" className="scroll-mt-24 space-y-4 rounded-xl border border-black/10 p-4">
        <Field
          label="Venue location (for in-app check-in)"
          htmlFor="edit-venue-search"
          hint="Attendees can check in from My events on the day when their phone is within the radius of this pin. Without a location they can only check in with the QR code."
        >
          <VenuePicker
            id="edit-venue-search"
            placesEnabled={placesEnabled}
            initial={event.venue}
            radiusM={typeof radiusMiles === "number" ? radiusMiles * 1609.344 : undefined}
          />
        </Field>
        <Field
          label="Check-in radius (miles)"
          htmlFor="edit-checkin-radius"
          hint={`Default 2 miles. Widen it for a festival site or a venue with poor phone signal; ${MIN_CHECKIN_RADIUS_MILES}–${MAX_CHECKIN_RADIUS_MILES} miles.`}
        >
          <input
            id="edit-checkin-radius"
            name="checkin_radius_miles"
            type="number"
            min={MIN_CHECKIN_RADIUS_MILES}
            max={MAX_CHECKIN_RADIUS_MILES}
            step={0.1}
            className="input sm:w-40"
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </Field>
      </div>

      <Field label="Reward rules" htmlFor="edit-reward-rules">
        <textarea
          id="edit-reward-rules"
          name="reward_rules"
          className="textarea"
          defaultValue={event.reward_rules ?? ""}
        />
      </Field>
      <Field label="Partnership terms" htmlFor="edit-terms">
        <textarea
          id="edit-terms"
          name="terms"
          className="textarea"
          defaultValue={event.terms ?? ""}
        />
      </Field>
      <Field label="Branding guidelines" htmlFor="edit-branding">
        <textarea
          id="edit-branding"
          name="branding_guidelines"
          className="textarea"
          defaultValue={event.branding_guidelines ?? ""}
        />
      </Field>
      <Field
        label="How attendance is confirmed"
        htmlFor="edit-attendance-method"
      >
        <textarea
          id="edit-attendance-method"
          name="attendance_method"
          className="textarea"
          defaultValue={event.attendance_method ?? ""}
        />
      </Field>

      <div className="flex justify-end">
        <ConfirmSubmit
          label="Save event details"
          title="Change this sponsorship?"
          body={
            <>
              You&apos;re editing terms that {parties} have already agreed
              between themselves. Both sides will see the new details
              immediately. Save these changes?
            </>
          }
          confirmLabel="Yes, save changes"
        />
      </div>
    </form>
  );
}
