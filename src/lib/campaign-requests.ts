import type { CampaignIntakeRequest, CampaignIntakeStatus } from "./types";

/**
 * Brand-facing names for a campaign request's status. "Converted" alone
 * didn't tell a brand where the request went (13 Oct client notes).
 */
export const CAMPAIGN_INTAKE_STATUS_LABELS: Record<CampaignIntakeStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  converted: "Converted to Live Campaign",
  declined: "Declined",
};

type CategoryFields = Pick<CampaignIntakeRequest, "category" | "category_other"> & {
  categories?: string[] | null;
};

/**
 * Every category on a request, with "Other" expanded to what the brand typed.
 * Reads `categories` (0063) and falls back to the single `category` for a row
 * read before 0063 was applied. "Other" is matched case-insensitively — the
 * form stores "Other", but older admin code compared against "other".
 */
export function requestCategories(r: CategoryFields): string[] {
  const list = r.categories && r.categories.length > 0 ? r.categories : r.category ? [r.category] : [];
  return list.map((c) =>
    c.toLowerCase() === "other" ? (r.category_other ? `Other: ${r.category_other}` : "Other") : c,
  );
}

export function requestCategoryLabel(r: CategoryFields): string | null {
  const list = requestCategories(r);
  return list.length > 0 ? list.join(", ") : null;
}

/**
 * A request's or campaign's display name (client feedback, 13 Oct: lists read
 * "Conferences" because there was no name, only the category). Its own name
 * first (0067), then the artist/event in mind, then the categories.
 */
export function campaignTitle(
  c: CategoryFields & { campaign_name?: string | null; target_name?: string | null },
  fallback: string,
): string {
  return c.campaign_name?.trim() || c.target_name?.trim() || requestCategoryLabel(c) || fallback;
}
