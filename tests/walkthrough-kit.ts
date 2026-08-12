import type { Page } from "@playwright/test";

/**
 * Shared furniture for the walkthrough recordings — captions, title cards and
 * sign-in — so a new walkthrough doesn't re-implement the look of the last one.
 *
 * Extracted from `standup-walkthrough.spec.ts` (the 3 Aug recording) when the
 * 10 Aug one needed the same treatment. Behaviour is unchanged.
 */

/** Lets a viewer read the screen before the next action. */
export const beat = (page: Page, ms = 1400) => page.waitForTimeout(ms);

/**
 * On-screen caption, so the recording explains itself without a voiceover.
 * Re-applied after every navigation because it lives in the page.
 */
export async function caption(page: Page, title: string, detail = "") {
  await page.evaluate(
    ([t, d]) => {
      document.getElementById("wt-caption")?.remove();
      const el = document.createElement("div");
      el.id = "wt-caption";
      el.style.cssText = [
        "position:fixed",
        "left:0",
        "right:0",
        "bottom:0",
        "z-index:2147483647",
        "pointer-events:none", // never intercepts a click
        "background:linear-gradient(transparent,rgba(20,16,12,.92) 38%)",
        "color:#fff",
        "padding:44px 32px 20px",
        "font-family:system-ui,-apple-system,Segoe UI,sans-serif",
      ].join(";");
      el.innerHTML =
        `<div style="font-size:19px;font-weight:700;letter-spacing:-.01em">${t}</div>` +
        (d
          ? `<div style="font-size:14px;opacity:.82;margin-top:3px">${d}</div>`
          : "");
      document.body.appendChild(el);
    },
    [title, detail] as const,
  );
}

/** Full-screen title card between sections. */
export async function titleCard(page: Page, heading: string, sub: string) {
  await page.evaluate(
    ([h, s]) => {
      document.getElementById("wt-card")?.remove();
      const el = document.createElement("div");
      el.id = "wt-card";
      el.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:2147483647",
        "pointer-events:none",
        "background:#191410",
        "color:#fff",
        "display:flex",
        "flex-direction:column",
        "align-items:center",
        "justify-content:center",
        "font-family:system-ui,-apple-system,Segoe UI,sans-serif",
        "text-align:center",
      ].join(";");
      el.innerHTML =
        `<div style="font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:#e8863f">${s}</div>` +
        `<div style="font-size:40px;font-weight:700;margin-top:14px;max-width:820px;line-height:1.15">${h}</div>`;
      document.body.appendChild(el);
    },
    [heading, sub] as const,
  );
  await beat(page, 2200);
  await page.evaluate(() => document.getElementById("wt-card")?.remove());
}

export async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/auth/sign-in");
  await page.fill("#email", who.email);
  await page.fill("#password", who.password);
  await beat(page, 600);
  // `noWaitAfter` so the click doesn't itself block on the redirect — the
  // sign-in server action plus the dashboard's own queries can outlast the
  // default action timeout. The URL wait below is the real gate.
  await page.click('button[type="submit"]', { noWaitAfter: true });
  await page.waitForURL(/\/dashboard/, { timeout: 120_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

export async function signOut(page: Page) {
  await page.evaluate(() => document.getElementById("wt-caption")?.remove());
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/(auth\/sign-in)?$/, { timeout: 60_000 });
}
