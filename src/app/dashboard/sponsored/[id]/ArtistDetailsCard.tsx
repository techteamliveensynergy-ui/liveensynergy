import Link from "next/link";

export interface ArtistDetails {
  name: string | null;
  type: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

/**
 * The artist's or organiser's own details at the top of their fulfilment
 * form (Sakshi's Artist/Organiser Fulfilment Form, #58). Read from their
 * profile, read-only here; they edit it on the profile page.
 */
export function ArtistDetailsCard({ details, isOrganiser }: { details: ArtistDetails; isOrganiser: boolean }) {
  const rows: [string, string | null][] = [
    [isOrganiser ? "Organiser" : "Artist / act", details.name],
    ["Type", details.type],
    ["Contact name", details.contact_name],
    ["Email", details.contact_email],
    ["Phone", details.contact_phone],
  ];
  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Your details</h2>
        <Link href="/dashboard/profile" className="text-sm font-semibold text-[var(--color-brand-dark)] hover:underline">
          Edit profile →
        </Link>
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">{label}</dt>
            <dd className="mt-0.5 text-sm text-[var(--color-ink)]">{value?.trim() || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
