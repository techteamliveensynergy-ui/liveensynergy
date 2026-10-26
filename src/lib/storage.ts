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

/** An already-authenticated caller (e.g. from `requireAdmin()`/`requireProfile()`)
 *  can pass its own client + user id so an upload doesn't re-check auth with a
 *  second, independent `auth.getUser()` call. */
interface AuthedCaller {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
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
  authed?: AuthedCaller,
): Promise<UploadResult> {
  if (!(file instanceof File) || file.size === 0) return {};

  const problem = fileError(file, {
    maxBytes: MAX_IMAGE_BYTES,
    allowedTypes: IMAGE_TYPES,
  });
  if (problem) return { error: problem };

  let supabase = authed?.supabase;
  let userId = authed?.userId;
  if (!supabase || !userId) {
    supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You need to be signed in to upload." };
    userId = user.id;
  }

  const path = `${userId}/${purpose}/${crypto.randomUUID()}.${extensionFor(file)}`;
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
  authed?: AuthedCaller,
): Promise<UploadResult> {
  if (!(file instanceof File) || file.size === 0) return {};

  const problem = fileError(file, {
    maxBytes: MAX_ATTACHMENT_BYTES,
    allowedTypes: null,
  });
  if (problem) return { error: problem };

  let supabase = authed?.supabase;
  let userId = authed?.userId;
  if (!supabase || !userId) {
    supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You need to be signed in to upload." };
    userId = user.id;
  }

  const path = `${userId}/${purpose}/${crypto.randomUUID()}.${extensionFor(file)}`;
  const { error } = await supabase.storage
    .from(PRIVATE_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) return { error: error.message };
  return { path, name: file.name, type: file.type };
}

const DOWNLOAD_NAME_MAX = 120;

/**
 * The name a private file downloads under. Objects are stored as
 * `{profileId}/{purpose}/{uuid}.{ext}` (the storage policies need that
 * layout), so without one the browser saves `3f2a…c9.pdf` (GitHub #51).
 *
 * The extension always comes from the stored path, never from the user's
 * name, so a renamed file can't be presented as a different type. Path
 * separators, control characters and double quotes are stripped (it ends up
 * in a Content-Disposition header); Unicode is kept. Capped at 120
 * characters, extension included.
 */
export function safeDownloadName(name: string | null | undefined, path: string): string {
  const stored = path.split("/").pop() ?? "";
  const dot = stored.lastIndexOf(".");
  const ext = dot > 0 ? stored.slice(dot + 1).toLowerCase() : "";

  let base = (name ?? "").split(/[\\/]/).pop() ?? "";
  base = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  const nameDot = base.lastIndexOf(".");
  if (nameDot > 0) base = base.slice(0, nameDot).trim();
  if (!base) base = "download";

  const suffix = ext ? `.${ext}` : "";
  return base.slice(0, DOWNLOAD_NAME_MAX - suffix.length).trim() + suffix;
}

/**
 * Signs a private object. Short expiry — links are generated per page
 * render, so there's no reason for them to outlive the session.
 *
 * Pass `downloadName` for a file someone saves (chat attachments, reports):
 * the link then downloads under that name instead of the stored uuid. Leave
 * it off for anything shown inline (`<img>` thumbnails, ticket proofs opened
 * in a tab) — a download link would make the browser save it instead.
 */
export async function signedUrlFor(
  path: string | null | undefined,
  expiresInSeconds = 60 * 60,
  options: { downloadName?: string | null } = {},
): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const download =
    "downloadName" in options ? safeDownloadName(options.downloadName, path) : undefined;
  const { data, error } = await supabase.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(path, expiresInSeconds, download ? { download } : undefined);
  if (error) return null;
  return data.signedUrl;
}
