import "server-only";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { AnalysisFigures, ColumnFigures } from "./figures";
import type { AnalysisNarrative } from "./narrative";
import { measurementTiles, type CampaignReportMeta } from "./campaign-report";

const cell = (text: string, bold = false) =>
  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold })] })] });

/** Cover, Measurement and before/after — the code-computed part (0127). */
function campaignBlocks(meta: CampaignReportMeta): { cover: (Paragraph | Table)[]; measurement: (Paragraph | Table)[] } {
  const cv = meta.cover;
  const cover = (
    [
      ["Brand", cv.brand],
      ["Campaign", cv.campaign && `${cv.campaign}${cv.campaign_reference ? ` (${cv.campaign_reference})` : ""}`],
      ["Event", cv.event && `${cv.event}${cv.event_date ? ` · ${cv.event_date}` : ""}`],
      ["Venue", cv.venue],
      ["Survey", `${cv.survey_title} (${cv.survey_kind === "pre_event" ? "pre-event" : "post-event"})`],
    ] as const
  )
    .filter(([, v]) => v)
    .map(([k, v]) => new Paragraph({ children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun(String(v))] }));

  const measurement: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Measurement")] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [cell("Measure", true), cell("Result", true), cell("Notes", true)] }),
        ...measurementTiles(meta.measurement).map(
          (t) => new TableRow({ children: [cell(t.label), cell(t.value), cell(t.hint ?? "")] }),
        ),
      ],
    }),
    new Paragraph({ text: "" }),
  ];
  const c = meta.comparison;
  if (c && c.items.length > 0) {
    measurement.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Before and after the event")] }),
      new Paragraph({
        children: [
          new TextRun({
            text: `The same questions in “${c.pre_title}” (${c.pre_responses} responses) and this survey (${c.post_responses} responses). Two groups of respondents, not the same people tracked over time.`,
            italics: true,
          }),
        ],
        spacing: { after: 120 },
      }),
    );
    for (const item of c.items) {
      measurement.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(item.question)] }));
      if (item.kind === "number") {
        measurement.push(new Paragraph({ children: [new TextRun(`Average before ${item.pre_mean} · after ${item.post_mean}`)] }));
      } else {
        measurement.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({ children: [cell("Answer", true), cell("Before", true), cell("After", true), cell("Change", true)] }),
              ...(item.rows ?? []).map(
                (r) =>
                  new TableRow({
                    children: [
                      cell(r.label),
                      cell(`${r.pre_pct}%`),
                      cell(`${r.post_pct}%`),
                      cell(`${r.change_pp > 0 ? "+" : ""}${r.change_pp} pts`),
                    ],
                  }),
              ),
            ],
          }),
        );
      }
      measurement.push(new Paragraph({ text: "" }));
    }
  }
  return { cover, measurement };
}

/**
 * A playground report as a Word document, for editing in Word or — uploaded
 * to Google Drive — in Google Docs. Charts become tables of the same figures
 * (count, %), so nothing in the document depends on an image.
 */

const para = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => new Paragraph({ children: [new TextRun(p)], spacing: { after: 160 } }));

function figureBlock(c: ColumnFigures): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(c.name)] }),
    new Paragraph({
      children: [new TextRun({ text: `${c.answered} answered`, italics: true, size: 18 })],
      spacing: { after: 80 },
    }),
  ];
  if (c.kind === "number") {
    out.push(
      new Paragraph({
        children: [
          new TextRun(`Average ${c.mean ?? "—"} · median ${c.median ?? "—"} · lowest ${c.min ?? "—"} · highest ${c.max ?? "—"}`),
        ],
        spacing: { after: 80 },
      }),
    );
  }
  if (c.counts?.length) {
    out.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [cell("Answer", true), cell("Count", true), cell("%", true)] }),
          ...c.counts.map(
            (r) =>
              new TableRow({
                children: [cell(r.label), cell(r.masked ? "<5" : String(r.count)), cell(r.masked ? "" : `${r.pct}%`)],
              }),
          ),
        ],
      }),
    );
  }
  if (c.kind === "text" && c.samples?.length) {
    for (const s of c.samples.slice(0, 6)) {
      out.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: `“${s}”`, italics: true })] }));
    }
  }
  out.push(new Paragraph({ text: "" }));
  return out;
}

export async function reportDocx(report: {
  title: string;
  subtitle: string;
  figures: AnalysisFigures;
  narrative: AnalysisNarrative | null;
}): Promise<Buffer> {
  const byId = new Map(report.figures.columns.map((c) => [c.id, c]));
  const n = report.narrative;
  const meta = report.figures.report?.format ? report.figures.report : null;
  const blocks = meta ? campaignBlocks(meta) : null;
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(report.title)] }),
    new Paragraph({ children: [new TextRun({ text: report.subtitle, italics: true })], spacing: { after: 120 } }),
    ...(blocks?.cover ?? []),
    new Paragraph({ text: "", spacing: { after: 120 } }),
  ];

  if (n) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(n.headline)] }));
    children.push(...para(n.summary));
    if (blocks) children.push(...blocks.measurement);
    for (const s of n.sections) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(s.heading)] }));
      children.push(...para(s.body));
      for (const id of s.charts) {
        const c = byId.get(id);
        if (c) children.push(...figureBlock(c));
      }
    }
    if (n.recommendations.length) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Recommendations")] }));
      for (const r of n.recommendations) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(r)] }));
    }
    if (n.caveats.length) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("About the data")] }));
      for (const r of n.caveats) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(r)] }));
    }
  }

  if (!n && blocks) {
    children.push(...blocks.measurement);
    if (meta && meta.notes.length) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("About the data")] }));
      for (const r of meta.notes) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(r)] }));
    }
  }

  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(n ? "Appendix: all figures" : "Figures")] }),
  );
  for (const c of report.figures.columns) children.push(...figureBlock(c));

  const doc = new Document({
    creator: "Live·En·Synergy",
    title: report.title,
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
