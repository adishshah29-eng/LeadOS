"use client";

import { useRouter } from "next/navigation";

type Org = { slug: string; name: string };

/** Switch between the organizations this user belongs to. */
export function OrgSwitcher({ current, orgs }: { current: string; orgs: Org[] }) {
  const router = useRouter();
  return (
    <div>
      <label htmlFor="org-switcher" className="sr-only">
        Organization
      </label>
      <select
        id="org-switcher"
        value={current}
        onChange={(e) => router.push(e.target.value === "__new" ? "/onboarding" : `/o/${e.target.value}`)}
        className="h-9 w-full cursor-pointer rounded-md border border-border bg-surface-2 px-2 text-sm text-fg"
      >
        {orgs.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.name}
          </option>
        ))}
        <option value="__new">+ New organization</option>
      </select>
    </div>
  );
}
