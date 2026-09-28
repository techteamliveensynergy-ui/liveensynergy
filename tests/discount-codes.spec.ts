import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { capture } from "./helpers";

/**
 * Discount codes (migration 0045, docs/discount-codes.md) end to end, across
 * all four seats, against the seeded "[QA] Discount codes test event"
 * (SPE-00017 — tester accounts only, no campaign, so the survey gate is open).
 *
 *   admin    sets up pattern C (unique, generated + uploaded) and pattern A
 *            (shared, uncapped), sends it for review, can't issue yet
 *   artist   reviews, adds their own code with an ID number, consents
 *   admin    finds the setup locked, issues to everyone eligible, downloads CSV
 *   audience sees the code with where/how to redeem, marks it redeemed
 *   brand    sees the setup read-only, no consent control
 *   admin    reopens — editable again
 *
 * NOT idempotent: it writes tiers, codes and consent. Reset the fixture with
 * the SQL in docs/discount-codes.md ("Resetting the QA event") before a re-run.
 */

const EVENT_ID = process.env.DISCOUNT_EVENT_ID ?? "6bdac554-a127-4fc0-a1fb-7f4136d3609e";
const SHOTS = path.join("docs", "discount-codes", "screenshots");
const ADMIN_URL = `/dashboard/admin/events/sponsored/${EVENT_ID}`;
const PARTY_URL = `/dashboard/sponsored/${EVENT_ID}`;

async function as(browser: Browser, seat: "admin" | "artist" | "brand" | "audience"): Promise<Page> {
  const ctx = await browser.newContext({ storageState: `tests/.auth/${seat}.json` });
  return ctx.newPage();
}

const shot = (page: Page, id: string, title: string, selector = "#discount-codes") =>
  capture(page, id, title, { dir: SHOTS, selector });

test.describe.configure({ mode: "serial" });

