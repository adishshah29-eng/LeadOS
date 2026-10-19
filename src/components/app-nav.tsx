"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FolderKanban, Inbox, LayoutDashboard, Menu, MessageCircle, Settings, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = { overview: LayoutDashboard, leads: Inbox, conversations: MessageCircle, projects: FolderKanban, team: Users, settings: Settings };
export type NavItem = { key: keyof typeof ICONS; label: string; href: string };

function Links({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-0.5">
      {items.map(({ key, label, href }) => {
        const Icon = ICONS[key];
        // Overview is the org root, so it's only active on an exact match.
        const active = key === "overview" ? pathname === href : pathname.startsWith(href);
        return (
          <li key={key}>
            <Link
              href={href}
              onClick={onNavigate}
              data-tour={key}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
                active ? "bg-highlight-soft font-medium text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function SideNav({ items }: { items: NavItem[] }) {
  return (
    <nav aria-label="Main">
      <Links items={items} />
    </nav>
  );
}

/** Phone-width navigation: a full-height drawer behind a menu button. */
export function MobileNav({ items, header, footer }: { items: NavItem[]; header: React.ReactNode; footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 lg:hidden"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Menu className="size-5" aria-hidden />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 border-r border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              {header}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md text-fg-muted hover:bg-surface-2"
                aria-label="Close menu"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="Main" className="flex-1">
              <Links items={items} onNavigate={() => setOpen(false)} />
            </nav>
            {footer}
          </div>
        </div>
      ) : null}
    </>
  );
}
