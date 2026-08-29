"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify, notifyAdmins } from "@/lib/notifications";
import { uploadImage } from "@/lib/storage";
import { assessProfile } from "@/lib/profile-completeness";
import { normaliseUrl } from "@/lib/urls";

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
    // Guidance only, not a committed figure — the real budget only exists
    // once admin assigns a package (or a custom amount) on conversion
    // (26 Aug: admin-only campaign creation).
    budget_expectation_gbp: num(formData.get("budget_expectation_gbp")),
    category: str(formData.get("category")),
    category_other: str(formData.get("category_other")),
    preferred_location: str(formData.get("preferred_location")),
    preferred_timeline: str(formData.get("preferred_timeline")),
    target_name: str(formData.get("target_name")),
    reward_rules: str(formData.get("reward_rules")),
    expected_outcomes: str(formData.get("expected_outcomes")),
    additional_info: str(formData.get("additional_info")),
    // The sponsor's own suggestion for what to sponsor (10 Aug standup). The
    // link is normalised here rather than trusted — the same rule the profile
    // link fields use, so "eventbrite.co.uk/e/123" is accepted and stored as a
    // full https:// URL.
    suggested_event_note: str(formData.get("suggested_event_note")),
    suggested_event_url: normaliseUrl(
      formData.get("suggested_event_url"),
      "The suggested event link",
    ).url,
    manager_name: str(formData.get("manager_name")),
    manager_email: str(formData.get("manager_email")),
    manager_phone: str(formData.get("manager_phone")),
  };
}

/**
 * Campaign manager details are mandatory — the team has 48 hours to reach the
 * sponsor after reviewing a request, and can't do that without a way to
 * contact them. Budget is guidance now, not a committed figure, so it no
 * longer runs through the platform-fee floor check — that check belongs to
 * the real budget admin sets when converting the request into a campaign.
 */
function validate(
  p: ReturnType<typeof payload>,
  formData: FormData,
): string | null {
  if (!p.description) return "Campaign description is required.";
  // A link that couldn't be parsed comes back null, which would otherwise be
  // indistinguishable from an empty field and silently drop what they typed.
  const link = normaliseUrl(
    formData.get("suggested_event_url"),
    "The suggested event link",
  );
  if (link.error) return link.error;
  if (!p.manager_name) return "Campaign manager's name is required.";
  if (!p.manager_email) return "Campaign manager's email is required.";
  if (!p.manager_phone) return "Campaign manager's phone number is required.";
  return null;
}

export async function submitCampaignIntake(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const { supabase, brandId, brand } = await requireBrand();
  const p = payload(formData);
  const invalid = validate(p, formData);
  if (invalid) return { error: invalid };

  // Mirrors the gate on /dashboard/campaigns/new — the team can't action a
  // request from a brand it has no way to contact.
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
    .from("campaign_intake_requests")
    .insert({ ...p, image_url: image.url ?? null, brand_id: brandId })
    .select("id, reference")
    .single();
  if (error) return { error: error.message };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await notify({
      eventKey: "campaign_intake.submitted",
      recipientProfileId: user.id,
      link: "/dashboard/campaigns",
      variables: { reference: created.reference },
    });
  }
  await notifyAdmins({
    eventKey: "admin.campaign_intake_received",
    link: "/dashboard/admin/campaigns/intake",
    variables: {
      reference: created.reference,
      brand_name: brand.brand_name ?? "A brand",
      budget: p.budget_expectation_gbp
        ? `£${Number(p.budget_expectation_gbp).toLocaleString("en-GB")}`
        : "not given",
    },
  });

  revalidatePath("/dashboard/campaigns");
  redirect("/dashboard/campaigns");
}

export async function updateCampaignIntake(
  _prev: CampaignState,
  formData: FormData,
): Promise<CampaignState> {
  const { supabase, brandId } = await requireBrand();
  const id = str(formData.get("id"));
  if (!id) return { error: "Missing request id." };
  const p = payload(formData);
  const invalid = validate(p, formData);
  if (invalid) return { error: invalid };

  const image = await uploadImage(formData.get("image"), "campaign");
  if (image.error) return { error: image.error };

  // RLS also enforces status = 'submitted' here — this .eq is belt-and-braces
  // so the error is a normal "not found" from the update matching zero rows,
  // not a raw RLS rejection.
  const { error } = await supabase
    .from("campaign_intake_requests")
    // Leaving the picker empty keeps the existing artwork.
    .update(image.url ? { ...p, image_url: image.url } : p)
    .eq("id", id)
    .eq("brand_id", brandId)
    .eq("status", "submitted");
  if (error) return { error: error.message };

  revalidatePath("/dashboard/campaigns");
  redirect("/dashboard/campaigns");
}

export async function withdrawCampaignIntake(formData: FormData) {
  const { supabase, brandId } = await requireBrand();
  const id = str(formData.get("id"));
  if (!id) return;
  await supabase
    .from("campaign_intake_requests")
    .delete()
    .eq("id", id)
    .eq("brand_id", brandId)
    .eq("status", "submitted");
  revalidatePath("/dashboard/campaigns");
}
