import path from "node:path";
import fs from "node:fs";
import type { Page } from "@playwright/test";

/** Reads a key out of .env.local — Playwright doesn't load it automatically. */
export function envValue(key: string): string {
  const file = fs.readFileSync(".env.local", "utf8");
  const line = file
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} missing from .env.local`);
  return line.slice(key.length + 1).trim();
}

/**
 * Creates a confirmed auth user through the admin API.
 *
 * The dev project has email confirmation switched on and uses Supabase's
 * built-in mailer, which is rate-limited to a handful of messages an hour — so
 * driving the sign-up form end to end isn't reliably possible. This is the same
 * outcome as the SQL seeding in docs/qa-creds.md, minus the password hashing.
 */
export async function createConfirmedUser(input: {
  email: string;
  password: string;
  fullName: string;
  role: string;
}): Promise<string> {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envValue("SUPABASE_SERVICE_ROLE_KEY");

  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName, role: input.role },
    }),
  });

  const body = (await res.json()) as { id?: string; msg?: string };
  if (!res.ok || !body.id) {
    throw new Error(`admin createUser failed: ${res.status} ${body.msg ?? ""}`);
  }
  return body.id;
}

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
