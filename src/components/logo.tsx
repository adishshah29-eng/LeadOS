/**
 * Brand mark: a taxi-meter tile. "auto" follows the theme's primary color;
 * "taxi" is always black with a yellow dot, for use on the yellow brand
 * surfaces, which stay yellow in dark mode.
 */
export function Logo({ className = "size-6", variant = "auto" }: { className?: string; variant?: "auto" | "taxi" }) {
  const tile = variant === "taxi" ? "fill-ink" : "fill-primary";
  const stroke = variant === "taxi" ? "stroke-ink-fg" : "stroke-primary-fg";
  const dot = variant === "taxi" ? "fill-taxi" : "fill-logo-dot";
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" className={tile} />
      <path d="M7 6.5v11h10" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={stroke} />
      <circle cx="15.5" cy="9.5" r="2" className={dot} />
    </svg>
  );
}
