import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import { toggleContactHandled } from "../marketplace-actions";

export const metadata = { title: "Enquiries · Admin" };

interface Row {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  body: string;
  created_at: string;
  handled_at: string | null;
}

export default async function AdminEnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireRole(["admin"]);
  const { filter } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("contact_messages")
    .select("*")
    .order("created_at", { ascending: false });

  const all = (data ?? []) as Row[];
  const open = all.filter((m) => !m.handled_at).length;
  const rows =
    filter === "handled"
      ? all.filter((m) => m.handled_at)
      : filter === "open"
        ? all.filter((m) => !m.handled_at)
        : all;

  return (
    <div>
      <PageHeader
        title="Contact enquiries"
        subtitle={`Submissions from the public contact form. ${open} still open.`}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { value: "", label: `All (${all.length})` },
          { value: "open", label: `Open (${open})` },
          { value: "handled", label: `Handled (${all.length - open})` },
        ].map((f) => (
          <Link
            key={f.label}
            href={`/dashboard/admin/enquiries${f.value ? `?filter=${f.value}` : ""}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              (filter ?? "") === f.value
                ? "bg-[var(--color-brand)] text-white"
                : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-semibold text-[var(--color-ink)]">No enquiries</p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Messages from the public contact form land here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((m) => (
            <details key={m.id} className="card p-5 [&_summary]:cursor-pointer">
              <summary className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    m.handled_at
                      ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]"
                      : "bg-[var(--color-gold)] text-[var(--color-ink)]"
                  }`}
                >
                  {m.handled_at ? "Handled" : "Open"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-[var(--color-ink)]">
                    {m.subject || "(no subject)"}
                  </span>
                  <span className="block truncate text-sm text-[var(--color-ink-soft)]">
                    {m.name} · {m.email}
                  </span>
                </span>
                <span className="text-xs text-[var(--color-ink-soft)]">
                  {formatDateTime(m.created_at)}
                </span>
              </summary>

              <div className="mt-4 border-t border-black/10 pt-4">
                <div className="whitespace-pre-wrap rounded-xl bg-[var(--color-mist)] p-4 text-sm leading-relaxed text-[var(--color-ink)]">
                  {m.body}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <a
                    href={`mailto:${m.email}?subject=${encodeURIComponent(
                      `Re: ${m.subject ?? "Your enquiry"}`,
                    )}`}
                    className="btn btn-ghost text-sm"
                  >
                    Reply by email
                  </a>
                  <form action={toggleContactHandled}>
                    <input type="hidden" name="id" value={m.id} />
                    <input
                      type="hidden"
                      name="handled"
                      value={(!m.handled_at).toString()}
                    />
                    <button type="submit" className="btn btn-ghost text-sm">
                      {m.handled_at ? "Reopen" : "Mark handled"}
                    </button>
                  </form>
                  {m.handled_at && (
                    <span className="text-xs text-[var(--color-ink-soft)]">
                      Handled {formatDateTime(m.handled_at)}
                    </span>
                  )}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
