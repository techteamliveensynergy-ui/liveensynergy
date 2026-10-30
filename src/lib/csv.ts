/**
 * CSV helpers shared by the admin exports (participants, survey responses).
 * Dates are DD/MM/YYYY HH:mm — unambiguous for a UK team and parsed as a date
 * by Excel, unlike raw ISO timestamps (3 Aug standup).
 */

import { ukCsvDateTime } from "./format";

/** Wraps a value in quotes and escapes embedded quotes/commas/newlines, per RFC 4180. */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  // A text cell starting with = + @ (or a tab/CR) is run as a formula when
  // the file is opened in Excel/Sheets — names and free text here are typed
  // by users. A leading apostrophe makes it plain text. Numbers are untouched.
  // A plain phone number ("+44 7700 900123") can't run, so it's left alone.
  if (typeof value === "string" && /^[=+@\t\r]/.test(s) && !/^\+[\d\s()-]+$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",") + "\n";
}

export function csvDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // UK time — the server runs in UTC.
  return ukCsvDateTime(iso);
}

/** Date-only columns (an event date carries no time of day). */
export function csvDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Byte-order mark: makes Excel open a UTF-8 CSV as UTF-8 (£, accents, emoji). */
export const CSV_BOM = "﻿";
