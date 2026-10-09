/**
 * CSV helpers shared by the admin exports (participants, survey responses).
 * Dates are DD/MM/YYYY HH:mm — unambiguous for a UK team and parsed as a date
 * by Excel, unlike raw ISO timestamps (3 Aug standup).
 */

/** Wraps a value in quotes and escapes embedded quotes/commas/newlines, per RFC 4180. */
export function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",") + "\n";
}

export function csvDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
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
