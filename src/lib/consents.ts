import type { ConsentRecord, ConsentSource, ConsentType } from "@/lib/types";

/**
 * Display copy for the consent log (0080). The records themselves are written
 * by database triggers where each consent is captured, never by app code.
 */

export const CONSENT_LABELS: Record<ConsentType, string> = {
  platform_terms: "Terms & Conditions",
  privacy_policy: "Privacy Policy",
  email_verified: "Email address verified",
  event_terms: "Event registration terms",
  sponsor_marketing: "Sponsor newsletter & promotions",
  survey_terms: "Survey Terms & Conditions",
  residency_confirmed: "18 or over and a UK resident",
  order_form_details: "Order form: details approved",
  order_form_terms: "Order form: terms accepted",
};

export const CONSENT_SOURCE_LABELS: Record<ConsentSource, string> = {
  sign_up: "Sign-up",
  survey_sign_up: "Sign-up from a survey",
  verify_link: "Verification email link",
  event_registration: "Event registration",
  my_events: "My events",
  public_survey: "Public survey link",
  dashboard_survey: "Survey (signed in)",
  order_form: "Order form approval",
};

/** Account-wide consents — one current state each, latest record wins. */
export const ACCOUNT_CONSENTS: ConsentType[] = ["platform_terms", "privacy_policy", "email_verified"];

/** "EVT…" / survey title / order form reference — what a record was about. */
export function consentSubject(r: ConsentRecord): string | null {
  const c = r.context ?? {};
  const event = [c.event_reference, c.event_name].filter(Boolean).join(" · ");
  if (event) return event;
  const survey = [c.survey_title, c.response_reference].filter(Boolean).join(" · ");
  if (survey) return survey;
  const form = [c.order_form_reference, c.campaign_name].filter(Boolean).join(" · ");
  return form || null;
}

/** Latest record per (type, subject) — the consent as it stands now. */
export function currentConsents(records: ConsentRecord[]): ConsentRecord[] {
  const latest = new Map<string, ConsentRecord>();
  for (const r of records) {
    const key = `${r.consent_type}|${consentSubject(r) ?? ""}`;
    const seen = latest.get(key);
    if (!seen || seen.recorded_at < r.recorded_at) latest.set(key, r);
  }
  return [...latest.values()];
}
