import type { FeedbackKind } from "@/lib/types";

/**
 * Mirrors an in-product feedback report to a GitHub issue, so beta-tester
 * reports land in the same backlog as everything else (3 Aug standup).
 *
 * Configuration is optional and entirely env-driven:
 *   GITHUB_FEEDBACK_REPO   e.g. "sigmaticai/live-en-synergy"
 *   GITHUB_TOKEN           a fine-grained PAT with issues:write on that repo
 *   GITHUB_FEEDBACK_LABELS optional, comma separated (default "feedback")
 *
 * With either of the first two missing this is a no-op: the report is already
 * saved to `feedback_reports` and visible in the admin inbox, so a missing
 * token degrades the mirror, never the report. For the same reason nothing
 * here throws — the caller gets null and carries on.
 */

export interface FeedbackIssueInput {
  reference: string;
  kind: FeedbackKind;
  subject: string;
  body: string;
  pageUrl?: string | null;
  reporterName?: string | null;
}

export interface FeedbackIssue {
  url: string;
  number: number;
}

const KIND_LABELS: Record<FeedbackKind, string> = {
  bug: "bug",
  idea: "enhancement",
  improvement: "enhancement",
  text_change: "copy",
};

export function githubFeedbackConfigured() {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_FEEDBACK_REPO);
}

export async function createFeedbackIssue(
  input: FeedbackIssueInput,
): Promise<FeedbackIssue | null> {
  const repo = process.env.GITHUB_FEEDBACK_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return null;

  const labels = [
    ...(process.env.GITHUB_FEEDBACK_LABELS ?? "feedback")
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean),
    KIND_LABELS[input.kind],
  ];

  // Deliberately no screenshot: those live in the private bucket because they
  // routinely contain other people's personal data, and a GitHub issue is the
  // wrong place for it. The admin inbox has the image against the reference.
  const body = [
    input.body,
    "",
    "---",
    `**Reference:** ${input.reference}`,
    `**Type:** ${input.kind.replace(/_/g, " ")}`,
    input.reporterName ? `**Reported by:** ${input.reporterName}` : null,
    input.pageUrl ? `**Page:** ${input.pageUrl}` : null,
    "",
    "_Raised automatically from the in-app feedback widget._",
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `[${input.reference}] ${input.subject}`,
        body,
        labels: Array.from(new Set(labels)),
      }),
    });

    if (!res.ok) {
      console.error(
        "[github] issue creation failed",
        res.status,
        await res.text().catch(() => ""),
      );
      return null;
    }

    const issue = (await res.json()) as { html_url?: string; number?: number };
    if (!issue.html_url || issue.number == null) return null;
    return { url: issue.html_url, number: issue.number };
  } catch (err) {
    console.error("[github] issue creation threw", err);
    return null;
  }
}
