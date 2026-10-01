import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { INVOICE } from "./constants";
import { buildInvoiceLines } from "./billing";

/**
 * Drafts the package invoice for a campaign. Shared by campaign creation, the
 * admin "Draft invoice" repair button and the campaign-edit path.
 *
 * Idempotent: a live (draft / sent / overdue) campaign_package invoice already
 * existing — the unique index in 0047 — is success, not an error, so a double
 * submit or a repeated repair click can't create a second invoice.
 *
 * Returns an error string rather than throwing: campaign creation must not
 * fail because the invoice couldn't be drafted (the repair button covers it),
 * but the failure must be visible to the admin.
 */
export async function draftCampaignInvoice(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ ok: true; invoiceId: string | null } | { ok: false; error: string }> {
  const { data: campaign, error: loadError } = await supabase
    .from("campaigns")
    .select(
      "id, reference, brand_id, budget_gbp, package_platform_margin_gbp, campaign_packages(name)",
    )
    .eq("id", campaignId)
    .maybeSingle<{
      id: string;
      reference: string;
      brand_id: string;
      budget_gbp: number;
      package_platform_margin_gbp: number | null;
      campaign_packages: { name: string } | null;
    }>();
  if (loadError || !campaign) {
    return { ok: false, error: loadError?.message ?? "Campaign not found." };
  }

  let build;
  try {
    build = buildInvoiceLines({
      budgetGbp: Number(campaign.budget_gbp),
      packageName: campaign.campaign_packages?.name ?? null,
      campaignReference: campaign.reference,
      packageMarginGbp:
        campaign.package_platform_margin_gbp != null
          ? Number(campaign.package_platform_margin_gbp)
          : null,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not build invoice." };
  }

  const { data: created, error } = await supabase
    .from("invoices")
    .insert({
      kind: "campaign_package",
      brand_id: campaign.brand_id,
      campaign_id: campaign.id,
      lines: build.lines,
      subtotal_gbp: build.subtotalGbp,
      vat_gbp: build.vatGbp,
      amount_gbp: build.totalGbp,
      notes: `Auto-drafted for campaign ${campaign.reference}. VAT mode: ${INVOICE.vatMode}.`,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation: a live invoice for this campaign exists.
    if (error.code === "23505") return { ok: true, invoiceId: null };
    return { ok: false, error: error.message };
  }
  return { ok: true, invoiceId: created.id };
}

/**
 * Rebuilds a campaign's DRAFT invoice in place after its money changed.
 * Returns whether a draft was found and updated; a sent/paid invoice is left
 * alone (the caller refuses the edit before getting here).
 */
export async function redraftCampaignInvoice(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: draft } = await supabase
    .from("invoices")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("kind", "campaign_package")
    .eq("status", "draft")
    .maybeSingle<{ id: string }>();
  if (!draft) return { ok: true };

  const { data: campaign } = await supabase
    .from("campaigns")
    .select(
      "reference, budget_gbp, package_platform_margin_gbp, campaign_packages(name)",
    )
    .eq("id", campaignId)
    .maybeSingle<{
      reference: string;
      budget_gbp: number;
      package_platform_margin_gbp: number | null;
      campaign_packages: { name: string } | null;
    }>();
  if (!campaign) return { ok: false, error: "Campaign not found." };

  try {
    const build = buildInvoiceLines({
      budgetGbp: Number(campaign.budget_gbp),
      packageName: campaign.campaign_packages?.name ?? null,
      campaignReference: campaign.reference,
      packageMarginGbp:
        campaign.package_platform_margin_gbp != null
          ? Number(campaign.package_platform_margin_gbp)
          : null,
    });
    const { error } = await supabase
      .from("invoices")
      .update({
        lines: build.lines,
        subtotal_gbp: build.subtotalGbp,
        vat_gbp: build.vatGbp,
        amount_gbp: build.totalGbp,
      })
      .eq("id", draft.id)
      .eq("status", "draft");
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not rebuild invoice." };
  }
}
