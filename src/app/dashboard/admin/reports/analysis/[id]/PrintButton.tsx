"use client";

/** "Download PDF" = the browser's print dialog with "Save as PDF"; the print
 *  styles in globals.css leave only the report on the page. */
export function PrintButton() {
  return (
    <button type="button" className="btn btn-primary text-sm" onClick={() => window.print()}>
      Download PDF
    </button>
  );
}
