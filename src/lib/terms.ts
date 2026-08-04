import type { Role } from "./constants";

/**
 * Terms & conditions, split by party (3 Aug standup — a brand, an artist and
 * an audience member are agreeing to materially different things, so one
 * blanket checkbox at sign-up didn't reflect what was actually being accepted).
 *
 * The summaries below are what someone sees next to the sign-up checkbox; the
 * full copy lives on /terms under the matching anchor. Both read from here so
 * they can't drift apart.
 *
 * The full legal copy is still being drafted — see the note at the foot of the
 * terms page. These summaries describe the platform as it actually behaves
 * today and should be reviewed against the final wording.
 */

/**
 * Bumped whenever the terms change. Stamped onto `profiles.terms_version` at
 * sign-up so it's possible to tell who agreed to which revision.
 */
export const TERMS_VERSION = "2026-07-12";

export interface PartyTerms {
  /** Anchor on /terms, and the key used for lookups. */
  key: "brand" | "artist" | "audience";
  /** How the agreement names this party. */
  party: string;
  points: string[];
}

export const PARTY_TERMS: Record<PartyTerms["key"], PartyTerms> = {
  brand: {
    key: "brand",
    party: "Brands & Sponsors",
    points: [
      "You commit the sponsorship budget you set out in a campaign, and honour the reward rules attached to it.",
      "The Live·En·Synergy service fee — the greater of £315 + VAT or 9% + VAT of the budget — is deducted from that budget before anything is paid out to audience members.",
      "A sponsorship is binding on both parties once you and the artist or organiser have both agreed to it, and can only be changed after that by contacting the Live·En·Synergy team.",
      "Audience data is shared with you only in aggregate, or where an individual has explicitly consented.",
    ],
  },
  artist: {
    key: "artist",
    party: "Artists & Event Organisers",
    points: [
      "The event details you list — dates, venue, capacity, ticket price — are accurate, and you'll keep them up to date.",
      "You'll deliver the branding and sponsor benefits you've agreed for a sponsored event.",
      "A sponsorship is binding on both parties once you and the brand have both agreed to it, and can only be changed after that by contacting the Live·En·Synergy team.",
      "You'll help confirm audience attendance at the venue, by the method set out on the event.",
    ],
  },
  audience: {
    key: "audience",
    party: "Audience Members",
    points: [
      "The details you give us — name, contact details, date of birth — are your own and are accurate. One account per person.",
      "Rewards are only released after your attendance is verified, in line with each event's reward rules. Being selected isn't a guarantee of payment.",
      "Ticket proof you upload is genuine and yours. Sharing a check-in QR code with someone who isn't at the venue, or repeatedly not turning up after being selected, can suspend your account.",
      "Your personal details are never sold, and are only shared with a sponsor where you've explicitly consented.",
    ],
  },
};

/**
 * Which set of terms applies to a role. Event organisers were merged into the
 * artist category, and both were already agreeing to the same things.
 */
export function termsForRole(role: Role | ""): PartyTerms | null {
  if (role === "brand") return PARTY_TERMS.brand;
  if (role === "artist" || role === "event") return PARTY_TERMS.artist;
  if (role === "audience") return PARTY_TERMS.audience;
  return null;
}

export const ALL_PARTY_TERMS = [
  PARTY_TERMS.brand,
  PARTY_TERMS.artist,
  PARTY_TERMS.audience,
];
