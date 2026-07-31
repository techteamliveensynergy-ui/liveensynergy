"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications";

/**
 * Self-service attendance confirmation — the audience member scans the QR
 * code (or follows the link) the artist displays at the venue and confirms
 * it's them, in place of the organiser having to verify each attendee by hand.
 */
export async function confirmAttendance(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const token = String(formData.get("token") ?? "");
  if (!user) redirect(`/auth/sign-in?redirectTo=/attend/${token}`);
  if (!token) redirect("/dashboard");

  const participationId = String(formData.get("participation_id") ?? "");
  if (!participationId) redirect(`/attend/${token}`);

  const { data: p } = await supabase
    .from("participations")
    .select("id, status, selected, sponsored_events(name)")
    .eq("id", participationId)
    .eq("audience_profile_id", user.id)
    .maybeSingle<{
      id: string;
      status: string;
      selected: boolean;
      sponsored_events: { name: string } | null;
    }>();

  if (p && p.selected && (p.status === "registered" || p.status === "ticket_uploaded")) {
    await supabase
      .from("participations")
      .update({
        status: "attendance_verified",
        attendance_verified_at: new Date().toISOString(),
      })
      .eq("id", participationId);

    await notify({
      eventKey: "participation.verified",
      recipientProfileId: user.id,
      link: "/dashboard/participations",
      variables: { event_name: p.sponsored_events?.name ?? "your event" },
    });
  }

  redirect(`/attend/${token}`);
}
