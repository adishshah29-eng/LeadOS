/** Small pure helpers for the platform admin console. */

// Control characters, zero-width and text-direction marks (they can hide or reverse text).
const INVISIBLE = /[\p{Cc}​-‏‪-‮⁠-⁤﻿]/gu;

/**
 * The reason a super admin types before opening a customer's workspace:
 * invisible characters removed, spaces folded, 3–300 characters (counted as
 * characters, like the database) with at least 3 letters or digits.
 */
export function supportReason(raw: string): { ok: true; reason: string } | { ok: false } {
  const reason = raw.replace(INVISIBLE, "").replace(/\s+/gu, " ").trim();
  const length = [...reason].length;
  const meaningful = (reason.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return length >= 3 && length <= 300 && meaningful >= 3 ? { ok: true, reason } : { ok: false };
}

/** How long something has been waiting, in plain words. */
export function ageText(seconds: number) {
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}

/** Whole minutes left in a support view, rounded up; at least 1 while it's shown. */
export const minutesLeft = (expiresAt: string, now = Date.now()) => Math.max(1, Math.ceil((Date.parse(expiresAt) - now) / 60_000));

/** Error text for platform staff: first line, long digit runs (phones, ids) masked, at most 200 characters. */
export function maskError(text: string | null | undefined) {
  if (text == null) return null;
  return text.split("\n")[0].replace(/\d{7,}/g, "•••").slice(0, 200);
}
