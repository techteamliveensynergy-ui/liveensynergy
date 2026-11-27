"use client";

import { useRef, useState } from "react";
import { richBlocksToHtml } from "@/lib/email/rich-text";
import { normaliseUrl } from "@/lib/urls";

/**
 * A text box for email wording with Bold and Link buttons. Select some words,
 * press Link, paste the address — the words become a hyperlink. Stored as plain
 * text ( [words](https://…) and **bold** ), rendered safely by rich-text.ts when
 * the email is built, so what the admin sees in the preview is what is sent.
 */
export function RichTextField({
  id,
  name,
  value,
  onChange,
  rows = 4,
  maxLength,
  placeholder,
  className = "textarea",
}: {
  id: string;
  name: string;
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [panel, setPanel] = useState<null | { start: number; end: number; label: string; url: string; button: boolean }>(null);
  const [problem, setProblem] = useState("");

  function selection() {
    const el = ref.current;
    return { start: el?.selectionStart ?? value.length, end: el?.selectionEnd ?? value.length };
  }

  function replaceRange(start: number, end: number, insert: string, selectFrom?: number, selectTo?: number) {
    const next = value.slice(0, start) + insert + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const a = selectFrom ?? start + insert.length;
      el.setSelectionRange(a, selectTo ?? a);
    });
  }

  function bold() {
    const { start, end } = selection();
    const picked = value.slice(start, end);
    if (picked) replaceRange(start, end, `**${picked}**`);
    else replaceRange(start, end, "****", start + 2, start + 2);
  }

  function italic() {
    const { start, end } = selection();
    const picked = value.slice(start, end);
    if (picked) replaceRange(start, end, `*${picked}*`);
    else replaceRange(start, end, "**", start + 1, start + 1);
  }

  /** Start of the line holding `pos`, and the end of the line holding `end`. */
  function lineRange(pos: number, end: number) {
    const from = value.lastIndexOf("\n", pos - 1) + 1;
    const nl = value.indexOf("\n", end);
    return { from, to: nl === -1 ? value.length : nl };
  }

  /** Heading / bullet: prefix every selected line (or toggle the prefix off again). */
  function prefixLines(prefix: string) {
    const { start, end } = selection();
    const { from, to } = lineRange(start, end);
    const lines = value.slice(from, to).split("\n");
    const allHave = lines.every((l) => l.startsWith(prefix));
    const next = lines.map((l) => (allHave ? l.slice(prefix.length) : l.startsWith(prefix) ? l : prefix + l)).join("\n");
    replaceRange(from, to, next);
  }

  function divider() {
    const { end } = selection();
    const { to } = lineRange(end, end);
    const before = value.slice(0, to);
    const lead = before.length === 0 || before.endsWith("\n") ? "" : "\n";
    replaceRange(to, to, `${lead}\n---\n`);
  }

  function openLink(button = false) {
    const { start, end } = selection();
    setProblem("");
    setPanel({ start, end, label: value.slice(start, end), url: "", button });
  }

  function insertLink() {
    if (!panel) return;
    const label = panel.label.replace(/[\][\n]/g, " ").trim();
    const raw = panel.url.trim();
    if (!label) return setProblem("Type the words people should click.");
    if (!raw) return setProblem("Paste the address the link should open.");
    // An email address becomes mailto:, mailto:/tel: stay as typed, a bare domain gets https://.
    let url: string;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) url = `mailto:${raw}`;
    else if (/^(mailto:|tel:)/i.test(raw)) url = raw;
    else {
      const n = normaliseUrl(raw);
      if (n.error || !n.url) return setProblem("That doesn't look like a web or email address. Try https://example.com");
      url = n.url;
    }
    url = url.replace(/\)/g, "%29");
    if (/\s/.test(url)) return setProblem("The address can't contain spaces.");
    if (panel.button) {
      // A button sits on a line of its own, with a blank line either side.
      const before = value.slice(0, panel.start);
      const after = value.slice(panel.end);
      const lead = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
      const tail = after.length === 0 || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
      replaceRange(panel.start, panel.end, `${lead}![${label}](${url})${tail}`);
    } else {
      replaceRange(panel.start, panel.end, `[${label}](${url})`);
    }
    setPanel(null);
  }

  const preview = richBlocksToHtml(value, {
    p: "margin:0 0 8px;",
    link: "color:#e8590c;text-decoration:underline;",
    buttonBg: "#e8590c",
    buttonFg: "#ffffff",
  });

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        {[
          { label: <strong>B</strong>, title: "Bold the selected words", run: bold },
          { label: <em>I</em>, title: "Italicise the selected words", run: italic },
          { label: "H", title: "Make the selected line a heading", run: () => prefixLines("## ") },
          { label: "• List", title: "Make the selected lines a bullet list", run: () => prefixLines("- ") },
          { label: "🔗 Link", title: "Turn the selected words into a link", run: () => openLink(false) },
          { label: "▭ Button", title: "Add a button that opens an address", run: () => openLink(true) },
          { label: "― Line", title: "Add a divider line", run: divider },
        ].map((t) => (
          <button key={t.title} type="button" onClick={t.run} title={t.title} className="btn btn-ghost !px-2.5 !py-1 text-sm">
            {t.label}
          </button>
        ))}
        <span className="text-xs text-[var(--color-ink-soft)]">Select the words first, then press a button.</span>
      </div>

      {panel && (
        <div className="mb-2 space-y-2 rounded-xl border border-black/10 bg-[var(--color-mist)] p-3">
          <label className="block text-sm">
            <span className="field-label">{panel.button ? "Button text" : "Words to show"}</span>
            <input
              className="input mt-1"
              value={panel.label}
              onChange={(e) => setPanel({ ...panel, label: e.target.value })}
              placeholder="e.g. our privacy policy"
            />
          </label>
          <label className="block text-sm">
            <span className="field-label">{panel.button ? "Where the button goes" : "Link address"}</span>
            <input
              className="input mt-1"
              value={panel.url}
              onChange={(e) => setPanel({ ...panel, url: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  insertLink();
                }
              }}
              placeholder="https://… or name@company.com"
              autoFocus
            />
          </label>
          {problem && <p className="text-xs text-[var(--color-accent)]">{problem}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={insertLink} className="btn btn-primary !py-1.5 text-sm">
              {panel.button ? "Add button" : "Add link"}
            </button>
            <button type="button" onClick={() => setPanel(null)} className="btn btn-ghost !py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      <textarea
        id={id}
        name={name}
        ref={ref}
        rows={rows}
        maxLength={maxLength}
        className={className}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {/* Built by rich-text.ts: escaped first, only links/bold become tags. */}
      {value.trim() && (
        <div
          className="mt-2 rounded-lg border border-dashed border-black/15 bg-white px-3 py-2 text-xs leading-relaxed text-[var(--color-ink-soft)]"
          dangerouslySetInnerHTML={{ __html: preview }}
        />
      )}
    </div>
  );
}
