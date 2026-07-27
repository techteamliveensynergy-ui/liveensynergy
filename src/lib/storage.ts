import { createClient } from "@/lib/supabase/server";
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_ATTACHMENT_BYTES,
  fileError,
} from "@/lib/upload-limits";

/**
 * File upload helpers over the two buckets defined in migration 0009.
 *
 * Every object is written under `{profileId}/{purpose}/{uuid}.{ext}` — the
 * storage policies key on that first folder segment, so a user can only ever
 * write inside their own namespace.
 */

export const MEDIA_BUCKET = "media";
export const PRIVATE_BUCKET = "private-uploads";

export interface UploadResult {
  url?: string;
  path?: string;
  name?: string;
  type?: string;
  error?: string;
}

function extensionFor(file: File) {
  const fromName = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
  if (fromName) return fromName;
  const fromType = file.type.split("/")[1] ?? "bin";
  return fromType.replace(/[^a-z0-9]/g, "");
}

/**
 * Uploads a public image and returns its permanent public URL.
 * Returns `{}` (no url, no error) when no file was actually selected, so
 * callers can treat "left blank" as "don't change anything".
 */
export async function uploadImage(
  file: FormDataEntryValue | null,
  purpose: string,
): Promise<UploadResult> {
  if (!(file instanceof File) || file.size === 0) return {};

  const problem = fileError(file, {
    maxBytes: MAX_IMAGE_BYTES,
    allowedTypes: IMAGE_TYPES,
  });
  if (problem) return { error: problem };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in to upload." };

  const path = `${user.id}/${purpose}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { error: error.message };

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path, name: file.name, type: file.type };
}

/**
 * Uploads a private attachment. Returns the storage *path* rather than a URL —
 * the object isn't publicly readable, so it has to be signed at render time.
 */
export async function uploadPrivateFile(
  file: FormDataEntryValue | null,
  purpose: string,
): Promise<UploadResult> {
  if (!(file instanceof File) || file.size === 0) return {};

  const problem = fileError(file, {
    maxBytes: MAX_ATTACHMENT_BYTES,
    allowedTypes: null,
  });
  if (problem) return { error: problem };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in to upload." };

  const path = `${user.id}/${purpose}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from(PRIVATE_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) return { error: error.message };
  return { path, name: file.name, type: file.type };
}

/**
 * Signs a private object for viewing. Short expiry — links are generated per
 * page render, so there's no reason for them to outlive the session.
 */
export async function signedUrlFor(
  path: string | null | undefined,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}
