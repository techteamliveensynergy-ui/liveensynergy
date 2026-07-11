import Link from "next/link";
import { requireProfile } from "@/lib/profile";
import { ROLE_LABELS, type Role } from "@/lib/constants";

const QUICK_START: Record<Role, { href: string; title: string; body: string }[]> =
  {
    brand: [
      {
        href: "/dashboard/campaigns",
        title: "Create a campaign",
        body: "Set a budget and reward rules — we'll match you with a fitting artist or event.",
      },
      {
        href: "/dashboard/discover",
        title: "Discover events",
        body: "Browse events currently open for sponsorship.",
      },
      {
        href: "/dashboard/profile",
        title: "Complete your brand profile",
        body: "Add your mission, keywords and manager details.",
      },
    ],
    artist: [
      {
        href: "/dashboard/events",
        title: "List an event",
        body: "Create an event and mark it available for sponsorship.",
      },
      {
        href: "/dashboard/offers",
        title: "Review sponsor offers",
        body: "See which brands want to partner with you.",
      },
      {
        href: "/dashboard/profile",
        title: "Polish your profile",
        body: "Add your bio, socials and sponsor value details.",
      },
    ],
    event: [
      {
        href: "/dashboard/events",
        title: "List an event",
        body: "Create an event and mark it available for sponsorship.",
      },
      {
        href: "/dashboard/offers",
        title: "Review sponsor offers",
        body: "See which brands want to partner with your events.",
      },
      {
        href: "/dashboard/profile",
        title: "Polish your profile",
        body: "Add your event details, socials and sponsor value.",
      },
    ],
    audience: [
      {
        href: "/dashboard/discover",
        title: "Find events",
        body: "Browse events with sponsor-funded rewards.",
      },
      {
        href: "/dashboard/participations",
        title: "My events",
        body: "Track the events you've signed up for.",
      },
      {
        href: "/dashboard/rewards",
        title: "My rewards",
        body: "Upload proof and claim your reimbursements.",
      },
    ],
  };

export default async function DashboardHome() {
  const { profile } = await requireProfile();
  const role = profile!.role;
  const cards = QUICK_START[role];

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm text-[var(--color-ink-soft)]">
          {ROLE_LABELS[role]} dashboard
        </p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Welcome back, {profile!.full_name?.split(" ")[0] ?? "there"} 👋
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card block p-5 transition hover:-translate-y-0.5">
            <h3 className="font-semibold">{c.title}</h3>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{c.body}</p>
            <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand)]">
              Open →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
