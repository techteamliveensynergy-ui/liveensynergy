import Link from "next/link";
import { requireProfile } from "@/lib/profile";
import { signedUrlFor } from "@/lib/storage";
import { formatDate } from "@/lib/format";
import { ATTACHMENT_HINT } from "@/lib/upload-limits";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { BrandFileUpload } from "./BrandFileUpload";
import { deleteBrandFile, setBrandFileVisibility } from "./actions";
import { ArtistFileUpload } from "./ArtistFileUpload";
import { deleteArtistFile, deleteArtistFileAsAdmin } from "./artist-file-actions";
import { ARTIST_FILE_KIND_LABEL, type ArtistFileKind } from "@/lib/artist-files";
import { PageHeader } from "@/components/dashboard/ui";
import { FAQS } from "@/lib/faqs";

export const metadata = { title: "Repository" };

interface Resource {
  title: string;
  body: string;
  href?: string;
  /** Set when the content itself isn't published yet. */
  pending?: boolean;
}

const GUIDES: Resource[] = [
  {
    title: "How it works",
    body: "Walkthrough videos covering profile setup, listing an event, creating a campaign and running the reward loop.",
    pending: true,
  },
  {
    title: "Partner guidelines",
    body: "What brands can expect from a partnership, what to include in a brief, and how matches are reviewed.",
    pending: true,
  },
  {
    title: "Artist & organiser guidelines",
    body: "How to present your event to partners, what branding value to offer, and your obligations once a deal is confirmed.",
    pending: true,
  },
  {
    title: "Blog",
    body: "Case studies and news from the Live·En·Synergy team.",
    pending: true,
  },
];

const POLICIES: Resource[] = [
  {
    title: "Frequently asked questions",
    body: "The most common questions from brands, artists and audiences.",
    href: "/faqs",
  },
  {
    title: "Terms & conditions",
    body: "The agreement covering use of the platform.",
    href: "/terms",
  },
  {
    title: "Privacy policy",
    body: "What we collect, why, and how personal data is handled.",
    href: "/privacy",
  },
  {
    title: "Contact the team",
    body: "Anything not covered here — we respond within 48 hours.",
    href: "/contact",
  },
];

interface BrandFileRow {
  id: string;
  brand_profile_id: string;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  size_bytes: number | null;
  visibility: "team" | "partners";
  created_at: string;
}

interface ArtistFileRow {
  id: string;
  artist_profile_id: string;
  uploaded_by: string;
  kind: ArtistFileKind;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  size_bytes: number | null;
  created_at: string;
}

