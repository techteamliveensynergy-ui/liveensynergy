"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLES } from "@/lib/constants";

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
  revalidatePath("/dashboard/admin/users");
}

export async function assignPlan(formData: FormData) {
  const { supabase } = await requireAdmin();
  const userId = str(formData.get("user_id"));
  if (!userId) return;
  const planId = str(formData.get("plan_id")); // null clears the plan
  await supabase.from("profiles").update({ plan_id: planId }).eq("id", userId);
  revalidatePath("/dashboard/admin/users");
}

export async function toggleUserActive(formData: FormData) {
  const { supabase } = await requireAdmin();
  const userId = str(formData.get("user_id"));
  const next = str(formData.get("next")) === "true";
  if (!userId) return;
  await supabase.from("profiles").update({ is_active: next }).eq("id", userId);
  revalidatePath("/dashboard/admin/users");
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
