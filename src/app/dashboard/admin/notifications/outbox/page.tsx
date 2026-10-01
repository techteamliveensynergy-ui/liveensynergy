import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import { retryOutboxEmail, unsuppressEmail } from "../actions";

export const metadata = { title: "Email outbox · Admin" };

interface OutboxRow {
  id: string;
  to_email: string;
  cc: string[] | null;
  subject: string | null;
  body: string | null;
  event_key: string | null;
  status: string;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  attempts: number;
  next_attempt_at: string | null;
  delivery_status: string | null;
  provider_message_id: string | null;
}

interface SuppressionRow {
  email: string;
  reason: string;
  created_at: string;
}

const STATUS_TINTS: Record<string, string> = {
  queued: "bg-[var(--color-gold)] text-[var(--color-ink)]",
  sending: "bg-[var(--color-lavender)] text-[var(--color-ink)]",
  sent: "bg-[var(--color-sage)] text-[var(--color-olive-deep)]",
  failed: "bg-[var(--color-pink)] text-[var(--color-accent)]",
  skipped: "bg-[var(--color-mint)] text-[var(--color-ink-soft)]",
};

export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole(["admin"]);
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("email_outbox")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);

  const { data } = await query;
  const rows = (data ?? []) as OutboxRow[];

  const { data: suppressionData } = await supabase
    .from("email_suppressions")
    .select("email, reason, created_at")
    .order("created_at", { ascending: false });
  const suppressions = (suppressionData ?? []) as SuppressionRow[];

  const { data: allRows } = await supabase.from("email_outbox").select("status");
  const counts = ((allRows ?? []) as { status: string }[]).reduce<
    Record<string, number>
  >((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <Link
        href="/dashboard/admin/notifications"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to notifications
      </Link>

      <PageHeader
        title="Email outbox"
        subtitle="Every email the platform has queued. They are sent within seconds, failures are retried automatically (up to 5 attempts), and delivery, bounce and spam-complaint results come back from the email provider."
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard/admin/notifications/outbox"
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            !status
              ? "bg-[var(--color-brand)] text-white"
              : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
          }`}
        >
          All ({Object.values(counts).reduce((a, b) => a + b, 0)})
        </Link>
        {["queued", "sending", "sent", "failed", "skipped"].map((s) =>
          counts[s] ? (
            <Link
              key={s}
              href={`/dashboard/admin/notifications/outbox?status=${s}`}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition ${
                status === s
                  ? "bg-[var(--color-brand)] text-white"
                  : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
              }`}
            >
              {s} ({counts[s]})
            </Link>
          ) : null,
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-semibold text-[var(--color-ink)]">
            Nothing queued yet
          </p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Emails appear here as soon as an event with the email channel
            enabled fires.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <details key={r.id} className="card p-5 [&_summary]:cursor-pointer">
              <summary className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                    STATUS_TINTS[r.status] ?? "bg-[var(--color-mist)]"
                  }`}
                >
                  {r.status}
                </span>
                {r.delivery_status && (
                  <span className="rounded-full bg-[var(--color-mist)] px-2.5 py-1 text-xs font-semibold capitalize text-[var(--color-ink-soft)]">
                    {r.delivery_status}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-[var(--color-ink)]">
                    {r.subject ?? "(no subject)"}
                  </span>
                  <span className="block truncate text-sm text-[var(--color-ink-soft)]">
                    To {r.to_email}
                    {r.cc?.length ? ` · CC ${r.cc.join(", ")}` : ""}
                  </span>
                </span>
                <span className="text-xs text-[var(--color-ink-soft)]">
                  {formatDateTime(r.created_at)}
                </span>
              </summary>

              <div className="mt-4 border-t border-black/10 pt-4">
                {r.event_key && (
                  <p className="mb-2 font-mono text-xs text-[var(--color-ink-soft)]/70">
                    {r.event_key}
                  </p>
                )}
                <div className="whitespace-pre-wrap rounded-xl bg-[var(--color-mist)] p-4 text-sm leading-relaxed text-[var(--color-ink)]">
                  {r.body}
                </div>
                <p className="mb-2 text-xs text-[var(--color-ink-soft)]">
                  Attempts: {r.attempts}
                  {r.status === "queued" && r.next_attempt_at
                    ? ` · next try ${formatDateTime(r.next_attempt_at)}`
                    : ""}
                  {r.provider_message_id ? ` · provider id ${r.provider_message_id}` : ""}
                </p>
                {r.error && (
                  <p className="mt-3 rounded-xl bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
                    {r.error}
                  </p>
                )}
                {(r.status === "failed" || r.status === "skipped") && (
                  <form action={retryOutboxEmail} className="mt-3">
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="btn btn-ghost text-sm">
                      Retry sending
                    </button>
                  </form>
                )}
              </div>
            </details>
          ))}
        </div>
      )}

      {suppressions.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
            Suppressed addresses
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            These addresses bounced or reported us as spam, so nothing is sent
            to them. Remove one only if you know the address is now valid.
          </p>
          <ul className="mt-3 space-y-2">
            {suppressions.map((s) => (
              <li
                key={s.email}
                className="card flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[var(--color-ink)]">
                    {s.email}
                  </span>
                  <span className="text-xs capitalize text-[var(--color-ink-soft)]">
                    {s.reason} · {formatDateTime(s.created_at)}
                  </span>
                </span>
                <form action={unsuppressEmail}>
                  <input type="hidden" name="email" value={s.email} />
                  <button type="submit" className="btn btn-ghost text-sm">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
