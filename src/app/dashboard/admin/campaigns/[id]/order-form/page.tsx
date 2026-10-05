import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { OrderFormDocument } from "@/components/order-forms/OrderFormDocument";
import { formatDateTime } from "@/lib/format";
import { INVOICE } from "@/lib/constants";
import {
  ALL_SECTIONS,
  ORDER_FORM_STATUS_LABELS,
  vatFor,
  type CampaignOrderForm,
} from "@/lib/order-forms";
import { OrderFormEditor, type ListingOption } from "./OrderFormEditor";
import { withdrawOrderForm } from "../../../order-form-actions";

export const metadata = { title: "Order form · Admin" };

interface CampaignRow {
  id: string;
  reference: string;
  description: string | null;
  preferred_timeline: string | null;
  target_name: string | null;
  budget_gbp: number;
  campaign_package_id: string | null;
  manager_name: string | null;
  manager_email: string | null;
  campaign_packages: { name: string } | null;
  brands: {
    brand_name: string;
    company_address: string | null;
    manager_name: string | null;
    manager_email: string | null;
    billing_legal_name: string | null;
    billing_address_line1: string | null;
    billing_address_line2: string | null;
    billing_city: string | null;
    billing_postcode: string | null;
    billing_country: string | null;
  } | null;
}

