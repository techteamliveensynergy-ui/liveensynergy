"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner } from "@/components/onboarding/parts";
import { UrlInput, URL_HINT } from "@/components/ui/UrlInput";
import { ARTIST_CATEGORIES } from "@/lib/constants";
import type { Campaign, CampaignIntakeRequest, CampaignPackage } from "@/lib/types";
import {
  createCampaignFromAdmin,
  updateCampaignAdmin,
  type MarketplaceState,
} from "../marketplace-actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function CampaignAdminForm({
  packages,
  brands,
  intake,
  campaign,
}: {
  packages: CampaignPackage[];
  brands: { id: string; brand_name: string }[];
  intake?: CampaignIntakeRequest;
  campaign?: Campaign;
}) {
  const editing = Boolean(campaign);
  const action = editing ? updateCampaignAdmin : createCampaignFromAdmin;
  const [state, formAction] = useActionState<MarketplaceState, FormData>(
    action,
    {},
  );

  const d = campaign;
  const i = intake;

  const [packageId, setPackageId] = useState<string>(
    d?.campaign_package_id ?? "",
  );
  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === packageId) ?? null,
    [packages, packageId],
  );
  const [budget, setBudget] = useState<string>(
    d?.budget_gbp != null ? String(d.budget_gbp) : "",
  );
  const [margin, setMargin] = useState<string>(
    d?.package_platform_margin_gbp != null
      ? String(d.package_platform_margin_gbp)
      : "",
  );

  function onPackageChange(id: string) {
    setPackageId(id);
    const pkg = packages.find((p) => p.id === id);
    if (!pkg) return;
    if (!pkg.is_custom_price) {
      setBudget(pkg.price_gbp != null ? String(pkg.price_gbp) : "");
    } else {
      setBudget(pkg.min_price_gbp != null ? String(pkg.min_price_gbp) : "");
    }
    setMargin(String(pkg.platform_margin_gbp));
  }

  return (
    <form action={formAction} className="space-y-6">
      {editing && <input type="hidden" name="id" value={campaign!.id} />}
      {!editing && i && (
        <input type="hidden" name="from_intake_id" value={i.id} />
      )}
      <ErrorBanner error={state.error} />

      <FormSection title="Brand">
        {i || editing ? (
          <p className="text-sm text-[var(--color-ink-soft)]">
            {i
              ? "Creating from this brand's request — see the request for their contact details."
              : "Brand can't be changed once a campaign exists."}
          </p>
        ) : (
          <Field label="Brand" htmlFor="brand_id" required>
            <select id="brand_id" name="brand_id" className="select" required>
              <option value="">Select a brand…</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.brand_name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </FormSection>

      <FormSection title="Package & budget">
        <Field label="Package" htmlFor="campaign_package_id">
          <select
            id="campaign_package_id"
            name="campaign_package_id"
            className="select"
            value={packageId}
            onChange={(e) => onPackageChange(e.target.value)}
          >
            <option value="">No package (use the standard fee formula)</option>
            {packages
              .filter((p) => p.is_active || p.id === packageId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.is_custom_price
                    ? ` (from £${p.min_price_gbp?.toLocaleString("en-GB")})`
                    : ` (£${p.price_gbp?.toLocaleString("en-GB")})`}
                </option>
              ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Budget (GBP)"
            htmlFor="budget_gbp"
            hint={
              selectedPackage && !selectedPackage.is_custom_price
                ? "Fixed by the package."
                : selectedPackage
                  ? `Multiples of £${selectedPackage.price_increment_gbp?.toLocaleString("en-GB")} above £${selectedPackage.min_price_gbp?.toLocaleString("en-GB")}.`
                  : undefined
            }
          >
            <input
              id="budget_gbp"
              name="budget_gbp"
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={budget}
              readOnly={Boolean(selectedPackage && !selectedPackage.is_custom_price)}
              onChange={(e) => setBudget(e.target.value)}
            />
          </Field>
          <Field
            label="Platform margin (GBP)"
            htmlFor="package_platform_margin_gbp"
            hint="What the platform keeps — the rest becomes the reward pool. Pre-filled from the package, editable per campaign."
          >
            <input
              id="package_platform_margin_gbp"
              name="package_platform_margin_gbp"
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Campaign details">
        <Field label="Campaign description" htmlFor="description" required>
          <textarea
            id="description"
            name="description"
            className="textarea"
            required
            defaultValue={d?.description ?? i?.description ?? ""}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category of artist / event" htmlFor="category">
            <select
              id="category"
              name="category"
              className="select"
              defaultValue={d?.category ?? i?.category ?? ""}
            >
              <option value="">Select…</option>
              {ARTIST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="If 'Other' category, specify" htmlFor="category_other">
            <input
              id="category_other"
              name="category_other"
              className="input"
              defaultValue={d?.category_other ?? i?.category_other ?? ""}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred event location" htmlFor="preferred_location">
            <input
              id="preferred_location"
              name="preferred_location"
              className="input"
              defaultValue={d?.preferred_location ?? i?.preferred_location ?? ""}
            />
          </Field>
          <Field label="Preferred event timeline" htmlFor="preferred_timeline">
            <input
              id="preferred_timeline"
              name="preferred_timeline"
              className="input"
              defaultValue={d?.preferred_timeline ?? i?.preferred_timeline ?? ""}
            />
          </Field>
        </div>

        <Field label="Name of event / artist (if known)" htmlFor="target_name">
          <input
            id="target_name"
            name="target_name"
            className="input"
            defaultValue={d?.target_name ?? i?.target_name ?? ""}
          />
        </Field>

        <Field label="Campaign image URL" htmlFor="image_url">
          <input
            id="image_url"
            name="image_url"
            className="input"
            defaultValue={d?.image_url ?? i?.image_url ?? ""}
          />
        </Field>

        <Field label="Expected outcomes" htmlFor="expected_outcomes">
          <textarea
            id="expected_outcomes"
            name="expected_outcomes"
            className="textarea"
            defaultValue={d?.expected_outcomes ?? i?.expected_outcomes ?? ""}
          />
        </Field>

        <Field label="Reward rules" htmlFor="reward_rules">
          <textarea
            id="reward_rules"
            name="reward_rules"
            className="textarea"
            defaultValue={d?.reward_rules ?? i?.reward_rules ?? ""}
          />
        </Field>

        <Field label="Any further information" htmlFor="additional_info">
          <textarea
            id="additional_info"
            name="additional_info"
            className="textarea"
            defaultValue={d?.additional_info ?? i?.additional_info ?? ""}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Suggested event"
        description="Carried over from the brand's request, if they gave one — edit before matching if needed."
      >
        <Field label="Note" htmlFor="suggested_event_note">
          <textarea
            id="suggested_event_note"
            name="suggested_event_note"
            className="textarea"
            defaultValue={d?.suggested_event_note ?? i?.suggested_event_note ?? ""}
          />
        </Field>
        <Field label="Link" htmlFor="suggested_event_url" hint={URL_HINT}>
          <UrlInput
            id="suggested_event_url"
            name="suggested_event_url"
            label="The suggested event link"
            defaultValue={d?.suggested_event_url ?? i?.suggested_event_url ?? ""}
          />
        </Field>
      </FormSection>

      <FormSection title="Campaign manager">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Manager's name" htmlFor="manager_name" required>
            <input
              id="manager_name"
              name="manager_name"
              className="input"
              required
              defaultValue={d?.manager_name ?? i?.manager_name ?? ""}
            />
          </Field>
          <Field label="Manager's email" htmlFor="manager_email" required>
            <input
              id="manager_email"
              name="manager_email"
              type="email"
              className="input"
              required
              defaultValue={d?.manager_email ?? i?.manager_email ?? ""}
            />
          </Field>
        </div>
        <Field label="Manager's phone" htmlFor="manager_phone" required>
          <input
            id="manager_phone"
            name="manager_phone"
            type="tel"
            className="input"
            required
            defaultValue={d?.manager_phone ?? i?.manager_phone ?? ""}
          />
        </Field>
      </FormSection>

      <div className="flex justify-end">
        <Submit label={editing ? "Save changes" : "Create campaign"} />
      </div>
    </form>
  );
}
