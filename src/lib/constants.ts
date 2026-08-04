/**
 * Shared option lists and enums, mirrored from the platform concept doc.
 * Keep these in sync with the `enum` types defined in the database schema
 * (supabase/migrations).
 */

/** Roles a new user can pick at sign-up. */
export const ROLES = ["brand", "artist", "event", "audience"] as const;
export type SignupRole = (typeof ROLES)[number];

/** All roles a profile can hold (admin is assigned manually, not at sign-up). */
export type Role = SignupRole | "admin";

export const ROLE_LABELS: Record<Role, string> = {
  brand: "Brand / Sponsor",
  // Artists and event organisers were merged into one category (3 Aug
  // standup) — the two used the platform in exactly the same way. `event`
  // stays in the enum for accounts created before the merge.
  artist: "Artist / Event Organiser",
  event: "Event Organiser",
  audience: "Audience",
  admin: "Admin",
};

/**
 * How a user answers the sign-up question "Are you an Artist/Event or Sponsor?"
 *
 * There is deliberately no separate "Event Organiser" card: organisers sign up
 * under `artist`, which carries identical nav, onboarding and permissions.
 * Existing `event` accounts are untouched and keep working as they are.
 */
export const SIGNUP_ROLE_OPTIONS: {
  value: Role;
  title: string;
  description: string;
}[] = [
  {
    value: "brand",
    title: "Brand / Sponsor",
    description:
      "You want to sponsor live events and connect with engaged audiences.",
  },
  {
    value: "artist",
    title: "Artist / Event Organiser",
    description:
      "You perform, create or run events, and you're looking for sponsorship.",
  },
  {
    value: "audience",
    title: "Audience",
    description:
      "You want to attend events and unlock sponsor-funded rewards and reimbursements.",
  },
];

/**
 * Gender options for the audience profile (3 Aug standup). "Prefer to
 * self-describe" hands over to a free-text box, stored separately in
 * `audience_members.gender_self_describe` so the standard options stay
 * countable without pattern matching free text.
 */
export const GENDER_OPTIONS = [
  "Woman",
  "Man",
  "Non-binary",
  "Prefer to self-describe",
  "Prefer not to say",
] as const;

/** The option that reveals the free-text box. */
export const GENDER_SELF_DESCRIBE = "Prefer to self-describe";

/** Brand product categories */
export const BRAND_CATEGORIES = [
  "Tech",
  "Food",
  "Automotive",
  "Beverage",
  "Consumer Products",
  "Beauty",
  "Fashion",
  "Finance",
  "Travel",
  "Entertainment",
  "Other",
] as const;

/**
 * Artist categories. "Sports" replaced the older "Sportsperson" label — see
 * migration 0008, which rewrites the stored value on existing rows.
 */
export const ARTIST_CATEGORIES = [
  "Music",
  "Comedy",
  "Sports",
  "Gaming",
  "Conference",
  "Visual Artists",
  "Digital or Multimedia Artists",
  "Other",
] as const;

/** Event categories */
export const EVENT_CATEGORIES = [
  "Music",
  "Comedy",
  "Sports",
  "Conference & Academic",
  "Exhibition / Expo",
  "Theatre",
  "Gaming & E-sports",
  "Fashion",
  "Other",
] as const;

/** Sponsorship budget ranges (GBP) for event listings */
export const BUDGET_RANGES = [
  "Under £500",
  "£500 – £1,000",
  "£1,000 – £2,500",
  "£2,500 – £5,000",
  "£5,000 – £10,000",
  "£10,000 – £25,000",
  "£25,000+",
] as const;

export const CAMPAIGN_STATUSES = [
  "in_progress",
  "closed",
  "completed",
] as const;

export const CAMPAIGN_STATUS_LABELS: Record<
  (typeof CAMPAIGN_STATUSES)[number],
  string
> = {
  in_progress: "In Progress",
  closed: "Closed",
  completed: "Completed",
};

export const SPONSORSHIP_STATUSES = [
  "in_progress",
  "confirmed",
  "completed",
  // Set automatically when a campaign's other suggestion is accepted — never
  // chosen by hand, so it isn't offered in the admin status picker.
  "withdrawn",
] as const;

/** Live-En-Synergy platform fee model (from the concept doc) */
export const PLATFORM_FEE = {
  minFlatGbp: 315,
  vatRate: 0.2,
  percentage: 0.09,
} as const;

/**
 * Smallest budget that leaves anything to sponsor with — the flat fee inc. VAT
 * (£378). At or below this the service fee consumes the entire budget, and
 * below £378 `availableForSponsorship` goes negative, so campaigns are
 * rejected at this floor rather than stored with a negative remaining budget.
 */
export const MIN_SPONSORSHIP_BUDGET_GBP =
  PLATFORM_FEE.minFlatGbp * (1 + PLATFORM_FEE.vatRate);

/**
 * Computes the Live-En-Synergy service fee for a given gross sponsorship
 * budget: the greater of £315 + VAT or 9% + VAT of the budget.
 *
 * Note the flat minimum dominates until £3,500 (9% of £3,500 = £315), so small
 * budgets are mostly fee. That's the model, not a bug.
 */
export function computePlatformFee(grossBudgetGbp: number) {
  const flatExVat = PLATFORM_FEE.minFlatGbp;
  const pctExVat = grossBudgetGbp * PLATFORM_FEE.percentage;
  const feeExVat = Math.max(flatExVat, pctExVat);
  const vat = feeExVat * PLATFORM_FEE.vatRate;
  const feeIncVat = feeExVat + vat;
  return {
    feeExVat,
    vat,
    feeIncVat,
    availableForSponsorship: grossBudgetGbp - feeIncVat,
  };
}

/** Rounds to whole pence, so repeated arithmetic can't drift into 0.1 + 0.2. */
export function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * What a gross budget actually leaves to spend on audience rewards, once the
 * platform fee and its VAT are taken off. This — not the gross figure — is
 * what a sponsorship's `remaining_budget_gbp` starts at, and what every
 * "remaining budget" / "people this can sponsor" number is derived from.
 *
 * Returns null for a missing budget so callers can render "—" rather than £0.
 */
export function netSponsorshipBudget(
  grossBudgetGbp: number | null | undefined,
): number | null {
  if (grossBudgetGbp == null) return null;
  const gross = Number(grossBudgetGbp);
  if (!Number.isFinite(gross)) return null;
  return roundMoney(
    Math.max(0, computePlatformFee(gross).availableForSponsorship),
  );
}
