import { TriangleAlert, Trophy } from "lucide-react";
import { flagRow, type PerfRow } from "@/lib/performance";
import { formatINR, formatNum } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type BreakdownRow = PerfRow & {
  entity_id: string;
  name: string;
  parent_name: string | null;
  impressions: number;
  clicks: number;
  active_days: number;
};

/** Spend vs leads per campaign or ad, with waste/best flags (text + icon, never color alone). */
export function PerformanceTable({ rows, entity, limit = 15 }: { rows: BreakdownRow[]; entity: string; limit?: number }) {
  const shown = rows.slice(0, limit);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-surface-2 text-left text-xs font-medium text-fg-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5">{entity}</th>
            <th scope="col" className="px-4 py-2.5 text-right">Spend</th>
            <th scope="col" className="px-4 py-2.5 text-right">Leads</th>
            <th scope="col" className="px-4 py-2.5 text-right">Cost per lead</th>
            <th scope="col" className="px-4 py-2.5 text-right">CTR</th>
            <th scope="col" className="px-4 py-2.5"><span className="sr-only">Flag</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {shown.map((r) => {
            const flag = flagRow(r, rows);
            const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : null;
            return (
              <tr key={r.entity_id} className={flag === "waste" ? "bg-danger-soft/40" : undefined}>
                <td className="max-w-80 px-4 py-2.5">
                  <p className="truncate font-medium" title={r.name}>{r.name}</p>
                  {r.parent_name ? <p className="truncate text-xs text-fg-subtle" title={r.parent_name}>{r.parent_name}</p> : null}
                </td>
                <td className="tabular px-4 py-2.5 text-right">{formatINR(r.spend)}</td>
                <td className="tabular px-4 py-2.5 text-right">{formatNum(r.results)}</td>
                <td className="tabular px-4 py-2.5 text-right">{r.results > 0 ? formatINR(r.spend / r.results) : "—"}</td>
                <td className="tabular px-4 py-2.5 text-right text-fg-muted">{ctr === null ? "—" : `${ctr.toFixed(2)}%`}</td>
                <td className="px-4 py-2.5">
                  {flag === "waste" ? (
                    <Badge tone="danger"><TriangleAlert className="size-3" aria-hidden /> Wasting</Badge>
                  ) : flag === "best" ? (
                    <Badge tone="success"><Trophy className="size-3" aria-hidden /> Best</Badge>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > limit ? <p className="px-4 py-2 text-xs text-fg-subtle">Showing the top {limit} of {rows.length} by spend.</p> : null}
    </div>
  );
}
