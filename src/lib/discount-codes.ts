import { roundMoney } from "@/lib/constants";
import type { RedemptionPlatform, SponsoredEventRewardTier } from "@/lib/types";

/**
 * Discount codes (0045) — shared by the admin actions, the artist actions and
 * the pages. See docs/discount-codes.md for the brief this implements.
 *
 * Three patterns, per "Discount Codes — How We're Planning to Build This":
 *   A  shared, uncapped  — distribution_model 'shared', participant_cap null
 *   B  shared, capped    — distribution_model 'shared', participant_cap N
 *   C  unique per person — distribution_model 'unique', codes from the pool
 */

/** No 0/O, 1/I/L — a code read aloud or retyped from a phone shouldn't be
 * ambiguous. 31 symbols; 8 of them is ~40 bits, far past guessable. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export const MAX_CODES_PER_BATCH = 1000;

/** Cap an individual code's text at what reward_code_pool's check allows. */
export const CODE_PATTERN = /^[A-Za-z0-9_-]{3,40}$/;

export const REDEMPTION_PLATFORMS: { value: RedemptionPlatform; label: string }[] = [
  { value: "eventbrite", label: "Eventbrite" },
  { value: "ticketmaster", label: "Ticketmaster" },
  { value: "stubhub", label: "StubHub" },
  { value: "shopify", label: "Shopify" },
  { value: "dice", label: "DICE" },
  { value: "see_tickets", label: "See Tickets" },
  { value: "skiddle", label: "Skiddle" },
  { value: "brand_site", label: "Brand's own website" },
  { value: "other", label: "Other" },
];

export function platformLabel(p: string | null | undefined): string | null {
  if (!p) return null;
  return REDEMPTION_PLATFORMS.find((x) => x.value === p)?.label ?? p;
}

/**
 * Where to type the code, per platform — informational only (Phase 2 is the
 * API integration). Shown to the participant under their code.
 */
export const PLATFORM_HOW_TO: Partial<Record<RedemptionPlatform, string>> = {
  eventbrite:
    "On the Eventbrite event page, choose “Get tickets”, then enter the code in the “Enter promo code” box before checkout.",
  ticketmaster:
    "On Ticketmaster, open the event, choose “Unlock” / “Have a code?” and enter the code before selecting seats.",
  stubhub: "Enter the code in the promo/discount field at StubHub checkout.",
  shopify: "Add the item to your basket and enter the code in the “Discount code” field at checkout.",
  dice: "Enter the code in the DICE app on the event page where it asks for a code.",
  see_tickets: "Enter the code in the promo code box on the See Tickets event page.",
  skiddle: "Enter the code in the “Promo code” field at Skiddle checkout.",
};

/**
 * Brand name → default prefix: first five letters/digits, upper-cased
 * ("first four or five letters of the brand name", 25 Sep standup). Returns
 * null when the name has fewer than two usable characters.
 */
export function brandPrefix(brandName: string | null | undefined): string | null {
  const cleaned = (brandName ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const p = cleaned.slice(0, 5);
  return p.length >= 2 ? p : null;
}

/** Normalises an admin-typed prefix to what 0045's check accepts, or null. */
export function normalisePrefix(raw: string | null | undefined): string | null {
  const p = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return p.length >= 2 ? p : null;
}

/**
 * One code: PREFIX-XXXX-XXXX (random part grouped in fours for legibility).
 * Uses the Web Crypto CSPRNG (available in Node and the browser), not
 * Math.random — the point of the 25 Sep ask was that someone holding one code
 * can't work out another. Rejection sampling keeps every symbol equally likely.
 */
function randomSymbol(): string {
  const n = CODE_ALPHABET.length;
  const limit = 256 - (256 % n);
  const buf = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return CODE_ALPHABET[buf[0] % n];
  }
}

export function generateCode(prefix: string | null, randomLength = 8): string {
  const len = Math.min(16, Math.max(6, Math.floor(randomLength)));
  let body = "";
  for (let i = 0; i < len; i++) body += randomSymbol();
  const grouped = body.match(/.{1,4}/g)!.join("-");
  return prefix ? `${prefix}-${grouped}` : grouped;
}

