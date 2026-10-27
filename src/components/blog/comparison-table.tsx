import { BRAND } from "@/lib/brand";
import { formatDate, type Comparison } from "@/lib/blog";

export function ComparisonTable({ comparison }: { comparison: Comparison }) {
  return (
    <div className="my-8 space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[560px] text-left text-sm border-collapse">
          <caption className="sr-only">
            Comparison between {BRAND.name} and {comparison.competitor}
          </caption>
          <thead>
            <tr className="border-b border-border bg-surface-2/60 text-xs uppercase tracking-wider font-semibold text-fg-muted">
              <th scope="col" className="p-3.5 w-1/3">Feature</th>
              <th scope="col" className="p-3.5 w-1/3 text-primary">{BRAND.name}</th>
              <th scope="col" className="p-3.5 w-1/3">{comparison.competitor}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {comparison.rows.map((row) => (
              <tr key={row.feature} className="hover:bg-surface-2/30">
                <th scope="row" className="p-3.5 font-medium text-fg align-top">
                  {row.feature}
                </th>
                <td className="p-3.5 text-fg align-top">
                  {row.us}
                </td>
                <td className="p-3.5 text-fg-muted align-top space-y-1">
                  <div>{row.them}</div>
                  <div className="text-xs">
                    <a
                      href={row.source.url}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="text-primary/80 hover:underline hover:text-primary"
                    >
                      Source: {row.source.label} ↗
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 rounded-lg border border-border bg-surface-2/40 p-4 text-xs">
        <div>
          <span className="font-semibold text-fg">Best for {BRAND.name}: </span>
          <span className="text-fg-muted">{comparison.bestFor.us}</span>
        </div>
        <div>
          <span className="font-semibold text-fg">Best for {comparison.competitor}: </span>
          <span className="text-fg-muted">{comparison.bestFor.them}</span>
        </div>
      </div>

      <div className="text-xs text-fg-muted leading-relaxed border-t border-border pt-3">
        <p>
          {`${comparison.competitor} is a trademark of its owner. ${BRAND.name} is not affiliated with ${comparison.competitor}. Information checked on ${formatDate(comparison.checkedOn)} from their public website. Prices and features change; check their site for the latest. Spotted a mistake? Email us and we'll fix it.`}
        </p>
      </div>
    </div>
  );
}
