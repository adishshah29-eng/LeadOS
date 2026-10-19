"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { RANGES } from "@/lib/ranges";


const selectCls =
  "h-9 cursor-pointer rounded-md border border-border-strong bg-surface px-2 text-sm text-fg focus:border-fg focus:outline-none focus:ring-3 focus:ring-highlight/70";

/** Range and project pickers. They live in the URL, so a view can be bookmarked or shared. */
export function DashboardFilters({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  return (
    <div className={cn("flex flex-wrap gap-2 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
      <label htmlFor="range" className="sr-only">Date range</label>
      <select id="range" className={selectCls} value={params.get("range") ?? "30"} onChange={(e) => set("range", e.target.value)}>
        {RANGES.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <label htmlFor="project" className="sr-only">Project</label>
      <select id="project" className={selectCls} value={params.get("project") ?? ""} onChange={(e) => set("project", e.target.value)}>
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}
