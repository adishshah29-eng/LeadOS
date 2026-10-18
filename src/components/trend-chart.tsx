import { formatINR } from "@/lib/utils";

/**
 * Small server-rendered bar chart: no chart library, no client JS.
 * Each bar has a <title> so the exact value is available on hover and to
 * screen readers.
 */
export function TrendChart({ points }: { points: { date: string; value: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const w = 100 / points.length;
  return (
    <figure>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="Daily spend, last 30 days">
        {points.map((p, i) => {
          const h = (p.value / max) * 38;
          return (
            <rect key={p.date} x={i * w + w * 0.15} y={40 - h} width={w * 0.7} height={h} rx={0.4} className="fill-fg/75 hover:fill-fg">
              <title>{`${p.date}: ${formatINR(p.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex justify-between text-xs text-fg-subtle">
        <span>{points[0]?.date}</span>
        <span>Peak {formatINR(max)}</span>
        <span>{points.at(-1)?.date}</span>
      </figcaption>
    </figure>
  );
}
