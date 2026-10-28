import Link from "next/link";
import type { Role } from "@/lib/constants";
import { PUBLIC_PROFILE_PATH } from "@/lib/public-profiles";

/**
 * "View your profile" next to "Update your profile" on the brand and artist
 * overviews (General Notes, 26 Oct; #77). Always shown, unlike the
 * completeness card. The view link opens the public page in preview mode,
 * which carries its own "this is how your profile looks" banner. Roles with
 * no public page (audience, admin) get only the update link.
 */
export function ProfileLinks({ role, profileId }: { role: Role; profileId: string }) {
  const publicPath = PUBLIC_PROFILE_PATH[role];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
      {publicPath && (
        <a
          href={`/${publicPath}/${profileId}?preview=1`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-brand-dark)] hover:underline"
        >
          View your profile ↗
        </a>
      )}
      <Link href="/dashboard/profile" className="text-[var(--color-brand-dark)] hover:underline">
        Update your profile →
      </Link>
    </div>
  );
}
