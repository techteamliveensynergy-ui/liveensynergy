const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
  HeadingLevel, PageOrientation, AlignmentType, BorderStyle, LevelFormat, Footer, PageNumber,
  TableOfContents,
} = require("docx");
const sections = require("./data.js");
const decisions = require("./data.js").decisions;

const OUT = process.argv[2];
const FONT = "Arial";
const W = 15398; // landscape A4 width minus 0.5" margins
const COLS = [950, 2500, 3700, 3300, 3848, 1100];
const HEAD = ["ID", "Scenario", "Steps / setup", "Expected result", "Today (10 Oct)", "Result"];

const FILL = { OK: "E3F1E4", GAP: "FBE3E1", CHECK: "FFF4D6", DECIDE: "ECECEC" };
const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const borders = { top: border, bottom: border, left: border, right: border };

const kind = (t) => (t.startsWith("GAP") ? "GAP" : t.startsWith("CHECK") ? "CHECK" : t.startsWith("DECIDE") ? "DECIDE" : "OK");

function cell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: !!opts.bold, size: opts.size ?? 17, font: FONT, color: opts.color })],
      }),
    ],
  });
}

function scenarioTable(rows) {
  const header = new TableRow({
    tableHeader: true,
    children: HEAD.map((h, i) => cell(h, COLS[i], { bold: true, fill: "1F2A44", color: "FFFFFF" })),
  });
  const body = rows.map(
    (r) =>
      new TableRow({
        cantSplit: true,
        children: [
          cell(r[0], COLS[0], { bold: true }),
          cell(r[1], COLS[1], { bold: true }),
          cell(r[2], COLS[2]),
          cell(r[3], COLS[3]),
          cell(r[4], COLS[4], { fill: FILL[kind(r[4])] }),
          cell("", COLS[5]),
        ],
      }),
  );
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: COLS, rows: [header, ...body] });
}

const p = (text, o = {}) =>
  new Paragraph({ spacing: { after: 120 }, ...o.para, children: [new TextRun({ text, font: FONT, size: o.size ?? 21, bold: o.bold, color: o.color })] });
const bullet = (text) =>
  new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text, font: FONT, size: 21 })] });


function contentsTable() {
  const c = [7000, 2000, 2000, 2000, W - 13000];
  const hdr = ["Section", "Scenarios", "GAP", "CHECK", "DECIDE"];
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: c,
    rows: [
      new TableRow({ tableHeader: true, children: hdr.map((h, i) => cell(h, c[i], { bold: true, fill: "1F2A44", color: "FFFFFF", size: 19 })) }),
      ...sections.map((s) => {
        const n = (k) => String(s.rows.filter((r) => kind(r[4]) === k).length);
        return new TableRow({ children: [cell(s.title, c[0], { size: 19 }), cell(String(s.rows.length), c[1], { size: 19 }), cell(n("GAP"), c[2], { size: 19 }), cell(n("CHECK"), c[3], { size: 19 }), cell(n("DECIDE"), c[4], { size: 19 })] });
      }),
      new TableRow({ children: [cell("Appendix — rules to agree before testing", c[0], { size: 19 }), cell(String(decisions.length) + " topics", c[1], { size: 19 }), cell("", c[2]), cell("", c[3]), cell("", c[4])] }),
    ],
  });
}

// Counts
const all = sections.flatMap((s) => s.rows);
const count = (k) => all.filter((r) => kind(r[4]) === k).length;

const legendCols = [1800, W - 1800];
const legend = new Table({
  width: { size: W, type: WidthType.DXA },
  columnWidths: legendCols,
  rows: [
    ["OK", "The app does this today. Test to confirm nothing has regressed."],
    ["GAP", "The expected result will NOT happen today — this test should fail until it's fixed. Log it as a bug."],
    ["CHECK", "Not confirmed from the code — needs a manual run to find out."],
    ["DECIDE", "There's no agreed rule yet. Agree the policy (Appendix), then write the expected result."],
  ].map(
    ([k, t]) =>
      new TableRow({ children: [cell(k, legendCols[0], { bold: true, fill: FILL[k], size: 19 }), cell(t, legendCols[1], { size: 19 })] }),
  ),
});

