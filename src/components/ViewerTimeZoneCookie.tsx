"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { VIEWER_TZ_COOKIE } from "@/lib/viewer-time";

/**
 * Tells the server which time zone this browser is in (see viewer-time.ts).
 * Writes the cookie only when it is missing or has changed (travel, a new
 * device), and then refreshes once so the screen already open picks it up.
 */
export function ViewerTimeZoneCookie() {
  const router = useRouter();
  useEffect(() => {
    let zone: string | undefined;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone) return;
    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${VIEWER_TZ_COOKIE}=`))
      ?.slice(VIEWER_TZ_COOKIE.length + 1);
    if (current && decodeURIComponent(current) === zone) return;
    const secure = window.location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${VIEWER_TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax${secure}`;
    router.refresh();
  }, [router]);
  return null;
}
