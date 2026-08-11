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

/**
 * A scratch file passed from one project to the next.
 *
 * Used so the admin spec can hand the brand spec a fact the brand must not be
 * able to discover for itself — the id of another brand's sponsorship, to
 * prove that opening it 404s. (`SUPABASE_SERVICE_ROLE_KEY` would be the other
 * way to get it, but it isn't in `.env.local` and nothing in `src/` needs it.)
 */
const HANDOFF = path.join("tests", ".auth", "handoff.json");

export function writeHandoff(patch: Record<string, string>) {
  fs.mkdirSync(path.dirname(HANDOFF), { recursive: true });
  const existing = fs.existsSync(HANDOFF)
    ? (JSON.parse(fs.readFileSync(HANDOFF, "utf8")) as Record<string, string>)
    : {};
  fs.writeFileSync(HANDOFF, JSON.stringify({ ...existing, ...patch }, null, 2));
}

export function readHandoff(): Record<string, string> {
  return fs.existsSync(HANDOFF)
    ? (JSON.parse(fs.readFileSync(HANDOFF, "utf8")) as Record<string, string>)
    : {};
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
  // Added for the 10 Aug batch: the random draw, the admin chat and the
  // audience withdrawal rule can only be checked from these two seats.
  admin: {
    email: "admin.tester@example.com",
    password: "TestPass123!",
    workspace: "Sakshi Admin",
  },
  audience: {
    email: "audience.tester@example.com",
    password: "TestPass123!",
    workspace: "Priya Shah",
  },
} as const;

export const SHOTS_DIR = path.join("docs", "client-review", "screenshots");
/** Evidence for the 10 Aug standup batch, kept apart from the 24–25 Jul review. */
export const SHOTS_0810 = path.join("docs", "standup-2026-08-10", "screenshots");
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

function record(dir: string, entry: Capture) {
  const manifest = path.join(dir, "manifest.json");
  fs.mkdirSync(dir, { recursive: true });
  const existing: Capture[] = fs.existsSync(manifest)
    ? JSON.parse(fs.readFileSync(manifest, "utf8"))
    : [];
  const next = existing.filter((e) => e.id !== entry.id).concat(entry);
  next.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(manifest, JSON.stringify(next, null, 2));
}

/**
 * Screenshots the whole page (or a locator) and records it in the manifest.
 *
 * `dir` defaults to the Jul review's folder so the existing specs are
 * unchanged; the 10 Aug suite passes `SHOTS_0810`.
 */
export async function capture(
  page: Page,
  id: string,
  title: string,
  opts: { selector?: string; fullPage?: boolean; dir?: string } = {},
) {
  const dir = opts.dir ?? SHOTS_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const file = `${id}.png`;
  const target = path.join(dir, file);

  // Let fonts settle so text doesn't render mid-swap in the capture.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);

  if (opts.selector) {
    await page.locator(opts.selector).first().screenshot({ path: target });
  } else {
    await page.screenshot({ path: target, fullPage: opts.fullPage ?? false });
  }
  record(dir, { id, title, file });
}

/** `capture` bound to the 10 Aug evidence folder. */
export async function shot(
  page: Page,
  id: string,
  title: string,
  opts: { selector?: string; fullPage?: boolean } = {},
) {
  await capture(page, id, title, { ...opts, dir: SHOTS_0810 });
}
