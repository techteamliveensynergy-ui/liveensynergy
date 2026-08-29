"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  ROLES,
  ROLE_LABELS,
  netSponsorshipBudget,
  roundMoney,
  type Role,
} from "@/lib/constants";
import {
  ROLE_PROFILE_SPECS,
  SOCIAL_FIELD_KEYS,
  specFieldNames,
} from "@/lib/admin-user-fields";
import { notify } from "@/lib/notifications";
import { requireAdmin } from "@/lib/profile";

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
/** Like `num`, but an empty field stays empty rather than becoming 0. */
function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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
      // Restoring manually (e.g. after a successful appeal) also lifts an
      // automatic no-show suspension rather than leaving it to time out.
      suspended_until: next ? null : undefined,
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

// --- Campaign packages -------------------------------------------------------

function packagePayload(formData: FormData) {
  return {
    slug: str(formData.get("slug")),
    name: str(formData.get("name")),
    description: str(formData.get("description")),
    is_custom_price: formData.get("is_custom_price") === "on",
    participant_count: numOrNull(formData.get("participant_count")),
    price_gbp: numOrNull(formData.get("price_gbp")),
    min_price_gbp: numOrNull(formData.get("min_price_gbp")),
    price_increment_gbp: numOrNull(formData.get("price_increment_gbp")),
    platform_margin_gbp: num(formData.get("platform_margin_gbp")),
    sort_order: num(formData.get("sort_order")),
  };
}

/** Mirrors the campaign_packages_pricing_shape DB check constraint, so a bad
 * combination surfaces as a form error instead of a raw constraint-violation
 * message. */
function validatePackage(p: ReturnType<typeof packagePayload>) {
  if (!p.name || !p.slug) return "Name and slug are required.";
  if (p.is_custom_price) {
    if (p.min_price_gbp == null || p.price_increment_gbp == null) {
      return "Custom-price packages need a minimum price and an increment.";
    }
  } else if (p.price_gbp == null || p.participant_count == null) {
    return "Fixed-price packages need a price and a participant count.";
  }
  return null;
}

export async function createPackage(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const p = packagePayload(formData);
  const invalid = validatePackage(p);
  if (invalid) return { error: invalid };
  const { error } = await supabase.from("campaign_packages").insert(p);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/admin/packages");
  redirect("/dashboard/admin/packages");
}

export async function updatePackage(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return { error: "Missing package id." };
  const p = packagePayload(formData);
  const invalid = validatePackage(p);
  if (invalid) return { error: invalid };
  const { error } = await supabase
    .from("campaign_packages")
    .update(p)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/dashboard/admin/packages");
  redirect("/dashboard/admin/packages");
}

export async function togglePackageActive(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  const next = str(formData.get("next")) === "true";
  if (!id) return;
  await supabase
    .from("campaign_packages")
    .update({ is_active: next })
    .eq("id", id);
  revalidatePath("/dashboard/admin/packages");
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

/**
 * How far along a sponsorship is. A status may move up this ladder but never
 * back down (3 Aug standup): once both parties have confirmed a deal, dropping
 * it back to "in progress" would silently reopen terms they've already signed
 * off, and there's no audit trail to say who changed what.
 *
 * `withdrawn` sits outside the ladder — it's where the losing proposals go
 * when a campaign's other suggestion is accepted, and it's terminal.
 */
const SPONSORED_STATUS_RANK: Record<string, number> = {
  in_progress: 0,
  confirmed: 1,
  completed: 2,
};

export async function setSponsoredStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status) return;

  const { data: current } = await supabase
    .from("sponsored_events")
    .select("status")
    .eq("id", id)
    .maybeSingle<{ status: string }>();
  if (!current) return;

  const from = SPONSORED_STATUS_RANK[current.status];
  const to = SPONSORED_STATUS_RANK[status];

  // Anything involving `withdrawn`, or an unrecognised status, isn't a manual
  // move — those are driven by the campaign acceptance flow.
  if (from == null || to == null) return;
  if (to < from) return;

  await supabase.from("sponsored_events").update({ status }).eq("id", id);
  revalidatePath("/dashboard/admin/events");
  revalidatePath(`/dashboard/admin/events/sponsored/${id}`);
}

/**
 * Admin edit of a sponsored event's details.
 *
 * Sakshi couldn't move a participation deadline once it had passed, and the
 * parties themselves can't touch a confirmed deal (by design — neither side
 * should be able to change terms the other agreed to). So the admin console
 * gets the escape hatch: everything except the status is editable right up to
 * completion. A completed event is closed for edits.
 */
export async function adminUpdateSponsoredEvent(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return { error: "Missing event id." };

  const { data: current } = await supabase
    .from("sponsored_events")
    .select("status, budget_gbp, remaining_budget_gbp, listing_id")
    .eq("id", id)
    .maybeSingle<{
      status: string;
      budget_gbp: number | null;
      remaining_budget_gbp: number | null;
      listing_id: string | null;
    }>();
  if (!current) return { error: "That sponsorship no longer exists." };
  if (current.status === "completed") {
    return { error: "This event is completed — its details are locked." };
  }

  const name = str(formData.get("name"));
  if (!name) return { error: "Event name is required." };

  const budget = numOrNull(formData.get("budget_gbp"));

  const patch: Record<string, unknown> = {
    name,
    event_date: str(formData.get("event_date")),
    start_time: str(formData.get("start_time")),
    venue_details: str(formData.get("venue_details")),
    location: str(formData.get("location")),
    participation_deadline: str(formData.get("participation_deadline")),
    terms: str(formData.get("terms")),
    reward_rules: str(formData.get("reward_rules")),
    branding_guidelines: str(formData.get("branding_guidelines")),
    attendance_method: str(formData.get("attendance_method")),
    budget_gbp: budget,
  };

  // Changing the budget has to re-derive what's left to pay out: net of the
  // platform fee, less whatever has already been released.
  if (budget !== current.budget_gbp) {
    const { data: released } = await supabase
      .from("participations")
      .select("reward_amount_gbp")
      .eq("sponsored_event_id", id)
      .not("reward_amount_gbp", "is", null);

    const spent = (released ?? []).reduce(
      (sum, r) => sum + Number((r as { reward_amount_gbp: number }).reward_amount_gbp ?? 0),
      0,
    );
    const net = netSponsorshipBudget(budget);
    patch.remaining_budget_gbp =
      net == null ? null : roundMoney(Math.max(0, net - spent));
  }

  const { error } = await supabase
    .from("sponsored_events")
    .update(patch)
    .eq("id", id);
  if (error) return { error: error.message };

  // Ticket price and capacity belong to the event listing, not the
  // sponsorship — which is why they weren't editable here at all, even though
  // the sponsorship page quotes both and derives "people this can sponsor"
  // from the ticket price (10 Aug standup). Written through to the listing so
  // the two views can't disagree. An event with no linked listing has nowhere
  // to put them, and the form hides the fields in that case.
  if (current.listing_id) {
    const ticketPrice = numOrNull(formData.get("ticket_price_gbp"));
    const capacity = numOrNull(formData.get("capacity"));
    const { error: listingError } = await supabase
      .from("event_listings")
      .update({
        ticket_price_gbp: ticketPrice,
        capacity: capacity == null ? null : Math.round(capacity),
      })
      .eq("id", current.listing_id);
    if (listingError) return { error: listingError.message };
    revalidatePath(`/dashboard/events/${current.listing_id}`);
  }

  revalidatePath(`/dashboard/admin/events/sponsored/${id}`);
  revalidatePath(`/dashboard/sponsored/${id}`);
  revalidatePath("/dashboard/admin/events");
  return { success: true };
}
