import type { Post } from "@/lib/blog";

export const post: Post = {
  slug: "real-estate-lead-follow-up-cadence",
  title: "The 7-Day Real Estate Lead Follow-Up Cadence for India",
  description: "A follow-up schedule combining WhatsApp and phone calls, so property leads hear from you at the right times without feeling chased.",
  category: "lead-management",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-24",
  updatedOn: "2026-10-27",
  blocks: [
    { kind: "h2", id: "why-one-call-fails", text: "Why one call is not enough" },
    {
      kind: "p",
      text: "In many brokerages, a lead gets one call. If nobody answers, the lead is marked unresponsive and forgotten. But buying a home is a big decision, and people are busy. A planned series of messages and calls over a week gives them several easy chances to reply.",
    },
    { kind: "h2", id: "the-7-day-cadence", text: "A 7-day follow-up schedule" },
    {
      kind: "list",
      ordered: true,
      items: [
        "Day 1, straight away: a WhatsApp welcome that names the project and asks one easy question, such as 2 BHK or 3 BHK.",
        "Day 1, within a few hours: a call from the assigned salesperson to understand what they need.",
        "Day 2: a short video or photos of the sample flat or construction progress.",
        "Day 3: information on home loan tie-ups and payment plans.",
        "Day 5: an invitation to visit at the weekend, with the location and parking details.",
        "Day 7: a last message asking whether to keep sending updates or pause until they are ready.",
      ],
    },
    { kind: "h2", id: "automating-cadence", text: "Automate the reminders, keep the calls personal" },
    {
      kind: "p",
      text: "Tracking callbacks in a spreadsheet means some get missed. Automate the WhatsApp nudges so they go out on time, and keep the phone calls with real people, who know the project and can answer questions.",
    },
    {
      kind: "callout",
      tone: "tip",
      text: "LeadOS sends your approved WhatsApp follow-up messages automatically if a lead goes quiet, and marks leads who ask for a call or visit so your team calls them first.",
    },
    { kind: "cta", text: "Automate your WhatsApp follow-ups with LeadOS. Try it free for 14 days." },
  ],
  related: ["lead-scoring-real-estate-india", "speed-to-lead-real-estate"],
};
