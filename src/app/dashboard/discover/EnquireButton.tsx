"use client";

import { useFormStatus } from "react-dom";

/** Submit for the Discover enquiry form — shows the click registered while
 *  the enquiry is posted and the team notified (a couple of seconds). */
export function EnquireButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary w-full disabled:opacity-70">
      {pending ? "Sending to our team…" : "Enquire with our team"}
    </button>
  );
}
