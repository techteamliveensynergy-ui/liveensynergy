import "server-only";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runSurveyReportWorker } from "./worker";

/**
 * Run the survey report worker after the response (0127), so a report starts
 * within seconds of an admin closing a campaign, archiving a survey or
 * pressing "Generate report now" — the 15-minute cron is the safety net.
 */
export function kickSurveyReports() {
  after(async () => {
    const service = createServiceClient();
    if (!service) return;
    try {
      await runSurveyReportWorker(service, 280_000);
    } catch (err) {
      console.error("[survey-reports] kick failed", err);
    }
  });
}
