"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/supabase/auth-user";
import { uploadPrivateFile } from "@/lib/storage";
import { notify, notifyAdmins } from "@/lib/notifications";
import { ARTIST_FILE_KINDS, ARTIST_FILE_KIND_LABEL, type ArtistFileKind } from "@/lib/artist-files";

/**
 * An artist's / organiser's own files in the Repository (0121): bank details
 * (a letter or statement — never typed in), invoices, agreements, anything
 * else. Private; the artist and the team can open them, never the brand. The
 * team can add a file for an artist too.
 */
export interface ArtistFileState {
  error?: string;
  message?: string;
}

function kindOf(v: FormDataEntryValue | null): ArtistFileKind {
  return (ARTIST_FILE_KINDS as readonly string[]).includes(String(v)) ? (String(v) as ArtistFileKind) : "other";
}

async function requireUser() {
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  if (!user) return { supabase, user: null, role: null as string | null, name: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle<{ role: string; full_name: string | null }>();
  return { supabase, user, role: profile?.role ?? null, name: profile?.full_name ?? null };
}

/** An artist/organiser uploads one of their own files — optionally tied to a partnership (an invoice). */
export async function uploadArtistFile(_prev: ArtistFileState, formData: FormData): Promise<ArtistFileState> {
  const { supabase, user, role, name } = await requireUser();
  if (!user) return { error: "Please sign in again." };
  if (role !== "artist" && role !== "event") return { error: "Only artist and organiser accounts can upload here." };

  const file = formData.get("file");
  const kind = kindOf(formData.get("kind"));
  const title = String(formData.get("title") ?? "").trim() || (file instanceof File ? file.name : "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const eventId = String(formData.get("event_id") ?? "").trim() || null;
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (title.length > 200) return { error: "Keep the title under 200 characters." };

  let eventName: string | null = null;
  let eventRef: string | null = null;
  if (eventId) {
    const { data: ev } = await supabase
      .from("sponsored_events")
      .select("name, reference")
      .eq("id", eventId)
      .eq("artist_profile_id", user.id)
      .maybeSingle<{ name: string; reference: string | null }>();
    if (!ev) return { error: "We couldn't find that partnership." };
    eventName = ev.name;
    eventRef = ev.reference;
  }

  const uploaded = await uploadPrivateFile(file, "artist-files", { supabase, userId: user.id });
  if (uploaded.error || !uploaded.path) return { error: uploaded.error ?? "The upload didn't go through — try again." };

  const { error } = await supabase.from("artist_files").insert({
    artist_profile_id: user.id,
    uploaded_by: user.id,
    kind,
    title,
    description,
    sponsored_event_id: eventId,
    file_path: uploaded.path,
    file_name: file.name.slice(0, 255),
    content_type: file.type || null,
    size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from("private-uploads").remove([uploaded.path]);
    return { error: error.message };
  }

  await notifyAdmins({
    eventKey: "admin.artist_file_added",
    link: eventId ? `/dashboard/admin/events/sponsored/${eventId}` : "/dashboard/resources",
    variables: {
      artist_name: name ?? "An artist",
      file_title: title,
      file_kind: ARTIST_FILE_KIND_LABEL[kind].toLowerCase(),
      event_name: eventName ?? "",
      reference: eventRef ?? "",
    },
  });
  revalidatePath("/dashboard/resources");
  if (eventId) revalidatePath(`/dashboard/sponsored/${eventId}`);
  return { message: `“${title}” uploaded.` };
}

/** The artist removes a file they uploaded (a team-added file stays — RLS refuses it). */
export async function deleteArtistFile(formData: FormData) {
  const { supabase, user } = await requireUser();
  if (!user) return;
  const id = String(formData.get("id") ?? "");
  const { data: row } = await supabase
    .from("artist_files")
    .delete()
    .eq("id", id)
    .eq("artist_profile_id", user.id)
    .eq("uploaded_by", user.id)
    .select("file_path")
    .maybeSingle<{ file_path: string }>();
  if (row?.file_path) await supabase.storage.from("private-uploads").remove([row.file_path]);
  revalidatePath("/dashboard/resources");
}

/** The team adds a file for an artist (a contract or other document — never an invoice). Admin only. */
export async function addArtistFileForArtist(_prev: ArtistFileState, formData: FormData): Promise<ArtistFileState> {
  const { supabase, user, role } = await requireUser();
  if (!user) return { error: "Please sign in again." };
  if (role !== "admin") return { error: "Only the team can add a file for an artist." };

  const artistId = String(formData.get("artist_profile_id") ?? "").trim();
  const file = formData.get("file");
  const kind = kindOf(formData.get("kind"));
  // An invoice is the artist's own document: the team never creates or uploads one on their behalf.
  if (kind === "invoice") return { error: "The team can't add an invoice for an artist — artists upload their own." };
  const title = String(formData.get("title") ?? "").trim() || (file instanceof File ? file.name : "");
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!artistId) return { error: "Choose the artist this file is for." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (title.length > 200) return { error: "Keep the title under 200 characters." };

  const { data: artist } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", artistId)
    .in("role", ["artist", "event"])
    .maybeSingle<{ id: string; role: string }>();
  if (!artist) return { error: "That isn't an artist or organiser account." };

  const uploaded = await uploadPrivateFile(file, "artist-files", { supabase, userId: user.id });
  if (uploaded.error || !uploaded.path) return { error: uploaded.error ?? "The upload didn't go through — try again." };

  const { error } = await supabase.from("artist_files").insert({
    artist_profile_id: artistId,
    uploaded_by: user.id,
    kind,
    title,
    description,
    file_path: uploaded.path,
    file_name: file.name.slice(0, 255),
    content_type: file.type || null,
    size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from("private-uploads").remove([uploaded.path]);
    return { error: error.message };
  }

  await notify({
    eventKey: "artist.file_from_team",
    recipientProfileId: artistId,
    link: "/dashboard/resources",
    variables: { file_title: title },
  });
  revalidatePath("/dashboard/resources");
  return { message: `“${title}” added to the artist's files.` };
}

/** The team removes any artist file (for example one added by mistake). Admin only. */
export async function deleteArtistFileAsAdmin(formData: FormData) {
  const { supabase, user, role } = await requireUser();
  if (!user || role !== "admin") return;
  const id = String(formData.get("id") ?? "");
  const { data: row } = await supabase
    .from("artist_files")
    .delete()
    .eq("id", id)
    .select("file_path, uploaded_by")
    .maybeSingle<{ file_path: string; uploaded_by: string }>();
  // Only remove the object when the admin's own session may (it sits in the
  // uploader's folder); an artist's object is left for the storage policy.
  if (row?.file_path && row.uploaded_by === user.id) await supabase.storage.from("private-uploads").remove([row.file_path]);
  revalidatePath("/dashboard/resources");
}
