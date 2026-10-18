export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" className="fill-primary" />
      <path d="M7 6.5v11h10" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="stroke-primary-fg" />
      <circle cx="15.5" cy="9.5" r="2" className="fill-logo-dot" />
    </svg>
  );
}
