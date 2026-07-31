/** Absolute self-check-in URL for a sponsored event's attendance QR code. */
export function attendUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base}/attend/${token}`;
}
