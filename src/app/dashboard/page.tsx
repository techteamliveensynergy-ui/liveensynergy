import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { ROLE_LABELS } from "@/lib/constants";
import { BrandHome } from "./BrandHome";
import { ArtistHome } from "./ArtistHome";

const AUDIENCE_QUICK_START = [
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
];

export default async function DashboardHome() {
  const { profile } = await requireProfile();
  const role = profile!.role;
  if (role === "admin") redirect("/dashboard/admin");

  if (role === "brand") return <BrandHome profile={profile!} />;
  if (role === "artist" || role === "event") return <ArtistHome profile={profile!} />;

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm text-[var(--color-ink-soft)]">
          {ROLE_LABELS[role]} dashboard
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--color-ink)] md:text-3xl">
          Welcome back, {profile!.full_name?.split(" ")[0] ?? "there"} 👋
        </h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AUDIENCE_QUICK_START.map((c) => (
          <Link key={c.href} href={c.href} className="card block p-5 transition hover:-translate-y-0.5">
            <h3 className="font-semibold text-[var(--color-ink)]">{c.title}</h3>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{c.body}</p>
            <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
              Open →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
