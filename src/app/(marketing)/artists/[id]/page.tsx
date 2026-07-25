import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/public-profiles";
import { PublicProfileView } from "@/components/PublicProfileView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getPublicProfile("artist", id);
  return { title: profile ? profile.name : "Artist" };
}

export default async function ArtistProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const [{ id }, { preview }] = await Promise.all([params, searchParams]);
  const profile = await getPublicProfile("artist", id);
  if (!profile) notFound();
  return <PublicProfileView profile={profile} preview={preview === "1"} />;
}
