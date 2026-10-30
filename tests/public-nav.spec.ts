import { test, expect, type Page } from "@playwright/test";

/**
 * Every public-site link actually navigates (30 Oct: "navigations are
 * failing"). Read-only and signed out, so it's safe against any origin:
 *
 *   npx playwright test --project=public-nav                       # local build
 *   PUBLIC_NAV_URL=https://liveensynergy-rho.vercel.app \
 *     npx playwright test --project=public-nav                     # deployed
 *
 * Clicks rather than page.goto: a link can load fine when opened directly
 * and still look dead when clicked, which is the case this guards (client
 * navigation waits on the next page's data; (marketing)/loading.tsx makes it
 * respond at once).
 */

const HEADER = [
  ["For brands", /\/brands$/],
  ["Events", /\/events$/],
  ["How it works", /\/#how-it-works$/],
  ["About", /\/about$/],
  ["Contact", /\/contact$/],
] as const;

const FOOTER = [
  ["For brands", /\/brands$/],
  ["Browse events", /\/events$/],
  ["How it works", /\/#how-it-works$/],
  ["Get started", /\/auth\/sign-up/],
  ["About us", /\/about$/],
  ["Contact", /\/contact$/],
  ["FAQs", /\/faqs$/],
  ["Terms & Conditions", /\/terms$/],
  ["Privacy Policy", /\/privacy$/],
  ["Cookie Policy", /\/cookies$/],
] as const;

const HOME_BUTTONS = [
  ["I'm a brand →", /\/brands$/],
  ["I'm an artist / organiser", /role=artist/],
  ["Find an event", /\/events$/],
  ["Explore brand campaigns", /\/brands$/],
  ["List your events", /role=artist/],
  ["Find a live campaign", /\/events$/],
  ["See packages", /\/brands#packages$/],
  ["All FAQs", /\/faqs$/],
  ["Build a campaign", /role=brand/],
  ["Become an event partner", /role=artist/],
  ["Explore campaigns", /\/events$/],
] as const;

async function clickAndExpect(page: Page, scope: string, name: string, url: RegExp, exact = true) {
  // Card links take their whole card's text as their name, and CTA text
  // carries a "→", so body buttons match on a substring.
  await page.locator(scope).getByRole("link", { name, exact }).first().click();
  // Navigation must start promptly — a click that does nothing for seconds
  // is the bug this spec exists for.
  await expect(page).toHaveURL(url, { timeout: 5_000 });
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 });
}

test.describe("public site navigation", () => {
  for (const start of ["/", "/about"]) {
    for (const [name, url] of HEADER) {
      test(`header "${name}" from ${start}`, async ({ page }) => {
        await page.goto(start);
        await clickAndExpect(page, "header", name, url);
      });
    }
  }

  for (const [name, url] of FOOTER) {
    test(`footer "${name}"`, async ({ page }) => {
      await page.goto("/");
      await clickAndExpect(page, "footer", name, url);
    });
  }

  for (const [name, url] of HOME_BUTTONS) {
    test(`home "${name}"`, async ({ page }) => {
      await page.goto("/");
      await clickAndExpect(page, "main", name, url, false);
    });
  }

  test("brands page anchors and CTA", async ({ page }) => {
    await page.goto("/brands");
    await clickAndExpect(page, "main", "Explore packages", /\/brands#packages$/, false);
    await expect(page.locator("#packages")).toBeAttached();
    await clickAndExpect(page, "main", "How it works", /\/brands#journey$/, false);
    await expect(page.locator("#journey")).toBeAttached();
  });

  test("mobile menu links", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [name, url] of HEADER) {
      await page.goto("/brands");
      await page.getByRole("button", { name: "Toggle navigation" }).click();
      await clickAndExpect(page, "header", name, url);
    }
  });

  test("every public link resolves (no 404 / 500)", async ({ page, request }) => {
    const hrefs = new Set<string>();
    for (const p of ["/", "/brands", "/about", "/events", "/faqs", "/contact", "/terms", "/privacy", "/cookies"]) {
      await page.goto(p);
      for (const h of await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""))) {
        if (h.startsWith("/") ) hrefs.add(h.split("#")[0] || "/");
      }
    }
    for (const h of hrefs) {
      const res = await request.get(h, { maxRedirects: 5 });
      expect(res.status(), h).toBeLessThan(400);
    }
  });
});
