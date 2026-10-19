/** Product name in one place: change it here when the startup name is final. */
export const BRAND = {
  name: "LeadOS",
  tagline: "Meta ads, leads and WhatsApp follow-up in one place.",
} as const;

/**
 * Shown on /privacy, /terms and /data-deletion. Fill these in before going
 * live: Meta App Review and India's DPDP Act need a real legal entity and a
 * contact who answers. Have a lawyer read the pages before launch.
 */
export const LEGAL = {
  entity: "[Company legal name]",
  address: "[Registered address, India]",
  email: "[privacy@your-domain]",
  grievanceOfficer: "[Name of grievance officer]",
  jurisdiction: "[City], India",
  updated: "19 October 2026",
} as const;

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/data-deletion", label: "Data deletion" },
] as const;
