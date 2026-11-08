import Link from "next/link";
import { requireProfile } from "@/lib/profile";
import { signedUrlFor } from "@/lib/storage";
import { formatDate } from "@/lib/format";
import { ATTACHMENT_HINT } from "@/lib/upload-limits";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { BrandFileUpload } from "./BrandFileUpload";
import { deleteBrandFile, setBrandFileVisibility } from "./actions";
import { PageHeader } from "@/components/dashboard/ui";
import { FAQS } from "@/lib/faqs";
import { PLATFORM_FEE } from "@/lib/constants";

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
  const byBrand = new Map<string, BrandFileRow[]>();
  for (const f of files) byBrand.set(f.brand_profile_id, [...(byBrand.get(f.brand_profile_id) ?? []), f]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Repository"
        subtitle="Guides, policies and pricing — everything about how Live·En·Synergy works, in one place."
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
          Pricing structure
        </h2>
        <div className="card p-6">
          <p className="text-sm text-[var(--color-ink-soft)]">
            Live·En·Synergy charges a single service fee on the partnership
            budget — whichever of these two is higher:
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-[var(--color-mist)] px-4 py-3">
              <p className="font-display text-2xl font-semibold">
                £{PLATFORM_FEE.minFlatGbp}
              </p>
              <p className="text-xs text-[var(--color-ink-soft)]">
                minimum flat fee, + VAT
              </p>
            </div>
            <div className="rounded-xl bg-[var(--color-mist)] px-4 py-3">
              <p className="font-display text-2xl font-semibold">
                {Math.round(PLATFORM_FEE.percentage * 100)}%
              </p>
              <p className="text-xs text-[var(--color-ink-soft)]">
                of the partnership budget, + VAT
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
            The remainder is what&apos;s available to fund audience rewards. You
            see the exact split before submitting a campaign.
          </p>
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
