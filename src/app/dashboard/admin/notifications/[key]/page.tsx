import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { NotificationEditor } from "./NotificationEditor";

export const metadata = { title: "Edit notification · Admin" };

export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  await requireRole(["admin"]);
  const { key } = await params;
  const eventKey = decodeURIComponent(key);
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("notification_events")
    .select("*")
    .eq("key", eventKey)
    .maybeSingle<{
      key: string;
      name: string;
      description: string | null;
      category: string;
      audience: string | null;
      variables: string[];
    }>();
  if (!event) notFound();

  const [{ data: settings }, { data: templateRows }] = await Promise.all([
    supabase
      .from("notification_settings")
      .select("*")
      .eq("event_key", eventKey)
      .maybeSingle(),
    supabase
      .from("notification_templates")
      .select("channel, subject, body")
      .eq("event_key", eventKey),
  ]);

  const templates = (templateRows ?? []) as {
    channel: string;
    subject: string | null;
    body: string | null;
  }[];
  const inApp = templates.find((t) => t.channel === "in_app") ?? {
    subject: "",
    body: "",
  };
  const email = templates.find((t) => t.channel === "email") ?? {
    subject: "",
    body: "",
  };

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/admin/notifications"
        className="inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to notifications
      </Link>

      <div>
        <p className="font-serif text-[var(--color-ink-soft)]">
          {event.audience ?? event.category}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-3xl">
          {event.name}
        </h1>
        <p className="mt-1 text-[var(--color-ink-soft)]">{event.description}</p>
        <p className="mt-1 font-mono text-xs text-[var(--color-ink-soft)]/70">
          {event.key}
        </p>
      </div>

      <NotificationEditor
        eventKey={event.key}
        variables={event.variables ?? []}
        settings={{
          in_app_enabled: settings?.in_app_enabled ?? true,
          email_enabled: settings?.email_enabled ?? true,
          email_cc: settings?.email_cc ?? null,
          email_bcc: settings?.email_bcc ?? null,
        }}
        inApp={inApp}
        email={email}
      />
    </div>
  );
}
