"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner } from "@/components/onboarding/parts";
import { FileDrop } from "@/components/ui/FileDrop";
import { UrlInput, URL_HINT } from "@/components/ui/UrlInput";
import { IMAGE_HINT } from "@/lib/upload-limits";
import { ARTIST_CATEGORIES } from "@/lib/constants";
import type { CampaignIntakeRequest } from "@/lib/types";
import type { FormDraft } from "@/lib/drafts";
import { SaveDraftButton } from "@/components/ui/SaveDraftButton";
import {
  submitCampaignIntake,
  updateCampaignIntake,
  type CampaignState,
} from "./actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

/**
 * Category of artist / event — any number of them (13 Oct client notes). The
 * "please specify" box only appears, and is only meaningful, with Other
 * ticked; un-ticking Other clears it so a stale value isn't saved.
 */
function CategoryPicker({ initial, initialOther }: { initial: string[]; initialOther: string }) {
  const [selected, setSelected] = useState<string[]>(
    initial.map((c) => ARTIST_CATEGORIES.find((a) => a.toLowerCase() === c.toLowerCase()) ?? c),
  );
  const [other, setOther] = useState(initialOther);
  const otherOn = selected.includes("Other");

  function toggle(c: string, on: boolean) {
    setSelected((prev) => (on ? [...prev, c] : prev.filter((x) => x !== c)));
    if (c === "Other" && !on) setOther("");
  }

  return (
    <div>
      <p className="field-label">Categories of artist / event</p>
      <p className="field-hint mb-2 mt-0">Tick all that apply.</p>
      <div className="flex flex-wrap gap-2">
        {ARTIST_CATEGORIES.map((c) => {
          const on = selected.includes(c);
          return (
            <label
              key={c}
              className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                on
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10 font-semibold"
                  : "border-black/15 hover:border-[var(--color-brand)]"
              }`}
            >
              <input
                type="checkbox"
                name="categories"
                value={c}
                checked={on}
                onChange={(e) => toggle(c, e.target.checked)}
                className="h-4 w-4"
              />
              {c}
            </label>
          );
        })}
      </div>
      {otherOn && (
        <div className="mt-3 max-w-md">
          <Field label="Other — please specify" htmlFor="category_other">
            <input
              id="category_other"
              name="category_other"
              className="input"
              value={other}
              onChange={(e) => setOther(e.target.value)}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

/** An active package a brand can ask for (campaign_packages, admin-managed). */
export interface RequestPackage {
  id: string;
  name: string;
  description: string | null;
  participant_count: number | null;
  price_gbp: number | null;
  is_custom_price: boolean;
  min_price_gbp: number | null;
}

function packageLabel(p: RequestPackage): string {
  if (p.is_custom_price) return `${p.name} — custom budget${p.min_price_gbp ? ` from £${Number(p.min_price_gbp).toLocaleString("en-GB")}` : ""}`;
  const people = p.participant_count ? ` · ${p.participant_count.toLocaleString("en-GB")} participants` : "";
  return `${p.name} — £${Number(p.price_gbp ?? 0).toLocaleString("en-GB")}${people}`;
}

export function CampaignForm({
  intake,
  draft,
  packages = [],
}: {
  intake?: CampaignIntakeRequest;
  draft?: FormDraft | null;
  packages?: RequestPackage[];
}) {
  const editing = Boolean(intake);
  const action = editing ? updateCampaignIntake : submitCampaignIntake;
  const [state, formAction] = useActionState<CampaignState, FormData>(
    action,
    {},
  );
  const d = intake;

  return (
    <form action={formAction} className="space-y-6">
      {editing && <input type="hidden" name="id" value={intake!.id} />}
      <ErrorBanner error={state.error} />

      {!editing && (
        <section className="card bg-[var(--color-gold)]/35 p-6">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
            Launch Your Next Partnership
          </h2>
          <p className="mt-2 text-sm text-[var(--color-ink)]/80">
            Submit your campaign details and partnership goals. Our team at
            Live·En·Synergy will analyse your brief, put together a package,
            and pair you with the ideal artist or event to bring your vision
            to life — we'll be in touch within 3 days.
          </p>
        </section>
      )}

      <FormSection title="Campaign proposal">
        <Field
          label="Campaign name"
          htmlFor="campaign_name"
          required
          hint="What you call this campaign — it's how it's listed for you and our team."
        >
          <input
            id="campaign_name"
            name="campaign_name"
            className="input"
            required
            maxLength={120}
            placeholder="For example: “Northwave Coffee — summer festivals”"
            defaultValue={d?.campaign_name ?? ""}
          />
        </Field>

        <Field
          label="Campaign objective and description"
          htmlFor="description"
          required
          hint="What you want this campaign to achieve, and a short description of it (up to ~50 words)."
        >
          <textarea
            id="description"
            name="description"
            className="textarea"
            required
            placeholder="For example: “We want to partner with a live event that will feature young audiences who love trendy vibes and wear high street fashion.”"
            defaultValue={d?.description ?? ""}
          />
        </Field>

        <Field
          label="Potential campaign questions"
          htmlFor="expected_outcomes"
          hint="What you'd like to learn from the event audience. Our team turns these into the survey — rough questions are fine."
        >
          <textarea
            id="expected_outcomes"
            name="expected_outcomes"
            className="textarea"
            placeholder="For example: “Had you heard of us before the event? Would you try our new drink? What would make you buy it?”"
            defaultValue={d?.expected_outcomes ?? ""}
          />
        </Field>

        <Field
          label="Package"
          htmlFor="package_id"
          hint="The package you're interested in. Our team confirms the details with you before anything is invoiced."
        >
          <select id="package_id" name="package_id" className="select" defaultValue={d?.package_id ?? ""}>
            <option value="">Not sure yet — please advise</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {packageLabel(p)}
              </option>
            ))}
          </select>
        </Field>
        {packages.some((p) => p.is_custom_price) && (
          <Field
            label="Your budget (custom package only, GBP)"
            htmlFor="budget_expectation_gbp"
            hint="Only needed if you chose the custom package."
          >
            <input
              id="budget_expectation_gbp"
              name="budget_expectation_gbp"
              type="number"
              min={0}
              step="0.01"
              className="input"
              defaultValue={d?.budget_expectation_gbp ?? ""}
            />
          </Field>
        )}

        <CategoryPicker
          initial={d ? (d.categories?.length ? d.categories : d.category ? [d.category] : []) : []}
          initialOther={d?.category_other ?? ""}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred event location" htmlFor="preferred_location">
            <input
              id="preferred_location"
              name="preferred_location"
              className="input"
              placeholder="City, Country"
              defaultValue={d?.preferred_location ?? ""}
            />
          </Field>
          <Field label="Preferred event timeline" htmlFor="preferred_timeline">
            <input
              id="preferred_timeline"
              name="preferred_timeline"
              className="input"
              placeholder="Month, Year"
              defaultValue={d?.preferred_timeline ?? ""}
            />
          </Field>
        </div>

        <Field
          label="Name of event / artist (if known)"
          htmlFor="target_name"
        >
          <input
            id="target_name"
            name="target_name"
            className="input"
            defaultValue={d?.target_name ?? ""}
          />
        </Field>

        <Field
          label="Campaign image"
          htmlFor="image"
          hint="Optional. If you don't upload one, your brand's profile image is used."
        >
          <FileDrop
            name="image"
            hint={IMAGE_HINT}
            currentUrl={d?.image_url ?? null}
            label="Drag campaign artwork here, or click to browse"
          />
        </Field>


        <Field
          label="Any specific audience criteria"
          htmlFor="audience_criteria"
          hint="Who you'd most like to hear from. Everyone taking part is 18 or over."
        >
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--color-ink-soft)]">Age range</span>
            <input
              id="audience_age_min"
              name="audience_age_min"
              type="number"
              min={18}
              max={120}
              inputMode="numeric"
              aria-label="Youngest age"
              placeholder="18"
              className="input w-24"
              defaultValue={d?.audience_age_min ?? ""}
            />
            <span aria-hidden>to</span>
            <input
              id="audience_age_max"
              name="audience_age_max"
              type="number"
              min={18}
              max={120}
              inputMode="numeric"
              aria-label="Oldest age"
              placeholder="65"
              className="input w-24"
              defaultValue={d?.audience_age_max ?? ""}
            />
          </div>
          <textarea
            id="audience_criteria"
            name="audience_criteria"
            className="textarea"
            maxLength={2000}
            placeholder="For example: “Students and young professionals in London who go to live music at least once a month.”"
            defaultValue={d?.audience_criteria ?? ""}
          />
        </Field>

        <Field label="Any further information" htmlFor="additional_info">
          <textarea
            id="additional_info"
            name="additional_info"
            className="textarea"
            defaultValue={d?.additional_info ?? ""}
          />
        </Field>
      </FormSection>

      {/* The brief captured what kind of event you're after but never "this
          one, here" — so a partner who already had an event in mind had
          nowhere to say so (10 Aug standup). Our team relays it to the
          artist once your request is reviewed. */}
      <FormSection
        title="Know an event already?"
        description="Optional. If there's a specific event — one of ours or one you've seen elsewhere — describe it here and we'll put it to the artist or organiser."
      >
        <Field
          label="Event you'd like to partner with"
          htmlFor="suggested_event_note"
        >
          <textarea
            id="suggested_event_note"
            name="suggested_event_note"
            className="textarea"
            placeholder="For example: “Late-Shift Sessions at Peckham Audio on 14 March — we'd like the merch stand and a story mention.”"
            defaultValue={d?.suggested_event_note ?? ""}
          />
        </Field>
        <Field label="Link to it" htmlFor="suggested_event_url" hint={URL_HINT}>
          <UrlInput
            id="suggested_event_url"
            name="suggested_event_url"
            label="The suggested event link"
            placeholder="e.g. eventbrite.co.uk/e/late-shift-sessions"
            defaultValue={d?.suggested_event_url ?? ""}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Campaign manager"
        description="Who our team should speak to about this campaign. We contact this person within 3 days."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Manager's name" htmlFor="manager_name" required>
            <input
              id="manager_name"
              name="manager_name"
              className="input"
              required
              // `required` accepts a value of only spaces; the server then
              // refused it with an error far above the button (QA 30 Oct #5).
              pattern=".*\S.*"
              title="Enter the campaign manager's name"
              defaultValue={d?.manager_name ?? ""}
            />
          </Field>
          <Field label="Manager's email" htmlFor="manager_email" required>
            <input
              id="manager_email"
              name="manager_email"
              type="email"
              className="input"
              required
              defaultValue={d?.manager_email ?? ""}
            />
          </Field>
        </div>
        <Field
          label="Manager's phone"
          htmlFor="manager_phone"
          required
          hint="Used to reach you quickly once we've reviewed your request."
        >
          <input
            id="manager_phone"
            name="manager_phone"
            type="tel"
            className="input"
            required
            pattern=".*\S.*"
            title="Enter a phone number"
            placeholder="+44 7700 900000"
            defaultValue={d?.manager_phone ?? ""}
          />
        </Field>
      </FormSection>

      {/* Repeated by the button: the top banner is a long scroll away from
          where the brand pressed Submit (QA 30 Oct #5). */}
      <ErrorBanner error={state.error} />
      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* Only a new request can be a draft (#79); a submitted one is
            already with the team. */}
        {!editing && <SaveDraftButton kind="campaign_request" draft={draft} />}
        <Submit label={editing ? "Save changes" : "Submit request"} />
      </div>
    </form>
  );
}
