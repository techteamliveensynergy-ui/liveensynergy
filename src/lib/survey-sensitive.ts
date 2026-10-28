/**
 * Sensitive personal data in surveys (GitHub #54).
 *
 * Two different checks:
 *
 * 1. While a question is being written (the builder): does its wording
 *    touch a UK GDPR special category (Article 9), criminal records
 *    (Article 10) or a direct identifier? Rule-based on an explicit,
 *    reviewable word list. A match is a WARNING the admin acknowledges with
 *    a reason, never a block. "I love the band Religion" will match; that's
 *    what the acknowledgement is for. It doesn't decide what's lawful.
 *
 * 2. In open-text answers (masking): emails, phone numbers and the like.
 *    That runs in Postgres (survey_mask_pii(), migration 0094), so no export
 *    path can skip it. MASK_LABELS documents what the SQL replaces them with.
 *
 * Gender, age and income are deliberately not on the list: they're expected
 * demographic questions and not special-category. Ethnicity is.
 */

export type SensitiveKey =
  | "health"
  | "ethnicity"
  | "religion"
  | "sexuality"
  | "politics"
  | "trade_union"
  | "genetic_biometric"
  | "criminal"
  | "identifier";

export const SENSITIVE_CATEGORIES: Record<SensitiveKey, { label: string; terms: string[] }> = {
  health: {
    label: "Health or medical",
    terms: [
      "health", "medical", "medication", "medicine", "illness", "disability", "disabled", "diagnosis",
      "diagnosed", "mental health", "depression", "anxiety", "pregnant", "pregnancy", "hiv", "diabetes",
      "allergy", "allergies", "nhs number", "symptoms", "therapy",
    ],
  },
  ethnicity: {
    label: "Racial or ethnic origin",
    terms: ["ethnicity", "ethnic", "race", "racial", "skin colour", "skin color"],
  },
  religion: {
    label: "Religious or philosophical beliefs",
    terms: [
      "religion", "religious", "faith", "philosophical belief", "church", "mosque", "synagogue", "temple",
      "christian", "muslim", "jewish", "hindu", "sikh", "buddhist", "atheist",
    ],
  },
  sexuality: {
    label: "Sex life or sexual orientation",
    terms: ["sexual orientation", "sexuality", "gay", "lesbian", "bisexual", "lgbt", "lgbtq", "heterosexual", "sex life"],
  },
  politics: {
    label: "Political opinions",
    terms: [
      "political", "politics", "voting intention", "voted for", "vote for in the", "general election",
      "labour party", "conservative party", "lib dem", "liberal democrat", "reform uk", "green party", "snp",
    ],
  },
  trade_union: {
    label: "Trade union membership",
    terms: ["trade union", "union member", "union membership"],
  },
  genetic_biometric: {
    label: "Genetic or biometric data",
    terms: ["genetic", "dna", "biometric", "fingerprint", "face scan", "facial recognition"],
  },
  criminal: {
    label: "Criminal offences or convictions",
    terms: ["criminal record", "conviction", "convicted", "offence", "arrested", "prison", "police record"],
  },
  identifier: {
    label: "Direct identifier",
    terms: [
      "national insurance", "ni number", "passport", "driving licence", "driver's licence", "bank account",
      "sort code", "account number", "card number", "iban", "home address",
    ],
  },
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MATCHERS = (Object.entries(SENSITIVE_CATEGORIES) as [SensitiveKey, { terms: string[] }][]).map(
  ([key, c]) => [key, new RegExp(`\\b(?:${c.terms.map(escapeRe).join("|")})\\b`, "i")] as const,
);

/** The special categories a question's wording touches (prompt, help text,
 *  option labels, group prompt). Empty when none. */
export function sensitiveFlags(q: {
  prompt?: string | null;
  help_text?: string | null;
  options?: { label: string }[] | null;
  config?: { group_prompt?: string | null } | null;
}): SensitiveKey[] {
  const text = [q.prompt, q.help_text, q.config?.group_prompt, ...(q.options ?? []).map((o) => o.label)]
    .filter(Boolean)
    .join(" \n ");
  if (!text.trim()) return [];
  return MATCHERS.filter(([, re]) => re.test(text)).map(([key]) => key);
}

/** Stored on survey_questions.config.sensitive_ack when an admin confirms a
 *  flagged question is intended. Stripped from what respondents read (0094). */
export interface SensitiveAck {
  flags: SensitiveKey[];
  reason: string;
  at: string;
}

/** Flags the admin hasn't acknowledged yet — a reworded question that picks
 *  up a new category asks again. */
export function unacknowledgedFlags(
  flags: SensitiveKey[],
  ack: SensitiveAck | null | undefined,
): SensitiveKey[] {
  const seen = new Set(ack?.reason?.trim() ? ack.flags : []);
  return flags.filter((f) => !seen.has(f));
}

/** What survey_mask_pii() (0094) puts in place of each kind of match. */
export const MASK_LABELS = [
  "[email removed]",
  "[link removed]",
  "[card number removed]",
  "[NI number removed]",
  "[phone removed]",
  "[postcode removed]",
] as const;
