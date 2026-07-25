"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify, notifyAdmins } from "@/lib/notifications";
import { uploadImage } from "@/lib/storage";
import { assessProfile } from "@/lib/profile-completeness";

export interface CampaignState {
  error?: string;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}
function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function requireBrand() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: brand } = await supabase
    .from("brands")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!brand) redirect("/onboarding");
  return { supabase, brandId: brand.id as string, brand };
}

function payload(formData: FormData) {
  return {
    description: str(formData.get("description")),
    budget_gbp: num(formData.get("budget_gbp")),
    category: str(formData.get("category")),
    category_other: str(formData.get("category_other")),
    preferred_location: str(formData.get("preferred_location")),
    preferred_timeline: str(formData.get("preferred_timeline")),
    target_name: str(formData.get("target_name")),
    reward_rules: str(formData.get("reward_rules")),
    expected_outcomes: str(formData.get("expected_outcomes")),
    additional_info: str(formData.get("additional_info")),
    manager_name: str(formData.get("manager_name")),
    manager_email: str(formData.get("manager_email")),
    manager_phone: str(formData.get("manager_phone")),
  };
}

/**
 * Campaign manager details are mandatory — the team has 48 hours to reach the
 * sponsor after a match, and can't do that without a way to contact them.
 */
function validate(p: ReturnType<typeof payload>): string | null {
  if (!p.description) return "Campaign description is required.";
  if (p.budget_gbp == null) return "Sponsorship budget is required.";
  if (!p.manager_name) return "Campaign manager's name is required.";
  if (!p.manager_email) return "Campaign manager's email is required.";
  if (!p.manager_phone) return "Campaign manager's phone number is required.";
  return null;
}

export async function createCampaign(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const { supabase, brandId, brand } = await requireBrand();
  const p = payload(formData);
  const invalid = validate(p);
  if (invalid) return { error: invalid };

  // Mirrors the gate on /dashboard/campaigns/new — the team can't action a
  // campaign from a brand it has no way to contact.
  const { blocking } = assessProfile("brand", brand);
  if (blocking.length > 0) {
    return {
      error: `Complete your brand profile first — still missing: ${blocking
        .map((f) => f.label)
        .join(", ")}.`,
    };
  }

  const image = await uploadImage(formData.get("image"), "campaign");
  if (image.error) return { error: image.error };

  const { data: created, error } = await supabase
    .from("campaigns")
    .insert({ ...p, image_url: image.url ?? null, brand_id: brandId })
    .select("id, reference")
    .single();
  if (error) return { error: error.message };

  const budget = `£${Number(p.budget_gbp).toLocaleString("en-GB")}`;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await notify({
      eventKey: "campaign.created",
      recipientProfileId: user.id,
      link: `/dashboard/campaigns/${created.id}`,
      variables: { campaign_reference: created.reference, budget },
    });
  }
  // The whole model depends on the team matching this to an event.
  await notifyAdmins({
    eventKey: "admin.campaign_request",
    link: "/dashboard/admin",
    variables: { campaign_reference: created.reference, budget },
  });

  revalidatePath("/dashboard/campaigns");
  redirect("/dashboard/campaigns");
}

export async function updateCampaign(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const { supabase, brandId } = await requireBrand();
  const id = str(formData.get("id"));
  if (!id) return { error: "Missing campaign id." };
  const p = payload(formData);
  const invalid = validate(p);
  if (invalid) return { error: invalid };

  const image = await uploadImage(formData.get("image"), "campaign");
  if (image.error) return { error: image.error };

  const { error } = await supabase
    .from("campaigns")
    // Leaving the picker empty keeps the existing artwork.
    .update(image.url ? { ...p, image_url: image.url } : p)
    .eq("id", id)
    .eq("brand_id", brandId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard/campaigns");
  redirect("/dashboard/campaigns");
}

export async function deleteCampaign(formData: FormData) {
  const { supabase, brandId } = await requireBrand();
  const id = str(formData.get("id"));
  if (!id) return;
  await supabase.from("campaigns").delete().eq("id", id).eq("brand_id", brandId);
  revalidatePath("/dashboard/campaigns");
}
