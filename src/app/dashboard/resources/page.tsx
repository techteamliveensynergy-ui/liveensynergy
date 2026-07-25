import Link from "next/link";
import { requireProfile } from "@/lib/profile";
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
    title: "Sponsor guidelines",
    body: "What brands can expect from a sponsorship, what to include in a brief, and how matches are reviewed.",
    pending: true,
  },
  {
    title: "Artist & organiser guidelines",
    body: "How to present your event to sponsors, what branding value to offer, and your obligations once a deal is confirmed.",
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

export default async function ResourcesPage() {
  await requireProfile();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Repository"
        subtitle="Guides, policies and pricing — everything about how Live·En·Synergy works, in one place."
      />

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
            Live·En·Synergy charges a single service fee on the sponsorship
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
                of the sponsorship budget, + VAT
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
