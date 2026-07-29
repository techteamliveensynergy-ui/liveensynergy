import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/public-profiles";
import { PublicProfileView } from "@/components/PublicProfileView";
import { canSeeSponsorSections } from "@/lib/profile-viewer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getPublicProfile("brand", id);
  return { title: profile ? profile.name : "Brand" };
}

export default async function BrandProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const [{ id }, { preview }] = await Promise.all([params, searchParams]);
  const profile = await getPublicProfile("brand", id);
  if (!profile) notFound();

  // Sponsor-only sections stay hidden from the general public view.
  const showSponsorSections = await canSeeSponsorSections(profile.profileId);

  return (
    <PublicProfileView
      profile={profile}
      preview={preview === "1"}
      showSponsorSections={showSponsorSections}
    />
  );
}
