import "server-only";
import { cookies } from "next/headers";
import { UK_TIME_ZONE } from "@/lib/format";
import { VIEWER_TZ_COOKIE, validTimeZone } from "@/lib/viewer-time";

/** The viewer's zone from the cookie (see viewer-time.ts), falling back to UK time. */
export async function viewerTimeZone(): Promise<string> {
  const store = await cookies();
  return validTimeZone(store.get(VIEWER_TZ_COOKIE)?.value) ?? UK_TIME_ZONE;
}
