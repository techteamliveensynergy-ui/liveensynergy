import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { BrandHome } from "./BrandHome";
import { ArtistHome } from "./ArtistHome";
import { AudienceHome } from "./AudienceHome";

export default async function DashboardHome() {
  const { profile } = await requireProfile();
  const role = profile!.role;
  if (role === "admin") redirect("/dashboard/admin");

  if (role === "brand") return <BrandHome profile={profile!} />;
  if (role === "artist" || role === "event") return <ArtistHome profile={profile!} />;
  return <AudienceHome profile={profile!} />;
}
