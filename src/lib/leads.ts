import type { Tone } from "@/components/ui/badge";

export const LEAD_STATUSES = ["new", "contacted", "site_visit", "negotiation", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_META: Record<LeadStatus, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "highlight" },
  contacted: { label: "Contacted", tone: "neutral" },
  site_visit: { label: "Site visit", tone: "warning" },
  negotiation: { label: "Negotiation", tone: "warning" },
  won: { label: "Won", tone: "success" },
  lost: { label: "Lost", tone: "danger" },
};

export const SCORE_META: Record<"hot" | "warm" | "cold", { label: string; tone: Tone }> = {
  hot: { label: "Hot", tone: "danger" },
  warm: { label: "Warm", tone: "warning" },
  cold: { label: "Cold", tone: "neutral" },
};

/** Normalises an Indian/international number to E.164, or returns null. */
export function toE164(input: string, defaultCountry = "91"): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let d = digits.startsWith("+") ? digits.slice(1) : digits.replace(/^0+/, "");
  if (!digits.startsWith("+") && d.length === 10) d = defaultCountry + d;
  return /^[1-9]\d{6,14}$/.test(d) ? `+${d}` : null;
}

/** Keyset cursor over (lead_created_at desc, id desc). */
export function encodeCursor(ts: string, id: string) {
  return Buffer.from(`${ts}|${id}`).toString("base64url");
}

export function decodeCursor(c: string | undefined): { ts: string; id: string } | null {
  if (!c) return null;
  try {
    const [ts, id] = Buffer.from(c, "base64url").toString().split("|");
    if (!ts || !id || Number.isNaN(Date.parse(ts))) return null;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return { ts, id };
  } catch {
    return null;
  }
}

/** Strips characters that have meaning in PostgREST filter strings. */
export function cleanSearch(q: string | undefined): string {
  return (q ?? "").replace(/[,()"'\\%*:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
