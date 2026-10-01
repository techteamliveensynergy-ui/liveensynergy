import { INVOICE, computePlatformFee, type InvoiceVatMode } from "./constants";
import type { BillingSnapshot, InvoiceLine } from "./types";

/**
 * Invoice maths and brand billing-detail helpers. Pure — no I/O — so the
 * numbers on a legal document can be unit-checked in isolation.
 *
 * All arithmetic is in whole pence (integers) and converted to pounds only at
 * the edge, so a VAT figure can never drift by a penny the way float maths
 * can (the same discipline as `roundMoney()` in constants.ts).
 */

const toPence = (gbp: number) => Math.round(gbp * 100);
const toGbp = (pence: number) => pence / 100;

/** VAT on a pence amount at a rate like 0.2, rounded half-up to the penny. */
function vatPence(netPence: number, rate: number): number {
  const ratePct = Math.round(rate * 100);
  return Math.floor((netPence * ratePct + 50) / 100);
}

/** "£3,000.00" — invoices always show pence. */
export function formatGbp(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface InvoiceBuild {
  lines: InvoiceLine[];
  /** Sum of line amounts, ex-VAT. */
  subtotalGbp: number;
  vatGbp: number;
  /** What the brand pays: subtotal + VAT. */
  totalGbp: number;
}

export interface BuildInvoiceInput {
  /** The campaign's budget_gbp — the package price. */
  budgetGbp: number;
  packageName: string | null;
  campaignReference: string;
  /** The package's snapshotted platform margin, VAT-inclusive. */
  packageMarginGbp: number | null;
  vatMode?: InvoiceVatMode;
}

/**
 * Builds the line items and totals for a campaign's package invoice.
 * Throws on a non-positive budget or a margin larger than the budget — the
 * caller turns that into a visible error rather than issuing a nonsense bill.
 */
export function buildInvoiceLines(input: BuildInvoiceInput): InvoiceBuild {
  const mode = input.vatMode ?? INVOICE.vatMode;
  const rate = INVOICE.vatRate;
  const budget = toPence(input.budgetGbp);
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error("Invoice budget must be greater than zero.");
  }

  const label = input.packageName
    ? `Sponsorship package: ${input.packageName}`
    : "Sponsorship campaign";
  const suffix = ` (${input.campaignReference})`;

  if (mode === "on_top_of_package") {
    const vat = vatPence(budget, rate);
    return {
      lines: [
        {
          kind: "package",
          description: label + suffix,
          net_gbp: toGbp(budget),
          vat_rate: rate,
          vat_gbp: toGbp(vat),
          total_gbp: toGbp(budget + vat),
        },
      ],
      subtotalGbp: toGbp(budget),
      vatGbp: toGbp(vat),
      totalGbp: toGbp(budget + vat),
    };
  }

  // inside_platform_fee: the budget is the total. The margin is VAT-inclusive;
  // back the VAT out of it, and the remainder is a no-VAT pass-through.
  const marginGbp =
    input.packageMarginGbp ?? computePlatformFee(input.budgetGbp).feeIncVat;
  const feeInc = toPence(marginGbp);
  if (feeInc <= 0 || feeInc > budget) {
    throw new Error("Platform margin must be positive and no more than the budget.");
  }
  const ratePct = Math.round(rate * 100);
  const feeEx = Math.round((feeInc * 100) / (100 + ratePct));
  const feeVat = feeInc - feeEx;
  const pool = budget - feeInc;

  const lines: InvoiceLine[] = [
    {
      kind: "platform_fee",
      description: `Platform service fee${suffix}`,
      net_gbp: toGbp(feeEx),
      vat_rate: rate,
      vat_gbp: toGbp(feeVat),
      total_gbp: toGbp(feeInc),
    },
  ];
  if (pool > 0) {
    lines.push({
      kind: "sponsorship_pool",
      description: `${label} — sponsorship pool${suffix}`,
      net_gbp: toGbp(pool),
      vat_rate: 0,
      vat_gbp: 0,
      total_gbp: toGbp(pool),
    });
  }
  return {
    lines,
    subtotalGbp: toGbp(feeEx + pool),
    vatGbp: toGbp(feeVat),
    totalGbp: toGbp(budget),
  };
}

// --- Brand billing details --------------------------------------------------

export interface BillingFields {
  billing_legal_name: string | null;
  billing_email: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_postcode: string | null;
  billing_country: string | null;
  vat_number: string | null;
}

const REQUIRED_BILLING: [keyof BillingFields, string][] = [
  ["billing_legal_name", "Legal company name"],
  ["billing_email", "Billing email"],
  ["billing_address_line1", "Address line 1"],
  ["billing_city", "City"],
  ["billing_postcode", "Postcode"],
  ["billing_country", "Country"],
];

/** Human labels of the required billing fields that are still empty. */
export function missingBillingFields(
  b: Partial<BillingFields> | null | undefined,
): string[] {
  return REQUIRED_BILLING.filter(([key]) => !String(b?.[key] ?? "").trim()).map(
    ([, label]) => label,
  );
}

export function isBillingComplete(
  b: Partial<BillingFields> | null | undefined,
): boolean {
  return missingBillingFields(b).length === 0;
}

export function snapshotBilling(b: Partial<BillingFields>): BillingSnapshot {
  const v = (x: string | null | undefined) => (x?.trim() ? x.trim() : null);
  return {
    legal_name: v(b.billing_legal_name),
    email: v(b.billing_email),
    address_line1: v(b.billing_address_line1),
    address_line2: v(b.billing_address_line2),
    city: v(b.billing_city),
    postcode: v(b.billing_postcode),
    country: v(b.billing_country),
    vat_number: v(b.vat_number),
  };
}

export const UK_COUNTRY = "United Kingdom";
export const isUkCountry = (country: string | null | undefined) =>
  country === UK_COUNTRY;

/**
 * Normalises and sanity-checks a VAT number. A wrong number printed on a legal
 * invoice is worse than a blocked form, so a clearly malformed one is refused.
 * UK numbers get the "GB" prefix added if the user left it off.
 */
export function validateVatNumber(
  raw: string | null | undefined,
  country: string | null | undefined,
): { value: string | null; error?: string } {
  const cleaned = String(raw ?? "")
    .toUpperCase()
    .replace(/[\s.\-]/g, "");
  if (!cleaned) return { value: null };

  if (isUkCountry(country) || cleaned.startsWith("GB")) {
    const withPrefix = cleaned.startsWith("GB") ? cleaned : `GB${cleaned}`;
    if (!/^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/.test(withPrefix)) {
      return {
        value: null,
        error:
          "That doesn't look like a UK VAT number — it should be GB followed by 9 digits (for example GB123456789).",
      };
    }
    return { value: withPrefix };
  }

  if (!/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(cleaned)) {
    return {
      value: null,
      error:
        "VAT numbers outside the UK start with a two-letter country code (for example IE1234567X).",
    };
  }
  return { value: cleaned };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isValidEmail = (s: string) => EMAIL_RE.test(s);
