import type { ReactNode } from "react";

export function Callout({
  tone = "note",
  children,
}: {
  tone?: "tip" | "note" | "warning";
  children: ReactNode;
}) {
  const styles = {
    tip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200",
    note: "border-blue-500/30 bg-blue-500/10 text-blue-950 dark:text-blue-200",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200",
  }[tone];

  const label = {
    tip: "Tip",
    note: "Note",
    warning: "Warning",
  }[tone];

  return (
    <aside className={`my-6 rounded-lg border p-4 text-sm ${styles}`}>
      <div className="font-semibold mb-1 uppercase tracking-wider text-xs">{label}</div>
      <div className="leading-relaxed">{children}</div>
    </aside>
  );
}
