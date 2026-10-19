/** Dashboard date ranges. Shared by server pages and the client filter, so it must not live in a "use client" file. */
export const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;
