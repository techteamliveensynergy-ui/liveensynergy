"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sessionUser } from "@/lib/supabase/auth-user";
import { uploadPrivateFile } from "@/lib/storage";

/**
 * A brand's own files in the Repository (0115): logos, guidelines, decks.
 * Stored privately under {brand}/brand-files/; the team can always open them,
 * and a "partners" file also opens for artists in a partnership with the brand.
 */
export interface BrandFileState {
  error?: string;
  message?: string;
}

async function requireBrandUser() {
  const supabase = await createClient();
  const user = await sessionUser(supabase);
  if (!user) return { supabase, userId: null as string | null, isBrand: false };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: string }>();
  return { supabase, userId: user.id, isBrand: profile?.role === "brand" };
}

export async function uploadBrandFile(_prev: BrandFileState, formData: FormData): Promise<BrandFileState> {
  const { supabase, userId, isBrand } = await requireBrandUser();
  if (!userId) return { error: "Please sign in again." };
  if (!isBrand) return { error: "Only brand accounts can upload files here." };

  const file = formData.get("file");
  const title = String(formData.get("title") ?? "").trim() || (file instanceof File ? file.name : "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const visibility = formData.get("visibility") === "team" ? "team" : "partners";
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (title.length > 200) return { error: "Keep the title under 200 characters." };

  const uploaded = await uploadPrivateFile(file, "brand-files", { supabase, userId });
  if (uploaded.error || !uploaded.path) return { error: uploaded.error ?? "The upload didn't go through — try again." };

  const { error } = await supabase.from("brand_files").insert({
    brand_profile_id: userId,
    title,
    description,
    file_path: uploaded.path,
    file_name: file.name.slice(0, 255),
    content_type: file.type || null,
    size_bytes: file.size,
    visibility,
  });
  if (error) {
    // Don't leave an orphan object behind.
    await supabase.storage.from("private-uploads").remove([uploaded.path]);
    return { error: error.message };
  }
  revalidatePath("/dashboard/resources");
  return { message: `“${title}” uploaded.` };
}

export async function deleteBrandFile(formData: FormData) {
  const { supabase, userId } = await requireBrandUser();
  if (!userId) return;
  const id = String(formData.get("id") ?? "");
  const { data: row } = await supabase
    .from("brand_files")
    .delete()
    .eq("id", id)
    .eq("brand_profile_id", userId)
    .select("file_path")
    .maybeSingle<{ file_path: string }>();
  if (row?.file_path) await supabase.storage.from("private-uploads").remove([row.file_path]);
  revalidatePath("/dashboard/resources");
}

export async function setBrandFileVisibility(formData: FormData) {
  const { supabase, userId } = await requireBrandUser();
  if (!userId) return;
  const id = String(formData.get("id") ?? "");
  const visibility = formData.get("visibility") === "team" ? "team" : "partners";
  await supabase.from("brand_files").update({ visibility }).eq("id", id).eq("brand_profile_id", userId);
  revalidatePath("/dashboard/resources");
}
