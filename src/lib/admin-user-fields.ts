import {
  ARTIST_CATEGORIES,
  BRAND_CATEGORIES,
  EVENT_CATEGORIES,
  type Role,
} from "./constants";

/**
 * Declarative description of each role's profile table, so the admin user
 * editor can render and save all four role types from one generic form
 * instead of four near-duplicate ones. Keep in sync with the columns in
 * supabase/migrations/0001_schema.sql.
 */

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "tel"
  | "date"
  | "url"
  | "select"
  | "list"
  | "checkbox";

export interface FieldSpec {
  name: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  hint?: string;
  /** Renders full-width in the two-column grid. */
  wide?: boolean;
}

export interface RoleProfileSpec {
  table: string;
  label: string;
  /** NOT NULL column — the form refuses to save without it. */
  requiredField: string;
  sections: { title: string; description?: string; fields: FieldSpec[] }[];
  /** Columns stored as text[] — comma/newline separated in the form. */
  arrayFields: string[];
  /** Whether the table carries the shared social_links JSON blob. */
  hasSocials: boolean;
}

const SOCIAL_KEYS = [
  "instagram",
  "facebook",
  "youtube",
  "tiktok",
  "spotify",
  "linkedin",
  "x",
  "pinterest",
] as const;

export const SOCIAL_FIELD_KEYS = SOCIAL_KEYS;

export const ROLE_PROFILE_SPECS: Partial<Record<Role, RoleProfileSpec>> = {
  brand: {
    table: "brands",
    label: "Brand profile",
    requiredField: "brand_name",
    arrayFields: ["target_audience_keywords", "brand_keywords"],
    hasSocials: true,
    sections: [
      {
        title: "Public profile",
        fields: [
          { name: "brand_name", label: "Brand name", type: "text" },
          { name: "website_url", label: "Website", type: "url" },
          {
            name: "description",
            label: "Description",
            type: "textarea",
            wide: true,
          },
          {
            name: "product_category",
            label: "Product category",
            type: "select",
            options: BRAND_CATEGORIES,
          },
          {
            name: "product_category_other",
            label: "Category (if Other)",
            type: "text",
          },
        ],
      },
      {
        title: "Internal / matching",
        description: "Private to the brand and the Live·En·Synergy team.",
        fields: [
          {
            name: "mission_vision",
            label: "Mission & vision",
            type: "textarea",
            wide: true,
          },
          {
            name: "target_audience_keywords",
            label: "Target audience keywords",
            type: "list",
            hint: "Comma separated",
          },
          {
            name: "brand_keywords",
            label: "Brand keywords",
            type: "list",
            hint: "Comma separated",
          },
          { name: "preferred_genres", label: "Preferred genres", type: "text" },
          {
            name: "preferred_locations",
            label: "Preferred locations",
            type: "text",
          },
        ],
      },
      {
        title: "Sponsorship manager",
        fields: [
          { name: "manager_name", label: "Manager name", type: "text" },
          { name: "manager_email", label: "Manager email", type: "email" },
          { name: "manager_phone", label: "Manager phone", type: "tel" },
          {
            name: "company_address",
            label: "Company address",
            type: "textarea",
            wide: true,
          },
        ],
      },
    ],
  },

  artist: {
    table: "artists",
    label: "Artist profile",
    requiredField: "artist_name",
    arrayFields: ["art_keywords"],
    hasSocials: true,
    sections: [
      {
        title: "Public profile",
        fields: [
          { name: "artist_name", label: "Artist name", type: "text" },
          { name: "stage_name", label: "Stage name", type: "text" },
          { name: "bio", label: "Bio", type: "textarea", wide: true },
          {
            name: "category",
            label: "Category",
            type: "select",
            options: ARTIST_CATEGORIES,
          },
          {
            name: "category_other",
            label: "Category (if Other)",
            type: "text",
          },
          { name: "website_url", label: "Website", type: "url" },
        ],
      },
      {
        title: "Internal details",
        description: "Not shown publicly.",
        fields: [
          { name: "date_of_birth", label: "Date of birth", type: "date" },
          { name: "location", label: "Location", type: "text" },
          { name: "contact_name", label: "Contact name", type: "text" },
          { name: "contact_email", label: "Contact email", type: "email" },
          { name: "contact_phone", label: "Contact phone", type: "tel" },
          { name: "address", label: "Address", type: "textarea", wide: true },
          {
            name: "art_keywords",
            label: "Art keywords",
            type: "list",
            hint: "Comma separated",
          },
          {
            name: "mission_vision",
            label: "Mission & vision",
            type: "textarea",
            wide: true,
          },
        ],
      },
      {
        title: "Sponsor value",
        fields: [
          {
            name: "sponsor_value_details",
            label: "What they offer sponsors",
            type: "textarea",
            wide: true,
          },
        ],
      },
    ],
  },

  event: {
    table: "event_organisers",
    label: "Event organiser profile",
    requiredField: "event_name",
    arrayFields: ["keywords"],
    hasSocials: true,
    sections: [
      {
        title: "Public profile",
        fields: [
          { name: "event_name", label: "Event / organisation name", type: "text" },
          { name: "website_url", label: "Website", type: "url" },
          {
            name: "description",
            label: "Description",
            type: "textarea",
            wide: true,
          },
          {
            name: "category",
            label: "Category",
            type: "select",
            options: EVENT_CATEGORIES,
          },
          {
            name: "category_other",
            label: "Category (if Other)",
            type: "text",
          },
        ],
      },
      {
        title: "Internal details",
        description: "Not shown publicly.",
        fields: [
          {
            name: "existing_partners",
            label: "Existing partners / sponsors",
            type: "text",
          },
          { name: "contact_name", label: "Contact name", type: "text" },
          { name: "contact_email", label: "Contact email", type: "email" },
          { name: "contact_phone", label: "Contact phone", type: "tel" },
          {
            name: "company_address",
            label: "Company address",
            type: "textarea",
            wide: true,
          },
          {
            name: "keywords",
            label: "Keywords",
            type: "list",
            hint: "Comma separated",
          },
          {
            name: "mission_vision",
            label: "Mission & vision",
            type: "textarea",
            wide: true,
          },
        ],
      },
      {
        title: "Sponsor value",
        fields: [
          {
            name: "sponsor_value_details",
            label: "What they offer sponsors",
            type: "textarea",
            wide: true,
          },
        ],
      },
    ],
  },

  audience: {
    table: "audience_members",
    label: "Audience profile",
    requiredField: "full_name",
    arrayFields: [],
    hasSocials: false,
    sections: [
      {
        title: "Personal details",
        description:
          "Used to verify attendance and release rewards. Handle with care.",
        fields: [
          { name: "full_name", label: "Full name", type: "text" },
          { name: "phone_country_code", label: "Phone country code", type: "text" },
          { name: "phone", label: "Phone", type: "tel" },
          { name: "date_of_birth", label: "Date of birth", type: "date" },
          { name: "postcode", label: "Postcode", type: "text" },
          { name: "address", label: "Address", type: "textarea", wide: true },
          {
            name: "verified",
            label: "Identity verified",
            type: "checkbox",
            wide: true,
          },
        ],
      },
    ],
  },
};

/** Every field name across a spec — used when building the update payload. */
export function specFieldNames(spec: RoleProfileSpec): FieldSpec[] {
  return spec.sections.flatMap((s) => s.fields);
}
