-- =============================================================================
-- Live-En-Synergy — campaign packages
--
-- 24 Aug standup: campaign pricing moves from a single global fee formula
-- (computePlatformFee() in src/lib/constants.ts) to an admin-managed
-- catalogue of tiers. The global formula isn't removed — Enterprise Custom
-- and any campaign with no package still use it — but Starter/Growth/Premium
-- now carry their own admin-editable price and platform margin.
--
-- Seeded margins match what computePlatformFee() already produces at each
-- tier's price today (£2,500→£378, £3,750→£405, £5,000→£540, £6,000 floor→
-- £648), so day-one economics don't change — the catalogue is then free to
-- diverge per tier from the admin screen, per the confirmed decision
-- ("admin-configurable cut, not one hardcoded formula").
-- =============================================================================

create table campaign_packages (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique not null,
  name                  text not null,
  description           text,
  -- Fixed-price tiers set participant_count/price_gbp and leave the
  -- min/increment pair null. Enterprise Custom (is_custom_price) does the
  -- reverse — a free-entry budget bounded by min/increment, no fixed price.
  participant_count     integer,
  price_gbp             numeric(10, 2),
  is_custom_price       boolean not null default false,
  min_price_gbp         numeric(10, 2),
  price_increment_gbp   numeric(10, 2),
  platform_margin_gbp   numeric(10, 2) not null default 0,
  is_active             boolean not null default true,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint campaign_packages_pricing_shape check (
    (is_custom_price = false and price_gbp is not null and participant_count is not null)
    or
    (is_custom_price = true and min_price_gbp is not null and price_increment_gbp is not null)
  )
);

create trigger campaign_packages_set_updated_at before update on campaign_packages
  for each row execute function set_updated_at();

alter table campaign_packages enable row level security;

create policy "campaign_packages: read active or admin"
  on campaign_packages for select
  using (is_active or is_admin());

create policy "campaign_packages: admin manage"
  on campaign_packages for all
  using (is_admin())
  with check (is_admin());

insert into campaign_packages
  (slug, name, description, participant_count, price_gbp, is_custom_price, min_price_gbp, price_increment_gbp, platform_margin_gbp, sort_order)
values
  ('starter', 'Starter', 'A first campaign — incentivised participation at one or two events.',
   50, 2500, false, null, null, 378.00, 1),
  ('growth', 'Growth', 'Broader reach across more events and a bigger incentivised audience.',
   75, 3750, false, null, null, 405.00, 2),
  ('premium', 'Premium', 'Full research and measurement package alongside a larger audience.',
   100, 5000, false, null, null, 540.00, 3),
  ('enterprise', 'Enterprise Custom', 'A bespoke budget in multiples of £500, from £6,000.',
   null, null, true, 6000.00, 500.00, 648.00, 4)
on conflict (slug) do nothing;
