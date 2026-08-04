"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { ErrorBanner, SuccessBanner } from "@/components/onboarding/parts";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { computePlatformFee } from "@/lib/constants";
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
}

/** `datetime-local` needs `YYYY-MM-DDTHH:mm`, not a full ISO string. */
function toLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
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
}: {
  event: EventEditDefaults;
  /** Shown in the confirmation, so it's clear whose deal is being changed. */
  parties: string;
}) {
  const [state, formAction] = useActionState<AdminState, FormData>(
    adminUpdateSponsoredEvent,
    {},
  );
  const [budget, setBudget] = useState<number | "">(event.budget_gbp ?? "");
  const fee = budget !== "" && budget > 0 ? computePlatformFee(Number(budget)) : null;

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
            defaultValue={toLocalInputValue(event.participation_deadline)}
          />
        </Field>
        <Field
          label="Budget (gross, GBP)"
          htmlFor="edit-budget"
          hint={
            fee
              ? `Service fee £${fee.feeIncVat.toLocaleString("en-GB", { maximumFractionDigits: 0 })} inc. VAT · £${Math.max(
                  0,
                  fee.availableForSponsorship,
                ).toLocaleString("en-GB", { maximumFractionDigits: 0 })} for rewards`
              : "Changing this re-derives what's left for rewards."
          }
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
      </div>

      <Field label="Reward rules" htmlFor="edit-reward-rules">
        <textarea
          id="edit-reward-rules"
          name="reward_rules"
          className="textarea"
          defaultValue={event.reward_rules ?? ""}
        />
      </Field>
      <Field label="Sponsorship terms" htmlFor="edit-terms">
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
