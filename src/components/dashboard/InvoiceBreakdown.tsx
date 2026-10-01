import { formatGbp } from "@/lib/billing";
import type { InvoiceLine } from "@/lib/types";

/**
 * The itemised lines and VAT totals of an invoice — shared by the admin
 * invoice page and the brand's read-only view so both show the same numbers.
 * A manual invoice (typed amount, no lines) shows just its total.
 */
export function InvoiceBreakdown({
  lines,
  subtotalGbp,
  vatGbp,
  totalGbp,
}: {
  lines: InvoiceLine[] | null;
  subtotalGbp: number | null;
  vatGbp: number | null;
  totalGbp: number;
}) {
  if (!lines?.length) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm">
        <span className="font-semibold">Total</span>
        <span className="font-semibold">{formatGbp(totalGbp)}</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left text-xs text-[var(--color-ink-soft)]">
            <th className="py-2 pr-3 font-semibold">Description</th>
            <th className="px-3 py-2 text-right font-semibold">Amount</th>
            <th className="px-3 py-2 text-right font-semibold">VAT</th>
            <th className="py-2 pl-3 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-black/5 align-top">
              <td className="py-2.5 pr-3">{l.description}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatGbp(l.net_gbp)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-ink-soft)]">
                {l.vat_rate > 0
                  ? `${formatGbp(l.vat_gbp)} (${Math.round(l.vat_rate * 100)}%)`
                  : "No VAT"}
              </td>
              <td className="py-2.5 pl-3 text-right tabular-nums">
                {formatGbp(l.total_gbp)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="text-sm">
          {subtotalGbp != null && (
            <tr>
              <td colSpan={3} className="pt-3 text-right text-[var(--color-ink-soft)]">
                Subtotal (excluding VAT)
              </td>
              <td className="pt-3 pl-3 text-right tabular-nums">
                {formatGbp(subtotalGbp)}
              </td>
            </tr>
          )}
          {vatGbp != null && (
            <tr>
              <td colSpan={3} className="text-right text-[var(--color-ink-soft)]">
                VAT
              </td>
              <td className="pl-3 text-right tabular-nums">{formatGbp(vatGbp)}</td>
            </tr>
          )}
          <tr>
            <td colSpan={3} className="pt-1 text-right font-semibold">
              Total payable
            </td>
            <td className="pt-1 pl-3 text-right font-semibold tabular-nums">
              {formatGbp(totalGbp)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
