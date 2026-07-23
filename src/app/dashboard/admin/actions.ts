"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/constants";
import {
  ROLE_PROFILE_SPECS,
  SOCIAL_FIELD_KEYS,
  specFieldNames,
} from "@/lib/admin-user-fields";
import { notify } from "@/lib/notifications";

export interface AdminState {
  error?: string;
  success?: boolean;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}
function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}
/** Splits a comma / newline separated string into a trimmed array. */
function toArray(v: FormDataEntryValue | null): string[] | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Ensures the caller is an admin (RLS also enforces this at the DB layer). */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/dashboard");

  return { supabase };
}

const ALL_ROLES = [...ROLES, "admin"] as const;

// --- Users -----------------------------------------------------------------

export async function setUserRole(formData: FormData) {
  const { supabase } = await requireAdmin();
  const userId = str(formData.get("user_id"));
  const role = str(formData.get("role"));
  if (!userId || !role || !ALL_ROLES.includes(role as (typeof ALL_ROLES)[number]))
    return;
  await supabase.from("profiles").update({ role }).eq("id", userId);
  await notify({
    eventKey: "account.role_changed",
    recipientProfileId: userId,
    variables: { role_label: ROLE_LABELS[role as Role] ?? role },
  });
  revalidatePath("/dashboard/admin/users");
}

export async function assignPlan(formData: FormData) {
  const { supabase } = await requireAdmin();
  const userId = str(formData.get("user_id"));
  if (!userId) return;
  const planId = str(formData.get("plan_id")); // null clears the plan
  await supabase.from("profiles").update({ plan_id: planId }).eq("id", userId);

  const { data: plan } = planId
    ? await supabase.from("plans").select("name").eq("id", planId).maybeSingle()
    : { data: null };
  await notify({
    eventKey: "account.plan_changed",
    recipientProfileId: userId,
    variables: { plan_name: plan?.name ?? "No plan" },
  });

  revalidatePath("/dashboard/admin/users");
}

export async function toggleUserActive(formData: FormData) {
  const { supabase } = await requireAdmin();
  const userId = str(formData.get("user_id"));
  const next = str(formData.get("next")) === "true";
  if (!userId) return;
  const reason = str(formData.get("reason"));
  await supabase
    .from("profiles")
    .update({
      is_active: next,
      blocked_at: next ? null : new Date().toISOString(),
      blocked_reason: next ? null : reason,
    })
    .eq("id", userId);

  await notify({
    eventKey: next ? "account.restored" : "account.blocked",
    recipientProfileId: userId,
    variables: { reason: reason ?? undefined },
  });

  revalidatePath("/dashboard/admin/users");
  revalidatePath(`/dashboard/admin/users/${userId}`);
}

/** Account-level fields (name, email label, role, plan) on one form. */
export async function updateUserAccount(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const userId = str(formData.get("user_id"));
  if (!userId) return { error: "Missing user id." };

  const role = str(formData.get("role"));
  if (!role || !ALL_ROLES.includes(role as (typeof ALL_ROLES)[number])) {
    return { error: "Pick a valid role." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: str(formData.get("full_name")),
      email: str(formData.get("email")),
      role,
      plan_id: str(formData.get("plan_id")),
      onboarding_completed:
        String(formData.get("onboarding_completed") ?? "") === "on",
    })
    .eq("id", userId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/admin/users");
  revalidatePath(`/dashboard/admin/users/${userId}`);
  return { success: true };
}

/**
 * Saves a user's role-specific profile (brands / artists / event_organisers /
 * audience_members), driven by ROLE_PROFILE_SPECS so one action covers all
 * four tables. RLS already lets admins write these rows.
 */
export async function updateUserRoleProfile(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const userId = str(formData.get("user_id"));
  const role = str(formData.get("role")) as Role | null;
  if (!userId || !role) return { error: "Missing user id or role." };

  const spec = ROLE_PROFILE_SPECS[role];
  if (!spec) return { error: "This role has no editable profile." };

  const payload: Record<string, unknown> = { profile_id: userId };

  for (const field of specFieldNames(spec)) {
    const raw = formData.get(field.name);
    if (field.type === "checkbox") {
      payload[field.name] = String(raw ?? "") === "on";
    } else if (spec.arrayFields.includes(field.name)) {
      payload[field.name] = toArray(raw);
    } else {
      payload[field.name] = str(raw);
    }
  }

  if (!payload[spec.requiredField]) {
    const label =
      specFieldNames(spec).find((f) => f.name === spec.requiredField)?.label ??
      spec.requiredField;
    return { error: `${label} is required.` };
  }

  if (spec.hasSocials) {
    const links: Record<string, string> = {};
    for (const key of SOCIAL_FIELD_KEYS) {
      const v = str(formData.get(`social_${key}`));
      if (v) links[key] = v;
    }
    payload.social_links = Object.keys(links).length ? links : null;
  }

  const { error } = await supabase
    .from(spec.table)
    .upsert(payload, { onConflict: "profile_id" });

  if (error) return { error: error.message };

  revalidatePath(`/dashboard/admin/users/${userId}`);
  return { success: true };
}

// --- Plans -----------------------------------------------------------------

function planPayload(formData: FormData) {
  const features = String(formData.get("features") ?? "")
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  return {
    slug: str(formData.get("slug")),
    name: str(formData.get("name")),
    description: str(formData.get("description")),
    price_gbp: num(formData.get("price_gbp")),
    billing_interval: str(formData.get("billing_interval")) ?? "month",
    features: features.length ? features : null,
    sort_order: num(formData.get("sort_order")),
  };
}

export async function createPlan(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const p = planPayload(formData);
  if (!p.name || !p.slug) return { error: "Name and slug are required." };
  const { error } = await supabase.from("plans").insert(p);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/admin/plans");
  redirect("/dashboard/admin/plans");
}

export async function updatePlan(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return { error: "Missing plan id." };
  const p = planPayload(formData);
  if (!p.name || !p.slug) return { error: "Name and slug are required." };
  const { error } = await supabase.from("plans").update(p).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/admin/plans");
  redirect("/dashboard/admin/plans");
}

export async function togglePlanActive(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  const next = str(formData.get("next")) === "true";
  if (!id) return;
  await supabase.from("plans").update({ is_active: next }).eq("id", id);
  revalidatePath("/dashboard/admin/plans");
}

// --- Events / monitoring ---------------------------------------------------

export async function setListingStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  await supabase.from("event_listings").update({ status }).eq("id", id);
  revalidatePath("/dashboard/admin/events");
}

export async function setSponsoredStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status) return;
  await supabase.from("sponsored_events").update({ status }).eq("id", id);
  revalidatePath("/dashboard/admin/events");
}
