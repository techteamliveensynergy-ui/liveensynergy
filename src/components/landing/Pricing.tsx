import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/**
 * Campaign packages, read from `campaign_packages` so an admin's price or
 * tier change shows here without a deploy (#37). Replaces the old "9% + VAT,
 * no minimum budget" fee model. Active packages are publicly readable
 * (policy "campaign_packages: read active or admin"); only the columns a
 * visitor needs are selected — never the platform margin.
 */
type Pkg = {
  slug: string;
  name: string;
  description: string | null;
  participant_count: number | null;
  price_gbp: number | null;
  is_custom_price: boolean;
  min_price_gbp: number | null;
  price_increment_gbp: number | null;
};

const gbp = (n: number) =>
  `£${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

export async function Pricing() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaign_packages")
    .select(
      "slug, name, description, participant_count, price_gbp, is_custom_price, min_price_gbp, price_increment_gbp",
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const packages = (data ?? []) as Pkg[];

  return (
    <section id="packages" className="bg-[var(--color-ink)] text-white">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="max-w-2xl">
          <span className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white">
            Campaign packages
          </span>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Choose the package that fits your campaign
          </h2>
          <p className="mt-4 text-lg text-white/70">
            Every package is run end to end by our team. After you order,
            we&apos;ll be in touch within 3 days to plan the details. All prices
            exclude VAT.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {packages.map((p) => (
            <div
              key={p.slug}
              className="flex flex-col rounded-2xl bg-white/5 p-6 ring-1 ring-white/10"
            >
              <p className="text-sm font-semibold text-white/60">{p.name}</p>
              <p className="mt-2 font-display text-3xl font-semibold text-[var(--color-gold)]">
                {p.is_custom_price
                  ? p.min_price_gbp != null
                    ? `From ${gbp(p.min_price_gbp)}`
                    : "Custom"
                  : p.price_gbp != null
                    ? gbp(p.price_gbp)
                    : ""}
              </p>
              <p className="mt-1 text-sm text-white/70">
                {p.is_custom_price
                  ? p.price_increment_gbp != null
                    ? `Your budget, in steps of ${gbp(p.price_increment_gbp)}`
                    : "Your budget"
                  : p.participant_count != null
                    ? `${p.participant_count.toLocaleString("en-GB")} incentivised participants`
                    : ""}
              </p>
              {p.description && (
                <p className="mt-4 text-sm text-white/70">{p.description}</p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
          <p className="text-white/80">
            <span className="font-semibold text-white">Enterprise Bespoke.</span>{" "}
            Something bigger or different in mind? Tell us about it.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/auth/sign-up?role=brand" className="btn btn-white">
              Start a campaign
            </Link>
            <Link
              href="/contact"
              className="btn border-white/40 text-white hover:bg-white/10"
            >
              Contact us
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
