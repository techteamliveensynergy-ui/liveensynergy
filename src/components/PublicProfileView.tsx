import Link from "next/link";
import type { PublicProfile } from "@/lib/public-profiles";

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  spotify: "Spotify",
  linkedin: "LinkedIn",
  x: "X",
  pinterest: "Pinterest",
};

const ROLE_LABEL: Record<PublicProfile["role"], string> = {
  artist: "Artist",
  event: "Event organiser",
  brand: "Brand / Sponsor",
};

/**
 * The public-facing profile. Rendered both at the public URL and behind the
 * "Preview public profile" button, so what the owner previews is exactly what
 * a visitor sees.
 */
export function PublicProfileView({
  profile,
  preview,
}: {
  profile: PublicProfile;
  /** Shows a banner explaining this is how others see the page. */
  preview?: boolean;
}) {
  const socials = Object.entries(profile.socialLinks ?? {}).filter(
    ([, url]) => !!url,
  );

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      {preview && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--color-lavender)] px-4 py-3 text-sm">
          <span className="font-medium text-[var(--color-purple-deep)]">
            Preview — this is how your profile looks to everyone else.
          </span>
          <Link
            href="/dashboard/profile"
            className="font-semibold text-[var(--color-purple-deep)] underline"
          >
            Edit profile
          </Link>
        </div>
      )}

      {profile.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.bannerUrl}
          alt=""
          className="h-44 w-full rounded-2xl object-cover md:h-56"
        />
      ) : (
        <div className="h-44 w-full rounded-2xl bg-[var(--color-mist)] md:h-56" />
      )}

      <div className="-mt-12 px-2 md:px-6">
        {profile.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.imageUrl}
            alt=""
            className="h-24 w-24 rounded-2xl border-4 border-white object-cover shadow-sm"
          />
        ) : (
          <div className="grid h-24 w-24 place-items-center rounded-2xl border-4 border-white bg-[var(--color-gold)] text-3xl shadow-sm">
            {profile.name.slice(0, 1).toUpperCase()}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-3xl">
            {profile.name}
          </h1>
          <span className="chip">{ROLE_LABEL[profile.role]}</span>
          {profile.category && <span className="chip">{profile.category}</span>}
        </div>
        {profile.secondaryName && (
          <p className="mt-1 font-serif text-[var(--color-ink-soft)]">
            Also known as {profile.secondaryName}
          </p>
        )}

        {profile.about && (
          <p className="mt-5 whitespace-pre-wrap text-[var(--color-ink-soft)]">
            {profile.about}
          </p>
        )}

        {profile.sponsorValue && (
          <section className="card mt-6 p-6">
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
              What sponsors get
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-ink-soft)]">
              {profile.sponsorValue}
            </p>
          </section>
        )}

        {profile.videoUrl && (
          <section className="mt-6">
            <h2 className="mb-2 font-display text-lg font-semibold text-[var(--color-ink)]">
              Watch
            </h2>
            <a
              href={profile.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5"
            >
              <span className="text-2xl" aria-hidden>
                ▶️
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-brand-dark)]">
                {profile.videoUrl}
              </span>
            </a>
          </section>
        )}

        {(profile.websiteUrl || socials.length > 0) && (
          <section className="mt-6">
            <h2 className="mb-2 font-display text-lg font-semibold text-[var(--color-ink)]">
              Find them online
            </h2>
            <div className="flex flex-wrap gap-2">
              {profile.websiteUrl && (
                <a
                  href={profile.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip hover:bg-black/5"
                >
                  Website ↗
                </a>
              )}
              {socials.map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip hover:bg-black/5"
                >
                  {SOCIAL_LABELS[key] ?? key} ↗
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