export default async function AdminOrderFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; sent?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: campaign }, { data: formRow }, { data: listingRows }, { data: packages }, { data: invoice }] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select(
          "id, reference, description, preferred_timeline, target_name, budget_gbp, campaign_package_id, manager_name, manager_email, campaign_packages(name), brands(brand_name, company_address, manager_name, manager_email, billing_legal_name, billing_address_line1, billing_address_line2, billing_city, billing_postcode, billing_country)",
        )
        .eq("id", id)
        .maybeSingle<CampaignRow>(),
      supabase.from("campaign_order_forms").select("*").eq("campaign_id", id).maybeSingle<CampaignOrderForm>(),
      supabase
        .from("event_listings")
        .select("id, reference, name, event_date, venue_name, city, country, owner_profile_id, status")
        .order("event_date", { ascending: true, nullsFirst: false }),
      supabase.from("campaign_packages").select("id, name, price_gbp").order("sort_order"),
      supabase
        .from("invoices")
        .select("id, reference, status")
        .eq("campaign_id", id)
        .eq("kind", "campaign_package")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; reference: string; status: string }>(),
    ]);
  if (!campaign) notFound();

  // Who runs each listing — artists by stage/artist name, legacy organisers
  // by event name, else the profile's own name.
  const owners = [...new Set((listingRows ?? []).map((l) => l.owner_profile_id as string))];
  const [{ data: artists }, { data: organisers }, { data: profiles }] = await Promise.all([
    supabase.from("artists").select("profile_id, artist_name, stage_name").in("profile_id", owners),
    supabase.from("event_organisers").select("profile_id, event_name, contact_name").in("profile_id", owners),
    supabase.from("profiles").select("id, full_name").in("id", owners),
  ]);
  const ownerName = (pid: string) => {
    const a = (artists ?? []).find((x) => x.profile_id === pid);
    if (a) return (a.stage_name || a.artist_name) as string;
    const o = (organisers ?? []).find((x) => x.profile_id === pid);
    if (o) return (o.event_name || o.contact_name) as string;
    return ((profiles ?? []).find((x) => x.id === pid)?.full_name as string) ?? "Unnamed partner";
  };
  const listings: ListingOption[] = (listingRows ?? []).map((l) => ({
    id: l.id,
    reference: l.reference,
    name: l.name,
    event_date: l.event_date,
    venue: l.venue_name,
    location: [l.city, l.country].filter(Boolean).join(", ") || null,
    owner_profile_id: l.owner_profile_id,
    owner_name: ownerName(l.owner_profile_id),
    status: l.status,
  }));

  const b = campaign.brands;
  const billingAddress = b
    ? [b.billing_address_line1, b.billing_address_line2, [b.billing_city, b.billing_postcode].filter(Boolean).join(" "), b.billing_country]
        .filter(Boolean)
        .join(", ")
    : "";
  const fee = Number(campaign.budget_gbp);

  // Everything that can be autopopulated from the brand and campaign is, so
  // the admin only fills what came out of the 1-on-1.
  const initial: Partial<CampaignOrderForm> = formRow ?? {
    brand_company_name: b?.billing_legal_name || b?.brand_name || null,
    brand_address: b?.company_address || billingAddress || null,
    contact_name: campaign.manager_name || b?.manager_name || null,
    contact_email: campaign.manager_email || b?.manager_email || null,
    campaign_name: campaign.target_name || `${b?.brand_name ?? "Brand"} campaign`,
    campaign_objective: campaign.description,
    campaign_timeline: campaign.preferred_timeline,
    campaign_package_id: campaign.campaign_package_id,
    campaign_fee_gbp: fee,
    vat_gbp: vatFor(fee, INVOICE.vatRate),
    total_gbp: Math.round((fee + vatFor(fee, INVOICE.vatRate)) * 100) / 100,
    media_image_urls: [],
  };

  const status = formRow?.status ?? "draft";
  const packageName =
    (packages ?? []).find((p) => p.id === initial.campaign_package_id)?.name ?? campaign.campaign_packages?.name ?? null;

  return (
    <div>
      <PageHeader
        title={formRow ? `Order form ${formRow.reference}` : "New order form"}
        subtitle={`Campaign ${campaign.reference} · ${b?.brand_name ?? ""}`}
        action={<span className="chip">{ORDER_FORM_STATUS_LABELS[status]}</span>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <Link href="/dashboard/admin/campaigns" className="text-[var(--color-brand)]">
          ← Back to campaigns
        </Link>
        {formRow && (
          <Link href={`/order-forms/${formRow.id}`} target="_blank" className="font-semibold text-[var(--color-brand-dark)] underline">
            Open the brand&apos;s view / PDF ↗
          </Link>
        )}
        {invoice && (
          <Link href={`/dashboard/admin/invoices/${invoice.id}`} className="text-[var(--color-brand-dark)] underline">
            Invoice {invoice.reference} ({invoice.status})
          </Link>
        )}
      </div>

      {sp.saved && (
        <p role="status" className="mb-4 rounded-xl bg-[var(--color-sage)]/60 px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          Saved. The campaign budget and its draft invoice now match this form.
        </p>
      )}
      {sp.sent && (
        <p role="status" className="mb-4 rounded-xl bg-[var(--color-sage)]/60 px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          Sent to the brand for approval. They&apos;ve been notified in-app and by email.
        </p>
      )}
      {status === "changes_requested" && formRow?.changes_requested_note && (
        <div className="mb-4 rounded-xl bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          <p className="font-semibold">
            The brand asked for changes{formRow.changes_requested_at ? ` (${formatDateTime(formRow.changes_requested_at)})` : ""}:
          </p>
          <p className="mt-1 whitespace-pre-line">{formRow.changes_requested_note}</p>
          <p className="mt-2">Update the form and send it again.</p>
        </div>
      )}
      {status === "sent" && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--color-gold)]/40 px-4 py-3 text-sm">
          <span>
            Waiting for the brand to approve{formRow?.sent_at ? ` — sent ${formatDateTime(formRow.sent_at)}` : ""}. Saving
            changes updates what they see.
          </span>
          <form action={withdrawOrderForm}>
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <button type="submit" className="btn btn-ghost text-sm">Withdraw to draft</button>
          </form>
        </div>
      )}

      {status === "approved" ? (
        <div>
          <p className="mb-6 rounded-xl bg-[var(--color-sage)]/60 px-4 py-3 text-sm text-[var(--color-olive-deep)]">
            Approved by the brand{formRow?.approved_at ? ` on ${formatDateTime(formRow.approved_at)}` : ""}, with both
            consents ticked. The form is locked; billing continues on the invoice.
          </p>
          <OrderFormDocument
            form={formRow!}
            sections={ALL_SECTIONS}
            campaignReference={campaign.reference}
            packageName={packageName}
          />
        </div>
      ) : (
        <OrderFormEditor
          campaignId={campaign.id}
          campaignReference={campaign.reference}
          initial={initial}
          listings={listings}
          packages={(packages ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            price_gbp: p.price_gbp != null ? Number(p.price_gbp) : null,
          }))}
          invoiceIssued={!!invoice && invoice.status !== "draft"}
        />
      )}
    </div>
  );
}
