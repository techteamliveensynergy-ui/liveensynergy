"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner } from "@/components/onboarding/parts";
import { FileDrop } from "@/components/ui/FileDrop";
import { IMAGE_HINT } from "@/lib/upload-limits";
import { EVENT_TIMEZONES, DEFAULT_TIMEZONE } from "@/lib/event-time";
import { EVENT_CATEGORIES, BUDGET_RANGES } from "@/lib/constants";
import type { EventListing } from "@/lib/types";
import {
  createListing,
  updateListing,
  type ListingState,
} from "./actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function ListingForm({ listing }: { listing?: EventListing }) {
  const editing = Boolean(listing);
  const action = editing ? updateListing : createListing;
  const [state, formAction] = useActionState<ListingState, FormData>(
    action,
    {},
  );
  const d = listing;

  return (
    <form action={formAction} className="space-y-6">
      {editing && <input type="hidden" name="id" value={listing!.id} />}
      <ErrorBanner error={state.error} />

      <FormSection title="Event details">
        <Field label="Event / act name" htmlFor="name" required>
          <input
            id="name"
            name="name"
            className="input"
            required
            defaultValue={d?.name ?? ""}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Event date" htmlFor="event_date">
            <input
              id="event_date"
              name="event_date"
              type="date"
              className="input"
              defaultValue={d?.event_date ?? ""}
            />
          </Field>
          <Field label="Start time" htmlFor="start_time" hint="Local to the venue.">
            <input
              id="start_time"
              name="start_time"
              type="time"
              className="input"
              defaultValue={d?.start_time?.slice(0, 5) ?? ""}
            />
          </Field>
          <Field
            label="Time zone"
            htmlFor="timezone"
            hint="Shown to everyone in the venue's own time — GMT/BST switches are handled for you."
          >
            <select
              id="timezone"
              name="timezone"
              className="select"
              defaultValue={d?.timezone ?? DEFAULT_TIMEZONE}
            >
              {EVENT_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category">
            <select
              id="category"
              name="category"
              className="select"
              defaultValue={d?.category ?? ""}
            >
              <option value="">Select…</option>
              {EVENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          label="Event image"
          htmlFor="image"
          hint="Shown on your listing and to sponsors browsing Discover events."
        >
          <FileDrop
            name="image"
            hint={IMAGE_HINT}
            currentUrl={d?.image_url ?? null}
            label="Drag your event artwork here, or click to browse"
          />
        </Field>
        <Field label="Venue name" htmlFor="venue_name">
          <input
            id="venue_name"
            name="venue_name"
            className="input"
            defaultValue={d?.venue_name ?? ""}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" htmlFor="city">
            <input
              id="city"
              name="city"
              className="input"
              defaultValue={d?.city ?? ""}
            />
          </Field>
          <Field label="Country" htmlFor="country">
            <input
              id="country"
              name="country"
              className="input"
              defaultValue={d?.country ?? ""}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Tickets & capacity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Capacity" htmlFor="capacity">
            <input
              id="capacity"
              name="capacity"
              type="number"
              min={0}
              className="input"
              defaultValue={d?.capacity ?? ""}
            />
          </Field>
          <Field
            label="Ticket price (GBP)"
            htmlFor="ticket_price_gbp"
            hint="Including taxes and any charges."
          >
            <input
              id="ticket_price_gbp"
              name="ticket_price_gbp"
              type="number"
              min={0}
              step="0.01"
              className="input"
              defaultValue={d?.ticket_price_gbp ?? ""}
            />
          </Field>
        </div>
        <Field label="Ticket buying link" htmlFor="ticket_buy_url">
          <input
            id="ticket_buy_url"
            name="ticket_buy_url"
            type="text"
            inputMode="url"
            className="input"
            placeholder="https://…"
            defaultValue={d?.ticket_buy_url ?? ""}
          />
        </Field>
      </FormSection>

      <FormSection title="Sponsorship">
        <Field label="Sponsorship budget range" htmlFor="budget_range">
          <select
            id="budget_range"
            name="budget_range"
            className="select"
            defaultValue={d?.budget_range ?? ""}
          >
            <option value="">Select…</option>
            {BUDGET_RANGES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Existing sponsors" htmlFor="existing_sponsors">
          <input
            id="existing_sponsors"
            name="existing_sponsors"
            className="input"
            placeholder="Mention n/a if none"
            defaultValue={d?.existing_sponsors ?? ""}
          />
        </Field>
        <Field
          label="Benefit to sponsors"
          htmlFor="sponsor_benefits"
          hint="e.g. branding on creatives, social content, mentions, onsite banners, merch stations"
        >
          <textarea
            id="sponsor_benefits"
            name="sponsor_benefits"
            className="textarea"
            defaultValue={d?.sponsor_benefits ?? ""}
          />
        </Field>
        <label className="flex items-center gap-3 rounded-lg bg-[var(--color-mist)] px-4 py-3 text-sm">
          <input
            type="checkbox"
            name="make_available"
            defaultChecked={d?.status === "available"}
            className="h-4 w-4"
          />
          Make this event available for sponsorship now (otherwise saved as a
          draft)
        </label>
      </FormSection>

      <div className="flex justify-end">
        <Submit label={editing ? "Save changes" : "Create event"} />
      </div>
    </form>
  );
}