test("discount codes: setup → consent → issue → redeem", async ({ browser }) => {
  test.setTimeout(240_000);

  // ---- 1. Admin sets up two tiers ------------------------------------------
  const admin = await as(browser, "admin");
  await admin.goto(ADMIN_URL);
  const section = admin.locator("#discount-codes");
  await expect(section).toBeVisible();
  await expect(section.getByTestId("codes-consent")).toHaveText(/Awaiting artist confirmation/);

  const tiers = section.getByTestId("reward-tier");
  await expect(tiers).toHaveCount(2);

  const t1 = tiers.nth(0);
  await t1.locator('[name="tier_label"]').fill("First 2 · unique codes");
  await t1.locator('[name="tier_model"]').selectOption("unique");
  await t1.locator('[name="tier_cap"]').fill("2");
  await t1.locator('[name="tier_discount_percent"]').fill("25");
  await t1.locator('[name="tier_prefix"]').fill("NWAVE");
  await t1.locator('[name="tier_platform"]').selectOption("eventbrite");
  await t1.locator('[name="tier_url"]').fill("eventbrite.co.uk/e/qa-discount-test");

  const t2 = tiers.nth(1);
  await t2.locator('[name="tier_label"]').fill("Everyone after · shared code");
  await t2.locator('[name="tier_model"]').selectOption("shared");
  await t2.locator('[name="tier_cap"]').fill("");
  await t2.locator('[name="tier_value_gbp"]').fill("10");
  await t2.locator('[name="tier_shared_code"]').fill("NWAVE10");
  await t2.locator('[name="tier_platform"]').selectOption("shopify");

  // Validation: % and £ together is refused.
  await t2.locator('[name="tier_discount_percent"]').fill("5");
  await section.getByRole("button", { name: "Save tiers" }).click();
  await expect(section.getByText("give either a percentage or a £ amount, not both")).toBeVisible();
  await t2.locator('[name="tier_discount_percent"]').fill("");

  await section.getByRole("button", { name: "Save tiers" }).click();
  await expect(section.getByText("Tiers saved.")).toBeVisible();
  await shot(admin, "01-admin-tier-setup", "Admin: two tiers — unique (C) and shared uncapped (A)");

  // Re-saving must update in place, not duplicate the tiers.
  await section.getByRole("button", { name: "Save tiers" }).click();
  await expect(section.getByText("Tiers saved.")).toBeVisible();
  await admin.reload();
  await expect(admin.locator("#discount-codes").getByTestId("reward-tier")).toHaveCount(2);

  // Generate one platform code for the unique tier.
  const uniqueCodes = admin.locator("#discount-codes").getByTestId("tier-codes").nth(0);
  await uniqueCodes.locator('[name="count"]').fill("1");
  await uniqueCodes.getByRole("button", { name: "Generate" }).click();
  await expect(uniqueCodes.getByTestId("tier-code-counts")).toHaveText(/1 available/);
  await uniqueCodes.getByText(/Show 1 code/).click();
  await expect(uniqueCodes.locator("li").first()).toContainText(/NWAVE-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}/);

  // An invalid upload is reported, not silently dropped.
  await uniqueCodes.locator('[name="codes"]').fill("GOOD-CODE-1\nbad code with spaces");
  await uniqueCodes.getByRole("button", { name: "Add codes" }).click();
  await expect(uniqueCodes.getByText(/isn't a valid code/)).toBeVisible();

  // Issuing is held until the artist confirms.
  await expect(
    admin.getByRole("button", { name: "Issue codes to everyone eligible" }),
  ).toBeDisabled();
  await admin.getByRole("button", { name: "Send to artist for review" }).click();
  await expect(admin.getByText("Sent to the artist")).toBeVisible();
  await shot(admin, "02-admin-pool-and-review", "Admin: generated pool code, sent for artist review");

  // ---- 2. Artist reviews, adds their own code, consents ---------------------
  const artist = await as(browser, "artist");
  await artist.goto(PARTY_URL);
  const aSection = artist.locator("#discount-codes");
  await expect(aSection).toBeVisible();
  await expect(aSection).toContainText("25% off");
  await expect(aSection).toContainText("NWAVE10");
  await expect(aSection).toContainText("Eventbrite");

  const aTier = aSection.getByTestId("reward-tier").nth(0);
  await aTier.locator('[name="codes"]').fill("ARTIST-TEST-001, 10023");
  await aTier.getByRole("button", { name: "Add codes" }).click();
  await expect(aTier.getByText("Added 1 code.")).toBeVisible();

  // Consent needs the box ticked.
  await aSection.getByRole("button", { name: "Confirm discount codes" }).click();
  await expect(aSection.getByText("Tick the box")).toBeVisible();
  await shot(artist, "03-artist-review", "Artist: reviews the setup, adds own code + ID number");

  await aSection.locator('[name="consent"]').check();
  await aSection.getByRole("button", { name: "Confirm discount codes" }).click();
  await expect(artist.getByText("Confirmed — the team can now issue")).toBeVisible();
  await artist.reload();
  await expect(artist.locator("#discount-codes").getByTestId("codes-consent")).toHaveText(/Confirmed by the artist/);
  await expect(artist.locator('#discount-codes [name="codes"]')).toHaveCount(0);
  await shot(artist, "04-artist-confirmed", "Artist: confirmed — setup locked");

  // ---- 3. Admin: locked, issue to everyone, CSV ------------------------------
  await admin.goto(ADMIN_URL);
  const s2 = admin.locator("#discount-codes");
  await expect(s2.getByTestId("codes-consent")).toHaveText(/Artist confirmed/);
  await expect(s2.getByRole("button", { name: "Save tiers" })).toBeDisabled();

  await admin.getByRole("button", { name: "Issue codes to everyone eligible" }).click();
  // 3 eligible: 2 unique codes (cap 2 / 2 in the pool), 1 overflow to shared.
  await expect(admin.getByText(/Issued 3 codes/)).toBeVisible();
  const rows = admin.getByTestId("issued-code-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: "NWAVE10" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "ARTIST-TEST-001" })).toHaveCount(1);
  await expect(rows.filter({ hasText: /NWAVE-[2-9A-Z]{4}-/ })).toHaveCount(1);
  await shot(admin, "05-admin-issued", "Admin: issued to all eligible — locked setup, issued vs redeemed");

  const csv = await admin.request.get(`${PARTY_URL}/reward-codes`);
  expect(csv.status()).toBe(200);
  const body = await csv.text();
  expect(body.split("\r\n")[0]).toBe(
    "tier,pattern,value,redeem_on,code,identification_number,source,status,issued_at,redeemed_at,valid_until",
  );
  expect(body).toContain("ARTIST-TEST-001,10023,uploaded,issued");
  expect(body).toContain("NWAVE10");
  expect(body).not.toContain("@"); // no participant emails

  // ---- 4. Audience sees the code and how to redeem it ------------------------
  const audience = await as(browser, "audience");
  await audience.goto("/dashboard/rewards");
  const card = audience.getByTestId("reward-code").filter({ hasText: "[QA] Discount codes test event" });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(/NWAVE|ARTIST-TEST-001/);
  await expect(card).toContainText(/redeem on (Eventbrite|Shopify)/);
  await shot(audience, "06-audience-code", "Audience: code with where and how to redeem", '[data-testid="reward-code"]');
  await card.getByRole("button", { name: "Mark as redeemed" }).click();
  await expect(card.getByRole("button", { name: "Mark as redeemed" })).toHaveCount(0);

  await admin.reload();
  await expect(admin.locator("#discount-codes")).toContainText("1 redeemed");

  // ---- 5. Brand: read-only ---------------------------------------------------
  const brand = await as(browser, "brand");
  await brand.goto(PARTY_URL);
  const bSection = brand.locator("#discount-codes");
  await expect(bSection).toContainText("Confirmed by the artist");
  await expect(bSection.getByRole("button", { name: "Confirm discount codes" })).toHaveCount(0);
  await expect(bSection.locator('[name="codes"]')).toHaveCount(0);
  expect((await brand.request.get(`${PARTY_URL}/reward-codes`)).status()).toBe(200);
  await shot(brand, "07-brand-readonly", "Brand: read-only view of the setup");

  // ---- 6. Admin reopens -----------------------------------------------------
  await admin.getByRole("button", { name: "Reopen for editing" }).click();
  await expect(admin.getByText("Discount codes reopened for editing")).toBeVisible();
  await expect(admin.locator("#discount-codes").getByRole("button", { name: "Save tiers" })).toBeEnabled();
});
