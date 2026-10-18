"use client";

import { useTransition } from "react";
import type { OrgRole } from "@/lib/auth";
import { changeRole } from "../actions";

export function RoleSelect({ slug, userId, role }: { slug: string; userId: string; role: OrgRole }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Role"
      defaultValue={role}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("slug", slug);
        fd.set("user_id", userId);
        fd.set("role", e.target.value);
        start(() => changeRole(fd));
      }}
      className="h-8 cursor-pointer rounded-md border border-border bg-surface px-2 text-xs text-fg disabled:opacity-50"
    >
      <option value="admin">Admin</option>
      <option value="manager">Manager</option>
      <option value="agent">Agent</option>
      <option value="viewer">Viewer</option>
    </select>
  );
}
