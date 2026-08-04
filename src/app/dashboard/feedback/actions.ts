"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify, notifyAdmins } from "@/lib/notifications";
import { uploadPrivateFile } from "@/lib/storage";
import { createFeedbackIssue } from "@/lib/github";
import type { FeedbackKind } from "@/lib/types";

export interface FeedbackState {
  error?: string;
  message?: string;
}

const KINDS: FeedbackKind[] = ["bug", "idea", "improvement", "text_change"];

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

export async function submitFeedback(
  _prev: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const subject = str(formData.get("subject"));
  const body = str(formData.get("body"));
  if (!subject) return { error: "Give your report a short title." };
  if (!body) return { error: "Describe what happened, or what you'd change." };

  const rawKind = String(formData.get("kind") ?? "bug") as FeedbackKind;
  const kind = KINDS.includes(rawKind) ? rawKind : "bug";

  // Screenshots are private — they routinely contain other people's data.
  const upload = await uploadPrivateFile(formData.get("screenshot"), "feedback");
  if (upload.error) return { error: upload.error };

  const { data: created, error } = await supabase
    .from("feedback_reports")
    .insert({
      profile_id: user.id,
      kind,
      subject,
      body,
      page_url: str(formData.get("page_url")),
      screenshot_url: upload.path ?? null,
    })
    .select("id, reference")
    .single();

  if (error) return { error: error.message };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle<{ full_name: string | null }>();

  // Mirror to GitHub so beta reports land in the backlog with everything else
  // (3 Aug standup). Best-effort — a missing token or a failing API call must
  // not lose a report that's already saved.
  const issue = await createFeedbackIssue({
    reference: created.reference,
    kind,
    subject,
    body,
    pageUrl: str(formData.get("page_url")),
    reporterName: profile?.full_name ?? null,
  });
  if (issue) {
    await supabase
      .from("feedback_reports")
      .update({ github_issue_url: issue.url, github_issue_number: issue.number })
      .eq("id", created.id);
  }

  const variables = {
    user_name: profile?.full_name ?? "A user",
    reference: created.reference,
    kind: kind.replace(/_/g, " "),
    subject,
  };

  await notify({
    eventKey: "feedback.acknowledged",
    recipientProfileId: user.id,
    link: "/dashboard/feedback",
    variables,
  });
  await notifyAdmins({
    eventKey: "admin.feedback_received",
    link: "/dashboard/admin/feedback",
    variables,
  });

  revalidatePath("/dashboard/feedback");
  return {
    message: `Thanks — logged as ${created.reference}. We'll pick it up shortly.`,
  };
}

/** Admin triage: move a report along and optionally leave a note. */
export async function updateFeedback(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status) return;

  const resolved = status === "resolved" || status === "wont_fix";
  const { data: updated } = await supabase
    .from("feedback_reports")
    .update({
      status,
      admin_notes: str(formData.get("admin_notes")),
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? user.id : null,
    })
    .eq("id", id)
    .select("reference, subject, profile_id")
    .maybeSingle<{
      reference: string;
      subject: string;
      profile_id: string | null;
    }>();

  if (status === "resolved" && updated?.profile_id) {
    await notify({
      eventKey: "feedback.resolved",
      recipientProfileId: updated.profile_id,
      link: "/dashboard/feedback",
      variables: {
        reference: updated.reference,
        subject: updated.subject,
      },
    });
  }

  revalidatePath("/dashboard/admin/feedback");
}
