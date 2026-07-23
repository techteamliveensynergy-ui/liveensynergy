import Link from "next/link";

export function CTA() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20">
      <div className="relative overflow-hidden rounded-3xl bg-[var(--color-brand)] px-8 py-16 text-center text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-12 -top-12 h-48 w-48 rounded-full bg-white/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 right-0 h-56 w-56 rounded-full bg-[var(--color-ink)]/10"
        />
        <h2 className="relative font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Ready to build a better sponsorship story?
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-white/85">
          Whether you&apos;re a brand, an artist, an organiser or a fan — there&apos;s
          a place for you in the synergy.
        </p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/auth/sign-up" className="btn btn-white">
            Create your account
          </Link>
          <Link
            href="/contact"
            className="btn border-white/40 text-white hover:bg-white/10"
          >
            Talk to our team
          </Link>
        </div>
      </div>
    </section>
  );
}
