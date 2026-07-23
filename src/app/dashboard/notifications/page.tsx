import Link from "next/link";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/dashboard/ui";
import { timeAgo } from "@/lib/format";
import { MarkAllReadButton } from "./MarkAllReadButton";

export const metadata = { title: "Notifications" };

interface Row {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export default async function NotificationsPage() {
  const { profile } = await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_profile_id", profile!.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as Row[];
  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={
          unread > 0
            ? `${unread} unread`
            : "You're all caught up."
        }
        action={unread > 0 ? <MarkAllReadButton /> : undefined}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="No notifications yet"
          body="Updates about your events, sponsorships and rewards will show up here."
        />
      ) : (
        <div className="card divide-y divide-black/10">
          {rows.map((n) => {
            const inner = (
              <div className="flex gap-3 px-5 py-4">
                <div
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.read_at ? "bg-transparent" : "bg-[var(--color-brand)]"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`${n.read_at ? "font-medium" : "font-semibold"} text-[var(--color-ink)]`}
                  >
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]/70">
                    {timeAgo(n.created_at)}
                  </p>
                </div>
              </div>
            );

            return n.link ? (
              <Link
                key={n.id}
                href={n.link}
                className="block transition hover:bg-[var(--color-mist)]"
              >
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
