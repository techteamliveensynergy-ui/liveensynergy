"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!brand) redirect("/onboarding");
  return { supabase, brandId: brand.id as string };
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
    additional_info: str(formData.get("additional_info")),
    manager_name: str(formData.get("manager_name")),
    manager_email: str(formData.get("manager_email")),
  };
}

export async function createCampaign(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const { supabase, brandId } = await requireBrand();
  const p = payload(formData);
  if (!p.description) return { error: "Campaign description is required." };
  if (p.budget_gbp == null) return { error: "Sponsorship budget is required." };

  const { error } = await supabase
    .from("campaigns")
    .insert({ ...p, brand_id: brandId });
  if (error) return { error: error.message };

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
  if (!p.description) return { error: "Campaign description is required." };
  if (p.budget_gbp == null) return { error: "Sponsorship budget is required." };

  const { error } = await supabase
    .from("campaigns")
    .update(p)
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
