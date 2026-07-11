import Link from "next/link";

export function CTA() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-accent)] px-8 py-14 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
          Ready to build a better sponsorship story?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-white/80">
          Whether you&apos;re a brand, an artist, an organiser or a fan — there&apos;s
          a place for you in the synergy.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
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