const children = [
  new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: "Live·En·Synergy — Core Flow Test Scenarios", font: FONT })] }),
  p("Version 1 · 10 October 2026 · prepared for the pre-launch test round", { color: "555555" }),
  p(
    "The core flow: an artist lists an event with a date → a brand requests a campaign → admin creates the campaign and suggests relevant artists → the brand approves the order form and pays → the sponsorship is agreed and the campaign goes live → the audience registers, attends and completes surveys → discount codes are released → survey results and reports go out.",
  ),
  p(
    `This document lists ${all.length} scenarios across that flow, including the edge cases that happen in real life: late changes, deadlines, cancellations, payment problems, time zones, double clicks and people doing things in an unexpected order. Each row says what should happen and what the app does today, from a read of the code and the production database on 10 October 2026.`,
  ),
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Fix before launch — confirmed security holes", font: FONT })] }),
  bullet("Any signed-in user can make themselves an admin (SEC-01), and sign-up accepts 'admin' as a role (SEC-02). Blocked users can unblock themselves (SEC-03)."),
  bullet("Audience members can mark themselves selected or checked in (SEC-04 / REG-16). Brands and artists can edit or delete a sponsorship directly (SEC-05)."),
  bullet("An old database function lets anyone — even signed out — close any campaign (SEC-06)."),
  p("These are not test-and-log items: they should be fixed first, then re-tested.", { bold: true }),
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "How to read the tables", font: FONT })] }),
  legend,
  p(""),
  p(`Totals: ${count("OK")} OK · ${count("GAP")} GAP · ${count("CHECK")} CHECK · ${count("DECIDE")} DECIDE.`, { bold: true }),
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Practical tips for testers", font: FONT })] }),
  bullet("Use plus-addressed emails for extra accounts: you+brand1@gmail.com, you+aud1@gmail.com … Each needs its email confirmed."),
  bullet("Each audience account needs a different phone number (one person, one audience account). Use the UK drama range 07700 900000–900999 — never a real person."),
  bullet("Pay with Stripe test cards only while Payments are in Test mode: 4242 4242 4242 4242 (success), 4000 0000 0000 0002 (declined)."),
  bullet("Record Pass / Fail in the Result column, with a screenshot for every Fail (WhatsApp or the shared Google Sheet), quoting the scenario ID."),
  bullet("Run section 1 first with fresh accounts — later sections reuse what it creates."),
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Contents", font: FONT })] }),
  contentsTable(),
];

for (const s of sections) {
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: s.title, font: FONT })] }));
  if (s.intro) children.push(p(s.intro, { color: "444444" }));
  children.push(scenarioTable(s.rows));
}

const dCols = [600, 3600, W - 4200];
children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: "Appendix — rules to agree before testing", font: FONT })] }));
children.push(
  p(
    "These questions decide the expected result of the DECIDE rows (time limits, edit windows, cancellation and refunds). The app has no rule for most of them today, so agreeing them is the first step; each answer becomes a test.",
  ),
);
children.push(
  new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: dCols,
    rows: [
      new TableRow({ tableHeader: true, children: ["#", "Topic", "Question / suggestion"].map((h, i) => cell(h, dCols[i], { bold: true, fill: "1F2A44", color: "FFFFFF" })) }),
      ...decisions.map(
        (d, i) => new TableRow({ cantSplit: true, children: [cell(String(i + 1), dCols[0], { bold: true }), cell(d[0], dCols[1], { bold: true }), cell(d[1], dCols[2])] }),
      ),
    ],
  }),
);

const doc = new Document({
  creator: "Live·En·Synergy",
  title: "Core Flow Test Scenarios",
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal", run: { size: 40, bold: true, font: FONT, color: "1F2A44" }, paragraph: { spacing: { after: 120 } } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, font: FONT, color: "1F2A44" }, paragraph: { spacing: { before: 120, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 25, bold: true, font: FONT, color: "C2410C" }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [new TextRun({ text: "Core flow test scenarios · page ", size: 16, font: FONT, color: "777777" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, font: FONT, color: "777777" })],
            }),
          ],
        }),
      },
      children,
    },
  ],
});

Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(OUT, b);
  console.log("wrote", OUT, all.length, "rows", { OK: count("OK"), GAP: count("GAP"), CHECK: count("CHECK"), DECIDE: count("DECIDE") });
});