/** `count` distinct codes, none of which is in `existing`. */
export function generateCodes(
  count: number,
  prefix: string | null,
  randomLength: number,
  existing: Set<string> = new Set(),
): string[] {
  const out = new Set<string>();
  // Collisions are astronomically unlikely at ≥6 random chars; the bound only
  // stops a pathological loop.
  let guard = count * 20;
  while (out.size < count && guard-- > 0) {
    const c = generateCode(prefix, randomLength);
    if (!existing.has(c)) out.add(c);
  }
  return [...out];
}

export interface ParsedCode {
  code: string;
  external_ref: string | null;
}

/**
 * Parses a pasted or uploaded batch — one code per line, optionally followed
 * by a comma/tab/semicolon and an identification number (the artist's own
 * reference for that code). A header row whose first cell is "code" is
 * skipped, so an Eventbrite/Shopify export can be pasted as-is. Blank lines
 * and duplicates are dropped; invalid codes are reported rather than
 * silently skipped.
 */
export function parseCodeBatch(text: string): { codes: ParsedCode[]; invalid: string[] } {
  const codes: ParsedCode[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const [rawCode, ...rest] = trimmed.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (i === 0 && /^(discount\s*)?codes?$|^promo\s*code$/i.test(rawCode)) return;
    if (!CODE_PATTERN.test(rawCode)) {
      invalid.push(rawCode || trimmed);
      return;
    }
    if (seen.has(rawCode)) return;
    seen.add(rawCode);
    const ref = rest.join(" ").trim();
    codes.push({ code: rawCode, external_ref: ref ? ref.slice(0, 120) : null });
  });
  return { codes, invalid };
}

/** Participant-facing value, derived when the admin left the label blank. */
export function describeTierValue(
  t: Pick<SponsoredEventRewardTier, "value_label" | "discount_percent" | "value_gbp" | "code_type">,
): string {
  if (t.value_label) return t.value_label;
  if (t.discount_percent != null) return `${Number(t.discount_percent)}% off`;
  if (t.value_gbp != null) return `£${Number(t.value_gbp).toLocaleString("en-GB")} off`;
  return t.code_type === "merch" ? "Merchandise code" : "Discount code";
}

export function describePattern(
  t: Pick<SponsoredEventRewardTier, "distribution_model" | "participant_cap">,
): string {
  if (t.distribution_model === "unique") return "Unique code per person";
  return t.participant_cap != null
    ? `One shared code · first ${t.participant_cap} people`
    : "One shared code · no cap";
}

/** Admin margin on the discount cost the artist absorbs (25 Sep standup's
 * worked example: 50 × £25 ≈ £1,250, ~£1,375 with 10%). */
export const REWARD_ADMIN_MARGIN = 0.1;

/**
 * Worst-case cost of a tier to whoever absorbs the discount: cap × per-person
 * value (fixed £, or % of the ticket price). Null when it can't be known —
 * uncapped, merch, or a percentage with no ticket price.
 */
export function estimateTierCost(
  t: Pick<SponsoredEventRewardTier, "participant_cap" | "discount_percent" | "value_gbp">,
  ticketPriceGbp: number | null,
): { base: number; withMargin: number } | null {
  if (t.participant_cap == null) return null;
  let perPerson: number | null = null;
  if (t.value_gbp != null) perPerson = Number(t.value_gbp);
  else if (t.discount_percent != null && ticketPriceGbp != null)
    perPerson = (Number(ticketPriceGbp) * Number(t.discount_percent)) / 100;
  if (perPerson == null) return null;
  const base = roundMoney(perPerson * t.participant_cap);
  return { base, withMargin: roundMoney(base * (1 + REWARD_ADMIN_MARGIN)) };
}

/** Why a code couldn't be issued — rendered by the admin page's gate banner. */
export const ISSUE_REFUSALS = {
  not_confirmed: "The artist hasn't confirmed the discount-code setup yet — send it for review first.",
  pool_empty: "No unassigned codes left in this tier's pool — generate or upload more.",
  shared_missing: "This tier is a shared code but no code has been entered.",
  already: "This participant already has a live code for this event.",
} as const;
