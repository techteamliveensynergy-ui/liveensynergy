"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner } from "@/components/onboarding/parts";
import { formatGbp } from "@/lib/billing";
import { displayUrl } from "@/lib/urls";
import { SURVEY_TYPE_LABELS, vatFor, type CampaignOrderForm, type SurveyType } from "@/lib/order-forms";
import { saveOrderForm, type OrderFormState } from "../../../order-form-actions";

export interface ListingOption {
  id: string;
  reference: string;
  name: string;
  event_date: string | null;
  venue: string | null;
  location: string | null;
  owner_profile_id: string;
  owner_name: string;
  status: string;
}

function Buttons({ disabledSend }: { disabledSend: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-4 z-10 flex flex-wrap justify-end gap-3 rounded-2xl bg-white/90 p-3 shadow-lg backdrop-blur">
      <button type="submit" name="intent" value="save" className="btn btn-ghost" disabled={pending}>
        {pending ? "Saving…" : "Save draft"}
      </button>
      <button
        type="submit"
        name="intent"
        value="send"
        className="btn btn-primary"
        disabled={pending || disabledSend}
        title={disabledSend ? "The invoice has already been issued" : undefined}
      >
        {pending ? "Sending…" : "Send to brand for approval"}
      </button>
    </div>
  );
}

const v = (x: string | number | null | undefined) => (x == null ? "" : String(x));

