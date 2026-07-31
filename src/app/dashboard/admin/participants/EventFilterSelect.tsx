"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Filters the participants list to a single sponsored event, on top of the status/selected chips above it. */
export function EventFilterSelect({
  events,
}: {
  events: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <select
      className="select w-auto py-1.5 text-sm"
      aria-label="Filter by event"
      defaultValue={searchParams.get("event") ?? ""}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) params.set("event", e.target.value);
        else params.delete("event");
        router.push(`${pathname}${params.toString() ? `?${params}` : ""}`);
      }}
    >
      <option value="">All events</option>
      {events.map((ev) => (
        <option key={ev.id} value={ev.id}>
          {ev.name}
        </option>
      ))}
    </select>
  );
}
