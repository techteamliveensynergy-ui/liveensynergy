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
 * A request's or campaign's display name. Its own name first (0067), then
 * the artist/event in mind, then the caller's fallback — callers pass one
 * built from the reference ("Campaign CMP-00012").
 *
 * The category is deliberately not a fallback any more: lists read
 * "Conferences" for every unnamed campaign (13 Oct, again 26 Oct, #75).
 * It still shows as its own chip where cards show it. Admins find unnamed
 * campaigns through the "No name yet" filter and name them.
 */
export function campaignTitle(
  c: CategoryFields & { campaign_name?: string | null; target_name?: string | null },
  fallback: string,
): string {
  return c.campaign_name?.trim() || c.target_name?.trim() || fallback;
}

/**
 * How a campaign is named in notifications, emails and one-line labels
 * (client feedback, 13 Oct: brands saw bare codes like "CMP-00010"). The
 * name, with the reference kept in brackets for anyone quoting it to the team.
 */
export function campaignLabel(c: { campaign_name?: string | null; reference?: string | null }): string {
  const name = c.campaign_name?.trim();
  const ref = c.reference?.trim();
  if (name) return ref ? `“${name}” (${ref})` : `“${name}”`;
  return ref ?? "your campaign";
}