const kb = (n: number | null) =>
  n == null ? "" : n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export default async function ResourcesPage() {
  const { profile, supabase } = await requireProfile();
  const role = profile?.role;

  // Brand files (0115): a brand manages its own; partner artists and the team
  // see what's shared with them (RLS decides which rows come back).
  const showFiles = role === "brand" || role === "artist" || role === "event" || role === "admin";
  const { data: fileData } = showFiles
    ? await supabase.from("brand_files").select("*").order("created_at", { ascending: false })
    : { data: [] };
  const files = (fileData ?? []) as BrandFileRow[];
  const brandIds = [...new Set(files.map((f) => f.brand_profile_id))];
  const [links, { data: brandRows }] = await Promise.all([
    Promise.all(files.map((f) => signedUrlFor(f.file_path, 60 * 60, { downloadName: f.file_name }))),
    role !== "brand" && brandIds.length > 0
      ? supabase.from("public_brand_profiles").select("profile_id, brand_name").in("profile_id", brandIds)
      : Promise.resolve({ data: [] }),
  ]);
  const brandName = new Map(
    ((brandRows ?? []) as { profile_id: string; brand_name: string | null }[]).map((b) => [b.profile_id, b.brand_name ?? "Brand"]),
  );
  const linkFor = new Map(files.map((f, i) => [f.id, links[i]]));

  // Artist files (0121): an artist's own (bank details, invoices, agreements)
  // and what the team added for them. RLS returns an artist their own rows and
  // an admin every row; brands never get any.
  const showArtistFiles = role === "artist" || role === "event" || role === "admin";
  const { data: artistFileData } = showArtistFiles
    ? await supabase.from("artist_files").select("*").order("created_at", { ascending: false })
    : { data: [] };
  const artistFiles = (artistFileData ?? []) as ArtistFileRow[];
  const artistLinks = await Promise.all(
    artistFiles.map((f) => signedUrlFor(f.file_path, 60 * 60, { downloadName: f.file_name })),
  );
  const artistLinkFor = new Map(artistFiles.map((f, i) => [f.id, artistLinks[i]]));
  const artistIds = [...new Set(artistFiles.map((f) => f.artist_profile_id))];
  const { data: artistProfiles } =
    role === "admin"
      ? await supabase.from("profiles").select("id, full_name, email").in("role", ["artist", "event"]).order("full_name")
      : { data: [] };
  const artistOptions = ((artistProfiles ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((a) => ({
    id: a.id,
    name: `${a.full_name?.trim() || a.email || "Artist"}${a.email && a.full_name ? ` (${a.email})` : ""}`,
  }));
  const artistName = new Map(artistOptions.map((a) => [a.id, a.name]));
  void artistIds;
  const byBrand = new Map<string, BrandFileRow[]>();
  for (const f of files) byBrand.set(f.brand_profile_id, [...(byBrand.get(f.brand_profile_id) ?? []), f]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Repository"
        subtitle="Guides and policies — everything about how Live·En·Synergy works, in one place."
      />

      {role === "brand" && (
        <section id="my-files">
          <h2 className="mb-1 font-display text-lg font-semibold text-[var(--color-ink)]">My files</h2>
          <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
            Your brand assets in one place — logos, guidelines, decks. Our team can always open them; choose whether
            the artists you partner with can too.
          </p>
          <div className="card space-y-4 p-5">
            <BrandFileUpload hint={ATTACHMENT_HINT} />
            {files.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-soft)]">No files yet.</p>
            ) : (
              <ul className="divide-y divide-black/5">
                {files.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--color-ink)]">{f.title}</p>
                      <p className="text-xs text-[var(--color-ink-soft)]">
                        {f.file_name}
                        {f.size_bytes ? ` · ${kb(f.size_bytes)}` : ""} · uploaded {formatDate(f.created_at)} ·{" "}
                        {f.visibility === "partners" ? "team + partner artists" : "team only"}
                      </p>
                      {f.description && <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">{f.description}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {linkFor.get(f.id) && (
                        <a href={linkFor.get(f.id)!} className="btn btn-ghost text-xs">
                          Download
                        </a>
                      )}
                      <form action={setBrandFileVisibility}>
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="visibility" value={f.visibility === "partners" ? "team" : "partners"} />
                        <button type="submit" className="btn btn-ghost text-xs">
                          {f.visibility === "partners" ? "Make team-only" : "Share with partners"}
                        </button>
                      </form>
                      <form action={deleteBrandFile}>
                        <input type="hidden" name="id" value={f.id} />
                        <ConfirmSubmitButton
                          label="Delete"
                          className="btn btn-ghost text-xs text-[var(--color-accent)]"
                          title={`Delete “${f.title}”?`}
                          points={["The file is removed for you, our team and your partners. This can't be undone."]}
                          confirmLabel="Delete it"
                          danger
                          pendingLabel="Deleting…"
                        />
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {(role === "artist" || role === "event") && (
        <section id="my-files-artist">
          <h2 className="mb-1 font-display text-lg font-semibold text-[var(--color-ink)]">My files</h2>
          <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
            Upload your bank details and any other documents the team needs — a bank letter or statement, an invoice, an
            agreement. Only you and the Live·En·Synergy team can open them; brands never see them. Please upload bank
            details as a file, not typed in a message.
          </p>
          <div className="card space-y-4 p-5">
            <ArtistFileUpload hint={ATTACHMENT_HINT} />
            {artistFiles.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-soft)]">No files yet.</p>
            ) : (
              <ul className="divide-y divide-black/5">
                {artistFiles.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--color-ink)]">
                        {f.title}{" "}
                        <span className="chip text-[11px]">{ARTIST_FILE_KIND_LABEL[f.kind] ?? f.kind}</span>
                        {f.uploaded_by !== f.artist_profile_id && <span className="chip ml-1 text-[11px]">Added by our team</span>}
                      </p>
                      <p className="text-xs text-[var(--color-ink-soft)]">
                        {f.file_name}
                        {f.size_bytes ? ` · ${kb(f.size_bytes)}` : ""} · {formatDate(f.created_at)}
                      </p>
                      {f.description && <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">{f.description}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {artistLinkFor.get(f.id) && (
                        <a href={artistLinkFor.get(f.id)!} className="btn btn-ghost text-xs">
                          Download
                        </a>
                      )}
                      {f.uploaded_by === f.artist_profile_id && (
                        <form action={deleteArtistFile}>
                          <input type="hidden" name="id" value={f.id} />
                          <ConfirmSubmitButton
                            label="Delete"
                            className="btn btn-ghost text-xs text-[var(--color-accent)]"
                            title={`Delete “${f.title}”?`}
                            points={["The file is removed for you and for our team. This can't be undone."]}
                            confirmLabel="Delete it"
                            danger
                            pendingLabel="Deleting…"
                          />
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {role === "admin" && (
        <section id="artist-files">
          <h2 className="mb-1 font-display text-lg font-semibold text-[var(--color-ink)]">Artist files</h2>
          <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
            Bank details, invoices and agreements artists have uploaded — and a place to add a document for an artist
            (they get a notification and can open it from their Repository).
          </p>
          <div className="card space-y-4 p-5">
            <ArtistFileUpload hint={ATTACHMENT_HINT} artists={artistOptions} />
            {artistFiles.length === 0 ? (
              <p className="text-sm text-[var(--color-ink-soft)]">No artist files yet.</p>
            ) : (
              <ul className="divide-y divide-black/5">
                {artistFiles.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--color-ink)]">
                        {f.title} <span className="chip text-[11px]">{ARTIST_FILE_KIND_LABEL[f.kind] ?? f.kind}</span>
                      </p>
                      <p className="text-xs text-[var(--color-ink-soft)]">
                        {artistName.get(f.artist_profile_id) ?? "Artist"} · {f.file_name}
                        {f.size_bytes ? ` · ${kb(f.size_bytes)}` : ""} · {formatDate(f.created_at)}
                        {f.uploaded_by !== f.artist_profile_id ? " · added by the team" : ""}
                      </p>
                      {f.description && <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">{f.description}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {artistLinkFor.get(f.id) && (
                        <a href={artistLinkFor.get(f.id)!} className="btn btn-ghost text-xs">
                          Download
                        </a>
                      )}
                      <form action={deleteArtistFileAsAdmin}>
                        <input type="hidden" name="id" value={f.id} />
                        <ConfirmSubmitButton
                          label="Delete"
                          className="btn btn-ghost text-xs text-[var(--color-accent)]"
                          title={`Delete “${f.title}”?`}
                          points={["The file is removed for the artist and the team. This can't be undone."]}
                          confirmLabel="Delete it"
                          danger
                          pendingLabel="Deleting…"
                        />
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {role !== "brand" && showFiles && files.length > 0 && (
        <section id="brand-files">
          <h2 className="mb-1 font-display text-lg font-semibold text-[var(--color-ink)]">
            {role === "admin" ? "Brand files" : "Files from your partner brands"}
          </h2>
          <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
            {role === "admin"
              ? "Everything brands have uploaded, including team-only files."
              : "Assets the brands you're partnered with have shared — use them for your promotion."}
          </p>
          <div className="space-y-3">
            {[...byBrand.entries()].map(([brandId, list]) => (
              <div key={brandId} className="card p-5">
                <p className="font-semibold">{brandName.get(brandId) ?? "Brand"}</p>
                <ul className="mt-2 divide-y divide-black/5">
                  {list.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{f.title}</p>
                        <p className="text-xs text-[var(--color-ink-soft)]">
                          {f.file_name}
                          {f.size_bytes ? ` · ${kb(f.size_bytes)}` : ""}
                          {role === "admin" ? ` · ${f.visibility === "partners" ? "shared with partners" : "team only"}` : ""}
                        </p>
                        {f.description && <p className="text-xs text-[var(--color-ink-soft)]">{f.description}</p>}
                      </div>
                      {linkFor.get(f.id) ? (
                        <a href={linkFor.get(f.id)!} className="btn btn-ghost text-xs">
                          Download
                        </a>
                      ) : (
                        <span className="text-xs text-[var(--color-ink-soft)]">Unavailable</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">
          Guides & walkthroughs
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {GUIDES.map((r) => (
            <ResourceCard key={r.title} resource={r} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">
          Policies & support
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {POLICIES.map((r) => (
            <ResourceCard key={r.title} resource={r} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">
          Quick answers
        </h2>
        <div className="card divide-y divide-black/5">
          {FAQS.map((f) => (
            <details key={f.q} className="group p-5">
              <summary className="cursor-pointer list-none font-semibold text-[var(--color-ink)] marker:content-['']">
                {f.q}
                <span className="float-right text-[var(--color-ink-soft)] transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function ResourceCard({ resource }: { resource: Resource }) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-[var(--color-ink)]">
          {resource.title}
        </h3>
        {resource.pending && (
          <span className="shrink-0 rounded-full bg-[var(--color-mist)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-ink-soft)]">
            Coming soon
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        {resource.body}
      </p>
      {resource.href && (
        <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
          Open →
        </span>
      )}
    </>
  );

  if (!resource.href) {
    return <div className="card p-5 opacity-80">{inner}</div>;
  }

  return (
    <Link
      href={resource.href}
      className="card block p-5 transition hover:-translate-y-0.5"
    >
      {inner}
    </Link>
  );
}