export function OrderFormEditor({
  campaignId,
  campaignReference,
  initial,
  listings,
  packages,
  invoiceIssued,
}: {
  campaignId: string;
  campaignReference: string;
  initial: Partial<CampaignOrderForm>;
  listings: ListingOption[];
  packages: { id: string; name: string; price_gbp: number | null }[];
  invoiceIssued: boolean;
}) {
  const [state, formAction] = useActionState<OrderFormState, FormData>(saveOrderForm, {});

  // --- Linked event: pick the partner, then one of their events; the event's
  // details fill in from the listing (still editable — e.g. a venue change).
  const partners = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of listings) m.set(l.owner_profile_id, l.owner_name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [listings]);
  const initialListing = listings.find((l) => l.id === initial.listing_id) ?? null;
  const [partnerId, setPartnerId] = useState(initialListing?.owner_profile_id ?? initial.artist_profile_id ?? "");
  const [listingId, setListingId] = useState(initial.listing_id ?? "");
  const [ev, setEv] = useState({
    artist_name: v(initial.artist_name),
    event_name: v(initial.event_name),
    event_reference: v(initial.event_reference),
    event_date: v(initial.event_date),
    event_venue: v(initial.event_venue),
    event_location: v(initial.event_location),
  });
  const partnerListings = listings.filter((l) => l.owner_profile_id === partnerId);

  function pickPartner(id: string) {
    setPartnerId(id);
    setListingId("");
    setEv((e) => ({ ...e, artist_name: partners.find(([pid]) => pid === id)?.[1] ?? "" }));
  }
  function pickListing(id: string) {
    setListingId(id);
    const l = listings.find((x) => x.id === id);
    if (!l) return;
    setEv({
      artist_name: l.owner_name,
      event_name: l.name,
      event_reference: l.reference,
      event_date: l.event_date ?? "",
      event_venue: l.venue ?? "",
      event_location: l.location ?? "",
    });
  }

  // --- Commercial: fee, VAT and total are separate inputs (Enterprise pricing
  // is custom). Picking a priced package fills the fee; VAT follows the fee
  // at 20% unless set to 0 (zero-rated); the total is always fee + VAT.
  const [packageId, setPackageId] = useState(initial.campaign_package_id ?? "");
  const [fee, setFee] = useState(v(initial.campaign_fee_gbp));
  const [vat, setVat] = useState(v(initial.vat_gbp));
  const feeNum = Number(fee);
  const vatNum = Number(vat);
  const total = fee !== "" && vat !== "" && Number.isFinite(feeNum + vatNum) ? feeNum + vatNum : null;

  function changeFee(next: string) {
    setFee(next);
    const n = Number(next);
    if (next !== "" && Number.isFinite(n) && vat !== "0") setVat(vatFor(n).toFixed(2));
  }
  function changePackage(id: string) {
    setPackageId(id);
    const p = packages.find((x) => x.id === id);
    if (p?.price_gbp != null) changeFee(String(p.price_gbp));
  }

  const [keptImages, setKeptImages] = useState<string[]>(initial.media_image_urls ?? []);
  const moneyLocked = invoiceIssued;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <ErrorBanner error={state.error} />

      <FormSection
        title="Brand / company"
        description="Filled in from the brand's profile — check it matches who the brand wants on the order."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brand / company name" htmlFor="brand_company_name" required>
            <input id="brand_company_name" name="brand_company_name" className="input" defaultValue={v(initial.brand_company_name)} />
          </Field>
          <Field label="Contact person name" htmlFor="contact_name" required>
            <input id="contact_name" name="contact_name" className="input" defaultValue={v(initial.contact_name)} />
          </Field>
          <Field label="Email address" htmlFor="contact_email" required hint="The order form email goes here as well as to the brand's account.">
            <input id="contact_email" name="contact_email" type="email" className="input" defaultValue={v(initial.contact_email)} />
          </Field>
          <Field label="Address" htmlFor="brand_address">
            <input id="brand_address" name="brand_address" className="input" defaultValue={v(initial.brand_address)} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Campaign information" description="Visible to the linked artist once the brand approves.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Campaign ID" htmlFor="campaign_ref">
            <input id="campaign_ref" className="input" value={campaignReference} readOnly />
          </Field>
          <Field label="Campaign name" htmlFor="campaign_name" required>
            <input id="campaign_name" name="campaign_name" className="input" defaultValue={v(initial.campaign_name)} />
          </Field>
        </div>
        <div className="mt-4 grid gap-4">
          <Field label="Campaign objective" htmlFor="campaign_objective" required>
            <textarea id="campaign_objective" name="campaign_objective" rows={3} className="textarea" defaultValue={v(initial.campaign_objective)} />
          </Field>
          <Field label="Campaign timeline" htmlFor="campaign_timeline">
            <input id="campaign_timeline" name="campaign_timeline" className="input" defaultValue={v(initial.campaign_timeline)} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Linked event" description="Pick the artist / event partner, then their event — the details fill in.">
        <input type="hidden" name="listing_id" value={listingId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Artist / event partner" htmlFor="partner">
            <select id="partner" className="select" value={partnerId} onChange={(e) => pickPartner(e.target.value)}>
              <option value="">Not decided yet</option>
              {partners.map(([pid, name]) => (
                <option key={pid} value={pid}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="Event name" htmlFor="listing">
            <select
              id="listing"
              className="select"
              value={listingId}
              onChange={(e) => pickListing(e.target.value)}
              disabled={!partnerId}
            >
              <option value="">{partnerId ? "Choose an event…" : "Pick a partner first"}</option>
              {partnerListings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.reference}{l.status !== "available" ? ` (${l.status})` : ""}
                </option>
              ))}
            </select>
          </Field>
          {(
            [
              ["artist_name", "Artist / partner name (as shown)"],
              ["event_name", "Event name (as shown)"],
              ["event_reference", "Event ID"],
              ["event_venue", "Venue"],
              ["event_location", "Location"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label} htmlFor={key}>
              <input
                id={key}
                name={key}
                className="input"
                value={ev[key]}
                onChange={(e) => setEv((x) => ({ ...x, [key]: e.target.value }))}
              />
            </Field>
          ))}
          <Field label="Date" htmlFor="event_date">
            <input
              id="event_date"
              name="event_date"
              type="date"
              className="input"
              value={ev.event_date}
              onChange={(e) => setEv((x) => ({ ...x, event_date: e.target.value }))}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Research" description="Approx. participants also sets the survey's response cap (+10% buffer) unless the survey sets its own.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Approx. number of participants" htmlFor="approx_participants">
            <input id="approx_participants" name="approx_participants" type="number" min={1} className="input" defaultValue={v(initial.approx_participants)} />
          </Field>
          <Field label="Type of survey" htmlFor="survey_type">
            <select id="survey_type" name="survey_type" className="select" defaultValue={v(initial.survey_type)}>
              <option value="">Not decided</option>
              {(Object.keys(SURVEY_TYPE_LABELS) as SurveyType[]).map((t) => (
                <option key={t} value={t}>{SURVEY_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="Number of survey questions" htmlFor="survey_question_count">
            <input id="survey_question_count" name="survey_question_count" type="number" min={0} className="input" defaultValue={v(initial.survey_question_count)} />
          </Field>
        </div>
        <div className="mt-4 grid gap-4">
          <Field label="Potential research questions" htmlFor="research_questions">
            <textarea id="research_questions" name="research_questions" rows={4} className="textarea" defaultValue={v(initial.research_questions)} />
          </Field>
          <Field label="Draft survey link" htmlFor="draft_survey_link" hint="Paste the survey preview link for the brand to review.">
            <input id="draft_survey_link" name="draft_survey_link" className="input" defaultValue={displayUrl(initial.draft_survey_link)} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Participant benefit" description="Visible to the linked artist once the brand approves.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Discount / reward" htmlFor="discount_reward">
            <input id="discount_reward" name="discount_reward" className="input" defaultValue={v(initial.discount_reward)} />
          </Field>
          <Field label="Number of available rewards" htmlFor="rewards_available">
            <input id="rewards_available" name="rewards_available" type="number" min={0} className="input" defaultValue={v(initial.rewards_available)} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Redemption arrangements" htmlFor="redemption_arrangements">
            <textarea id="redemption_arrangements" name="redemption_arrangements" rows={3} className="textarea" defaultValue={v(initial.redemption_arrangements)} />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Survey participation — artist social media"
        description="Promotion platforms, number of posts and stories, tagging / following the brand, etc. Visible to the artist."
      >
        <textarea id="social_media_details" name="social_media_details" rows={4} className="textarea" defaultValue={v(initial.social_media_details)} aria-label="Artist social media details" />
      </FormSection>

      <FormSection title="Any other details">
        <textarea id="other_details" name="other_details" rows={3} className="textarea" defaultValue={v(initial.other_details)} aria-label="Any other details" />
      </FormSection>

      <FormSection
        title="Images & video for the brand"
        description="Shown large, like presentation slides, on the brand's review screen. Up to 8 images."
      >
        {keptImages.length > 0 && (
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            {keptImages.map((src) => (
              <div key={src} className="relative">
                <input type="hidden" name="media_keep" value={src} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="aspect-video w-full rounded-xl object-cover" />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-white/90 px-2 text-sm"
                  onClick={() => setKeptImages((xs) => xs.filter((x) => x !== src))}
                  aria-label="Remove image"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Add images" htmlFor="media_images">
            <input id="media_images" name="media_images" type="file" accept="image/*" multiple className="input" />
          </Field>
          <Field label="Video link (YouTube, Vimeo or a .mp4)" htmlFor="media_video_url">
            <input id="media_video_url" name="media_video_url" className="input" defaultValue={displayUrl(initial.media_video_url)} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Commercial" private description="Not visible to the artist. Saving keeps the campaign budget and its draft invoice in step.">
        {moneyLocked && (
          <p className="mb-4 rounded-xl bg-[var(--color-gold)]/40 px-4 py-3 text-sm">
            The invoice has already been issued, so these figures are locked. Cancel the invoice to change them.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-5">
          <Field label="Package" htmlFor="campaign_package_id">
            <select
              id="campaign_package_id"
              name="campaign_package_id"
              className="select"
              value={packageId}
              onChange={(e) => changePackage(e.target.value)}
              disabled={moneyLocked}
            >
              <option value="">Custom</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.price_gbp != null ? ` (${formatGbp(p.price_gbp)})` : " (custom price)"}
                </option>
              ))}
            </select>
            {moneyLocked && <input type="hidden" name="campaign_package_id" value={packageId} />}
          </Field>
          <Field label="Campaign fee (ex VAT)" htmlFor="campaign_fee_gbp" required>
            <input id="campaign_fee_gbp" name="campaign_fee_gbp" inputMode="decimal" className="input" value={fee} onChange={(e) => changeFee(e.target.value)} readOnly={moneyLocked} />
          </Field>
          <Field label="VAT" htmlFor="vat_gbp" required hint="20% of the fee, or 0 if zero-rated.">
            <input id="vat_gbp" name="vat_gbp" inputMode="decimal" className="input" value={vat} onChange={(e) => setVat(e.target.value)} readOnly={moneyLocked} />
          </Field>
          <Field label="Total amount" htmlFor="total_display">
            <input id="total_display" className="input font-semibold" value={total != null ? formatGbp(total) : ""} readOnly />
          </Field>
          <Field label="Payment date" htmlFor="payment_date" hint="Becomes the invoice due date.">
            <input id="payment_date" name="payment_date" type="date" className="input" defaultValue={v(initial.payment_date)} />
          </Field>
        </div>
      </FormSection>

      <Buttons disabledSend={false} />
    </form>
  );
}
