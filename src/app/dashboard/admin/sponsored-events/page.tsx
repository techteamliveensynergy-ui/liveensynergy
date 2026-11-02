import { redirect } from "next/navigation";

// QA 31 Oct L-19: /dashboard/admin/sponsored-events 404ed. Sponsored events
// are listed on the admin Events page and open at
// /dashboard/admin/events/sponsored/[id]; this keeps the obvious URL working.
export default function SponsoredEventsRedirect() {
  redirect("/dashboard/admin/events");
}
