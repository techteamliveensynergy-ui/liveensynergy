import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pct, REPORT_FORMAT, type ReportMeasurement } from "@/lib/analysis/campaign-report";
import { CAMPAIGN_COLUMNS } from "@/lib/campaign-columns";
import { campaignTitle } from "@/lib/campaign-requests";
import { QUESTION_TYPE_LABELS, questionTitle } from "@/lib/survey-results";
import type { ExportQuestion } from "@/lib/survey-export";
import type { Campaign } from "@/lib/types";

/**
 * context.json — the second input of an automatic survey report (0127), next
 * to the anonymised responses.csv. Everything the analyst needs to know about
 * the survey, campaign, brand and event, plus the Measurement figures, all
 * from the database. Never: the platform's margin (#45), anyone's name or
 * contact details, or a per-person row.
 */

export interface ReportContext {
  format: typeof REPORT_FORMAT;
  generated_at: string;
  survey: {
    id: string;
    title: string;
    kind: "pre_event" | "post_event";
    published_at: string | null;
    closed_at: string;
    close_reason: string;
    questions: { no: string; text: string; type: string }[];
    responses: { passed: number; held_for_review: number; rejected: number };
  };
  campaign: {
    reference: string;
    title: string;
    objectives: string | null;
    expected_outcomes: string | null;
    categories: string[];
    preferred_location: string | null;
    package: string | null;
    package_value_gbp: number | null;
    participant_target: number | null;
  } | null;
  brand: { name: string } | null;
  event: {
    reference: string;
    name: string;
    date: string | null;
    start_time: string | null;
    timezone: string | null;
    venue: string | null;
    location: string | null;
    category: string | null;
    capacity: number | null;
    audience_description: string | null;
    status: string;
  } | null;
  measurement: ReportMeasurement;
  pre_survey: { title: string; passed_responses: number; matched_questions: number } | null;
}

type EventRow = {
  id: string;
  reference: string;
  name: string;
  event_date: string | null;
  start_time: string | null;
  timezone: string | null;
  venue_details: string | null;
  location: string | null;
  venue_address?: string | null;
  status: string;
  event_listings: {
    category: string | null;
    capacity: number | null;
    audience_description: string | null;
    venue_name: string | null;
    city: string | null;
  } | null;
};

const countOf = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count, error } = await q;
  return error ? null : (count ?? 0);
};

