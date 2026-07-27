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
  artist: "Artist",
  event: "Event Organiser",
  audience: "Audience",
  admin: "Admin",
};

/** How a user answers the sign-up question "Are you an Artist/Event or Sponsor?" */
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
    title: "Artist",
    description:
      "You perform or create, and you're looking for sponsorship for your events.",
  },
  {
    value: "event",
    title: "Event Organiser",
    description:
      "You run events and want to secure sponsorship and confirmed attendance.",
  },
  {
    value: "audience",
    title: "Audience",
    description:
      "You want to attend events and unlock sponsor-funded rewards and reimbursements.",
  },
];

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
