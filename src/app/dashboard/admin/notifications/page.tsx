import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { toggleChannel } from "./actions";

export const metadata = { title: "Notifications · Admin" };

interface EventRow {
  key: string;
  name: string;
  description: string | null;
  category: string;
  audience: string | null;
  sort_order: number;
}
interface SettingRow {
  event_key: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  email_cc: string[] | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  account: "Account & access",
  brand: "Brand / sponsor",
  artist: "Artist / organiser",
  audience: "Audience",
  messaging: "Messaging",
  admin: "Admin team",
};

const CATEGORY_ORDER = ["account", "brand", "artist", "audience", "messaging", "admin"];

function ChannelToggle({
  eventKey,
  channel,
  enabled,
}: {
  eventKey: string;
  channel: "in_app" | "email";
  enabled: boolean;
}) {
  return (
    <form action={toggleChannel}>
      <input type="hidden" name="event_key" value={eventKey} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="next" value={(!enabled).toString()} />
      <button
        type="submit"
        aria-pressed={enabled}
        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
          enabled
            ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]"
            : "bg-[var(--color-mist)] text-[var(--color-ink-soft)] hover:bg-black/[0.06]"
        }`}
      >
        {channel === "email" ? "Email" : "In-app"} {enabled ? "on" : "off"}
      </button>
    </form>
  );
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  await requireRole(["admin"]);
  const { category } = await searchParams;
  const supabase = await createClient();

  const [{ data: eventRows }, { data: settingRows }] = await Promise.all([
    supabase.from("notification_events").select("*").order("sort_order"),
    supabase.from("notification_settings").select("*"),
  ]);

  const events = (eventRows ?? []) as EventRow[];
  const settings = new Map(
    ((settingRows ?? []) as SettingRow[]).map((s) => [s.event_key, s]),
  );

  const shown = category
    ? events.filter((e) => e.category === category)
    : events;

  const categories = CATEGORY_ORDER.filter((c) =>
    events.some((e) => e.category === c),
  );

  const enabledCount = (key: "in_app_enabled" | "email_enabled") =>
    events.filter((e) => settings.get(e.key)?.[key]).length;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Every event the platform can notify on. Toggle each channel, then edit the wording and preview it."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/10 bg-[var(--color-mist)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-ink-soft)]">Events</p>
          <p className="mt-1 font-display text-2xl font-semibold text-[var(--color-ink)]">
            {events.length}
          </p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-[var(--color-lavender)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-ink-soft)]">In-app enabled</p>
          <p className="mt-1 font-display text-2xl font-semibold text-[var(--color-ink)]">
            {enabledCount("in_app_enabled")}
          </p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-[var(--color-gold)] p-4 shadow-sm">
          <p className="text-xs text-[var(--color-ink-soft)]">Email enabled</p>
          <p className="mt-1 font-display text-2xl font-semibold text-[var(--color-ink)]">
            {enabledCount("email_enabled")}
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard/admin/notifications"
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            !category
              ? "bg-[var(--color-brand)] text-white"
              : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
          }`}
        >
          All
        </Link>
        {categories.map((c) => (
          <Link
            key={c}
            href={`/dashboard/admin/notifications?category=${c}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              category === c
                ? "bg-[var(--color-brand)] text-white"
                : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
            }`}
          >
            {CATEGORY_LABELS[c] ?? c}
          </Link>
        ))}
        <Link
          href="/dashboard/admin/notifications/outbox"
          className="ml-auto text-sm font-semibold text-[var(--color-brand-dark)]"
        >
          View email outbox →
        </Link>
      </div>

      <div className="card divide-y divide-black/10">
        {shown.map((e) => {
          const s = settings.get(e.key);
          return (
            <div
              key={e.key}
              className="flex flex-wrap items-center gap-4 px-5 py-4"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/admin/notifications/${e.key}`}
                  className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-dark)]"
                >
                  {e.name}
                </Link>
                <p className="truncate text-sm text-[var(--color-ink-soft)]">
                  {e.description}
                </p>
                <p className="mt-0.5 font-mono text-xs text-[var(--color-ink-soft)]/70">
                  {e.key}
                  {e.audience ? ` · ${e.audience}` : ""}
                </p>
              </div>

              {s?.email_cc?.length ? (
                <span className="rounded-full bg-[var(--color-mint)] px-2.5 py-1 text-xs font-medium text-[var(--color-ink-soft)]">
                  CC {s.email_cc.length}
                </span>
              ) : null}

              <ChannelToggle
                eventKey={e.key}
                channel="in_app"
                enabled={s?.in_app_enabled ?? false}
              />
              <ChannelToggle
                eventKey={e.key}
                channel="email"
                enabled={s?.email_enabled ?? false}
              />

              <Link
                href={`/dashboard/admin/notifications/${e.key}`}
                className="text-sm font-semibold text-[var(--color-brand-dark)]"
              >
                Edit →
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