export async function buildReportContext(
  service: SupabaseClient,
  input: {
    template: { id: string; title: string; kind: "pre_event" | "post_event"; published_at: string | null; campaign_id: string | null };
    questions: ExportQuestion[];
    closedAt: string;
    closeReason: string;
    passed: number;
    held: number;
    pre: { title: string; passed: number; matched: number } | null;
  },
): Promise<{ context: ReportContext; eventId: string | null }> {
  const { template } = input;

  const [rejected, campaignRes, eventRes] = await Promise.all([
    countOf(
      service
        .from("survey_responses")
        .select("id", { count: "exact", head: true })
        .eq("template_id", template.id)
        .eq("quality_status", "reject"),
    ),
    template.campaign_id
      ? service
          .from("campaigns")
          .select(`${CAMPAIGN_COLUMNS}, brands(brand_name)`)
          .eq("id", template.campaign_id)
          .maybeSingle<Campaign & { categories?: string[] | null; brands: { brand_name: string } | null }>()
      : Promise.resolve({ data: null }),
    template.campaign_id
      ? service
          .from("sponsored_events")
          .select(
            "id, reference, name, event_date, start_time, timezone, venue_details, location, venue_address, status, cancelled_at, created_at, event_listings(category, capacity, audience_description, venue_name, city)",
          )
          .eq("campaign_id", template.campaign_id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const campaign = campaignRes.data ?? null;
  const events = (eventRes.data ?? []) as unknown as (EventRow & { cancelled_at: string | null })[];
  // The event the survey belongs to: the live/completed one, else the latest.
  const ev = events.find((e) => ["confirmed", "completed"].includes(e.status)) ?? events[0] ?? null;

  let packageName: string | null = null;
  if (campaign?.campaign_package_id) {
    const { data } = await service
      .from("campaign_packages")
      .select("name")
      .eq("id", campaign.campaign_package_id)
      .maybeSingle<{ name: string }>();
    packageName = data?.name ?? null;
  }

  let registered: number | null = null;
  let checkedIn: number | null = null;
  let codesIssued: number | null = null;
  let codesRedeemed: number | null = null;
  if (ev) {
    [registered, checkedIn, codesIssued, codesRedeemed] = await Promise.all([
      countOf(
        service
          .from("participations")
          .select("id", { count: "exact", head: true })
          .eq("sponsored_event_id", ev.id)
          .neq("status", "rejected"),
      ),
      countOf(
        service
          .from("participations")
          .select("id", { count: "exact", head: true })
          .eq("sponsored_event_id", ev.id)
          .not("attendance_verified_at", "is", null),
      ),
      countOf(
        service
          .from("reward_codes")
          .select("id", { count: "exact", head: true })
          .eq("sponsored_event_id", ev.id)
          .neq("status", "void"),
      ),
      countOf(
        service
          .from("reward_codes")
          .select("id", { count: "exact", head: true })
          .eq("sponsored_event_id", ev.id)
          .eq("status", "redeemed"),
      ),
    ]);
  }

  const packageValue = campaign?.budget_gbp != null ? Number(campaign.budget_gbp) : null;
  const target = campaign?.package_participant_count ?? null;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const measurement: ReportMeasurement = {
    registered,
    checked_in: checkedIn,
    attendance_rate_pct: pct(checkedIn, registered),
    surveys_completed: input.passed,
    // Can pass 100 when people answered from the survey link without
    // registering for the event — capped so the tile never reads oddly.
    completion_rate_pct: registered ? Math.min(100, pct(input.passed, registered) ?? 0) : null,
    codes_issued: codesIssued,
    codes_redeemed: codesRedeemed,
    redemption_rate_pct: pct(codesRedeemed, codesIssued),
    participant_target: target,
    target_reached_pct: pct(input.passed, target),
    package_value_gbp: packageValue,
    cost_per_completed_survey_gbp: packageValue && input.passed ? round2(packageValue / input.passed) : null,
    cost_per_participant_gbp: packageValue && registered ? round2(packageValue / registered) : null,
  };

  const listing = ev?.event_listings ?? null;
  const context: ReportContext = {
    format: REPORT_FORMAT,
    generated_at: new Date().toISOString(),
    survey: {
      id: template.id,
      title: template.title,
      kind: template.kind,
      published_at: template.published_at,
      closed_at: input.closedAt,
      close_reason: input.closeReason,
      questions: input.questions.map((q, i) => ({
        no: `Q${i + 1}`,
        text: questionTitle(q) || QUESTION_TYPE_LABELS[q.type],
        type: q.type,
      })),
      responses: { passed: input.passed, held_for_review: input.held, rejected: rejected ?? 0 },
    },
    campaign: campaign
      ? {
          reference: campaign.reference,
          title: campaignTitle(campaign, campaign.reference),
          objectives: campaign.description?.slice(0, 2000) ?? null,
          expected_outcomes: campaign.expected_outcomes?.slice(0, 2000) ?? null,
          categories: (campaign.categories ?? (campaign.category ? [campaign.category] : [])).filter(Boolean) as string[],
          preferred_location: campaign.preferred_location ?? null,
          package: packageName,
          package_value_gbp: packageValue,
          participant_target: target,
        }
      : null,
    brand: campaign?.brands?.brand_name ? { name: campaign.brands.brand_name } : null,
    event: ev
      ? {
          reference: ev.reference,
          name: ev.name,
          date: ev.event_date,
          start_time: ev.start_time,
          timezone: ev.timezone,
          venue: ev.venue_address || ev.venue_details || listing?.venue_name || null,
          location: ev.location || listing?.city || null,
          category: listing?.category ?? null,
          capacity: listing?.capacity ?? null,
          audience_description: listing?.audience_description ?? null,
          status: ev.status,
        }
      : null,
    measurement,
    pre_survey: input.pre
      ? { title: input.pre.title, passed_responses: input.pre.passed, matched_questions: input.pre.matched }
      : null,
  };
  return { context, eventId: ev?.id ?? null };
}
