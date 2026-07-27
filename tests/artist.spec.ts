import { test, expect } from "@playwright/test";
import { capture, fixture } from "./helpers";

/**
 * Evidence capture for the items in "Artist Portal.pdf" (25 Jul review).
 * Mirrors brand.spec.ts — one test per numbered item in the review notes.
 */

test("A-PROF-01 artist profile image + banner upload", async ({ page }) => {
  await page.goto("/dashboard/profile");
  await page.setInputFiles('input[name="profile_image"]', fixture("logo.png"));
  await page.setInputFiles('input[name="banner"]', fixture("banner.png"));
  await page.getByRole("button", { name: /Save changes/i }).click();
  await expect(page.getByText("Your changes have been saved.")).toBeVisible({
    timeout: 60_000,
  });
  await capture(page, "A-PROF-01", "Artist profile — images saved");
});

test("A-OV-01 overview: sponsor offers pending", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Sponsor offers pending")).toBeVisible();
  await expect(page.getByText("Published events")).toBeVisible();
  await capture(page, "A-OV-01", "Artist overview — offers pending metric", {
    fullPage: true,
  });
});

test("A-EV-01 my events split into published / sponsored", async ({ page }) => {
  await page.goto("/dashboard/events");
  await expect(page.getByText("My published events")).toBeVisible();
  await expect(page.getByText("My sponsored events")).toBeVisible();
  await capture(page, "A-EV-01a", "My events — published tab", { fullPage: true });

  await page.getByText("My sponsored events").click();
  await page.waitForURL(/tab=sponsored/);
  await capture(page, "A-EV-01b", "My events — sponsored tab", { fullPage: true });
});

test("A-EV-02 new event artwork upload", async ({ page }) => {
  await page.goto("/dashboard/events/new");
  await page.setInputFiles('input[name="image"]', fixture("event.png"));
  await capture(page, "A-EV-02", "New event — artwork upload", { fullPage: true });
});

test("A-SPON-01 artist cannot create a sponsored event", async ({ page }) => {
  await page.goto("/dashboard/sponsored/new");
  // requireRole(["brand"]) bounces every other role back to the dashboard.
  await page.waitForURL((url) => !url.pathname.endsWith("/sponsored/new"), {
    timeout: 30_000,
  });
  const landedOn = new URL(page.url()).pathname;
  expect(landedOn).not.toContain("/sponsored/new");
  test.info().annotations.push({ type: "redirected-to", description: landedOn });
  await capture(page, "A-SPON-01", "Artist redirected away from create-sponsorship", {
    fullPage: true,
  });
});

test("A-DC-01 discover campaigns with filters", async ({ page }) => {
  await page.goto("/dashboard/discover-campaigns");
  for (const id of ["#filter-name", "#filter-location", "#filter-category", "#filter-budget"]) {
    await expect(page.locator(id)).toBeVisible();
  }
  await capture(page, "A-DC-01", "Discover campaigns — browse + filters", {
    fullPage: true,
  });
});

test("A-MSG-01 chat split + attachments", async ({ page }) => {
  await page.goto("/dashboard/messages");
  await expect(page.getByText("With artists & sponsors")).toBeVisible();
  await expect(page.getByText("With Live·En·Synergy team")).toBeVisible();
  await capture(page, "A-MSG-01", "Artist messages — split threads", {
    fullPage: true,
  });
});

test("A-REPO-01 repository", async ({ page }) => {
  await page.goto("/dashboard/resources");
  await expect(page.getByRole("heading", { name: "Repository" })).toBeVisible();
  await capture(page, "A-REPO-01", "Artist repository", { fullPage: true });
});
