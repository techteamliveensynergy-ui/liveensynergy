import path from "node:path";
import fs from "node:fs";
import type { Page } from "@playwright/test";

/** Accounts from docs/qa-creds.md — dev Supabase project only. */
export const ACCOUNTS = {
  brand: {
    email: "brand.tester@example.com",
    password: "TestPass123!",
    workspace: "Northwave Coffee",
  },
  artist: {
    email: "artist.tester@example.com",
    password: "TestPass123!",
    workspace: "The Midnight Collective",
  },
} as const;

export const SHOTS_DIR = path.join("docs", "client-review", "screenshots");
export const FIXTURES = path.join("tests", "fixtures");

export const fixture = (name: string) => path.join(FIXTURES, name);

/**
 * Every capture is logged to a manifest alongside the PNG so the report can be
 * regenerated from a run without re-deriving which shot belongs to which item
 * in the client's review notes.
 */
export interface Capture {
  id: string;
  title: string;
  file: string;
}

const MANIFEST = path.join(SHOTS_DIR, "manifest.json");

function record(entry: Capture) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const existing: Capture[] = fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
    : [];
  const next = existing.filter((e) => e.id !== entry.id).concat(entry);
  next.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(MANIFEST, JSON.stringify(next, null, 2));
}

/** Screenshots the whole page (or a locator) and records it in the manifest. */
export async function capture(
  page: Page,
  id: string,
  title: string,
  opts: { selector?: string; fullPage?: boolean } = {},
) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const file = `${id}.png`;
  const target = path.join(SHOTS_DIR, file);

  // Let fonts settle so text doesn't render mid-swap in the capture.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);

  if (opts.selector) {
    await page.locator(opts.selector).first().screenshot({ path: target });
  } else {
    await page.screenshot({ path: target, fullPage: opts.fullPage ?? false });
  }
  record({ id, title, file });
}
