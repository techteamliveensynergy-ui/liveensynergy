"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export interface OrderFormPickerCampaign {
  id: string;
  reference: string;
  label: string;
  brandId: string;
  brandName: string;
  formStatus: string | null;
}

/**
 * The Admin Portal brief starts an order form by choosing the brand, then the
 * campaign. Every campaign row below also links straight to its form; this is
 * the brand-first way in, for when the admin is coming out of a 1-on-1 with
 * a brand rather than looking at a campaign.
 */
export function OrderFormPicker({ campaigns }: { campaigns: OrderFormPickerCampaign[] }) {
  const router = useRouter();
  const brands = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of campaigns) m.set(c.brandId, c.brandName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [campaigns]);
  const [brandId, setBrandId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const forBrand = campaigns.filter((c) => c.brandId === brandId);

  if (campaigns.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-black/5 bg-white p-4">
      <p className="mb-3 text-sm font-semibold">Campaign order form</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
          <span className="field-label">Brand / company</span>
          <select
            className="select"
            value={brandId}
            onChange={(e) => {
              setBrandId(e.target.value);
              const only = campaigns.filter((c) => c.brandId === e.target.value);
              setCampaignId(only.length === 1 ? only[0].id : "");
            }}
          >
            <option value="">Choose a brand…</option>
            {brands.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
          <span className="field-label">Campaign</span>
          <select
            className="select"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            disabled={!brandId}
          >
            <option value="">{brandId ? "Choose a campaign…" : "Choose a brand first"}</option>
            {forBrand.map((c) => (
              <option key={c.id} value={c.id}>
                {c.reference} · {c.label}
                {c.formStatus ? ` (order form: ${c.formStatus})` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!campaignId}
          onClick={() => router.push(`/dashboard/admin/campaigns/${campaignId}/order-form`)}
        >
          {campaigns.find((c) => c.id === campaignId)?.formStatus ? "Open order form" : "Create order form"}
        </button>
      </div>
    </div>
  );
}
