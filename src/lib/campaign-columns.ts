/**
 * Every `campaigns` column a brand session may read — all of them except
 * package_platform_margin_gbp, which anon/authenticated can't select (0086,
 * GitHub #45). With one column withheld, `select("*")` on campaigns fails
 * with "permission denied", so non-admin reads list their columns; admins
 * read full rows through the admin_campaigns() RPC (0085).
 *
 * A column added to campaigns later must be granted in its migration and
 * added here.
 */
export const CAMPAIGN_COLUMNS = [
  "id",
  "brand_id",
  "reference",
  "description",
  "budget_gbp",
  "category",
  "category_other",
  "preferred_location",
  "preferred_timeline",
  "target_name",
  "reward_rules",
  "expected_outcomes",
  "additional_info",
  "suggested_event_note",
  "suggested_event_url",
  "image_url",
  "manager_name",
  "manager_email",
  "manager_phone",
  "matched_listing_id",
  "campaign_name",
  "status",
  "payment_waived_at",
  "payment_waived_reason",
  "campaign_package_id",
  "package_participant_count",
  "opens_at",
  "open_override_reason",
  "created_at",
  "updated_at",
].join(", ");
