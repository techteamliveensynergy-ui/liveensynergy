import type { Role } from "./constants";

/**
 * Profile completeness.
 *
 * Onboarding is deliberately short so people actually finish it, so the
 * pressure to fill in the rest lands here instead: a badge nudges users toward
 * the gaps, and the fields marked `required` block event and campaign creation
 * until they're filled (agreed in the 24 Jul standup).
 */

export interface CompletenessField {
  key: string;
  label: string;
  /** Blocks event/campaign creation while missing. */
  required?: boolean;
}

export interface Completeness {
  percent: number;
  missing: CompletenessField[];
  /** Missing fields that block creating events or campaigns. */
  blocking: CompletenessField[];
  complete: boolean;
}

type Row = Record<string, unknown> | null | undefined;

const FIELDS_BY_ROLE: Record<string, CompletenessField[]> = {
  artist: [
    { key: "artist_name", label: "Artist name", required: true },
    { key: "contact_phone", label: "Contact phone number", required: true },
    { key: "location", label: "Location", required: true },
    { key: "category", label: "Category", required: true },
    { key: "bio", label: "Bio" },
    { key: "profile_image_url", label: "Profile image" },
    { key: "banner_url", label: "Banner image" },
    { key: "sponsor_value_details", label: "What sponsors get" },
    { key: "social_links", label: "Social links" },
  ],
  event: [
    { key: "event_name", label: "Event / organisation name", required: true },
    { key: "contact_phone", label: "Contact phone number", required: true },
    { key: "category", label: "Category", required: true },
    { key: "description", label: "Description" },
    { key: "profile_image_url", label: "Profile image" },
    { key: "banner_url", label: "Banner image" },
    { key: "sponsor_value_details", label: "What sponsors get" },
    { key: "social_links", label: "Social links" },
  ],
  brand: [
    { key: "brand_name", label: "Brand name", required: true },
    { key: "manager_phone", label: "Manager phone number", required: true },
    { key: "manager_email", label: "Manager email", required: true },
    { key: "product_category", label: "Product category", required: true },
    { key: "description", label: "Description" },
    { key: "logo_url", label: "Brand logo" },
    { key: "banner_url", label: "Banner image" },
    { key: "mission_vision", label: "Mission & vision" },
    { key: "social_links", label: "Social links" },
  ],
  audience: [
    { key: "full_name", label: "Full name", required: true },
    { key: "phone", label: "Phone number", required: true },
    { key: "date_of_birth", label: "Date of birth" },
    { key: "postcode", label: "Postcode" },
  ],
};

function filled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function assessProfile(role: Role, row: Row): Completeness {
  const fields = FIELDS_BY_ROLE[role] ?? [];
  if (fields.length === 0) {
    return { percent: 100, missing: [], blocking: [], complete: true };
  }

  const missing = fields.filter((f) => !filled(row?.[f.key]));
  const percent = Math.round(
    ((fields.length - missing.length) / fields.length) * 100,
  );

  return {
    percent,
    missing,
    blocking: missing.filter((f) => f.required),
    complete: missing.length === 0,
  };
}

/** The role-specific table a profile's details live in. */
export const PROFILE_TABLE: Record<string, string> = {
  brand: "brands",
  artist: "artists",
  event: "event_organisers",
  audience: "audience_members",
};
