"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markAllRead } from "./actions";

/**
 * The unread badge lives in the dashboard *layout*, which Next keeps in the
 * client router cache across a soft navigation — so `revalidatePath` alone
 * leaves a stale count sitting in the sidebar. `router.refresh()` re-fetches
 * the current route including its layouts, which is what actually clears it.
 */
export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllRead();
          router.refresh();
        })
      }
    >
      {pending ? "Marking…" : "Mark all read"}
    </button>
  );
}
