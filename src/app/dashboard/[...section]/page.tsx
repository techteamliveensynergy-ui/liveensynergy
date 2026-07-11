import Link from "next/link";

const TITLES: Record<string, string> = {
  campaigns: "Campaigns",
  sponsored: "Sponsored events",
  discover: "Discover events",
  events: "My events",
  offers: "Sponsor offers",
  participations: "My events",
  rewards: "My rewards",
  messages: "Messages",
  settings: "Settings",
};

export default async function DashboardSectionPlaceholder({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  const key = section?.[0] ?? "";
  const title = TITLES[key] ?? "Coming soon";

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
      <div className="card mt-6 p-8 text-center">
        <div className="text-4xl" aria-hidden>
          🚧
        </div>
        <h2 className="mt-3 text-lg font-semibold">This section is on the way</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-ink-soft)]">
          {title} is part of the Live-En-Synergy roadmap. The landing, sign-in,
          onboarding and profile flows are live — this area is next.
        </p>
        <Link href="/dashboard" className="btn btn-primary mt-5">
          Back to overview
        </Link>
      </div>
    </div>
  );
}
