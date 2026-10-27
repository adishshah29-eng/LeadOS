import type { Post } from "@/lib/blog";

export const post: Post = {
  slug: "real-estate-lead-follow-up-cadence",
  title: "The 7-Day Real Estate Lead Follow-Up Cadence for India",
  description: "A multi-touch follow-up schedule combining WhatsApp, phone calls, and site visit reminders. Double your conversion rates without burning out agents.",
  category: "lead-management",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-24",
  blocks: [
    {
      kind: "h2",
      id: "why-one-call-fails",
      text: "Why single-call outreach loses 80% of real estate deals",
    },
    {
      kind: "p",
      text: "The standard practice in many Indian real estate brokerages is to call a lead once. If the prospect does not pick up or asks to call back later, the lead is often abandoned or marked as unresponsive. In reality, purchasing a property worth ₹50 Lakh to ₹5 Crore is an emotionally significant decision requiring multiple structured touchpoints over several days.",
    },
    {
      kind: "p",
      text: "Implementing a systematic 7-day multi-channel cadence ensures prospects receive relevant project details at times convenient to them, without aggressive or spammy sales tactics.",
    },
    {
      kind: "h2",
      id: "the-7-day-cadence",
      text: "The ideal 7-day multi-channel follow-up schedule",
    },
    {
      kind: "list",
      ordered: true,
      items: [
        "Day 1 (Within 2 Minutes): Automated WhatsApp greeting with official RERA-registered project brochure, floor plans, and a quick question on preferred configuration (2 BHK or 3 BHK).",
        "Day 1 (Within 2 Hours): Intro call from assigned sales specialist confirming specific unit preferences and offering an invitation for a model flat tour.",
        "Day 2: WhatsApp video walkthrough showing actual construction progress and sample apartment finishes.",
        "Day 3: Afternoon check-in text sharing bank approval tie-ups (SBI, HDFC, ICICI) and special flexible payment milestone plans.",
        "Day 5: Weekend site visit invitation with convenient GPS directions, parking details, and cab reimbursement policy.",
        "Day 7: Final check-in asking if they would like to review alternative floor plans or pause updates until their purchase timeline begins.",
      ],
    },
    {
      kind: "h2",
      id: "automating-cadence",
      text: "Automating the cadence with intelligent lead status tracking",
    },
    {
      kind: "p",
      text: "When follow-up is tracked manually on spreadsheets, sales agents inevitably lose track of scheduled callbacks. A specialized system automatically advances leads through each cadence step, alerting agents when a customer replies or views a brochure.",
    },
    {
      kind: "cta",
      text: "Never let another qualified lead slip through the cracks. Automate your follow-up cadence with LeadOS.",
    },
  ],
  sources: [
    {
      label: "InsideSales Lead Response Management Benchmark",
      url: "https://www.insidesales.com/research",
    },
  ],
  related: ["lead-scoring-real-estate-india", "speed-to-lead-real-estate"],
};
