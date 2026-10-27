import type { Post } from "@/lib/blog";

export const post: Post = {
  slug: "speed-to-lead-real-estate",
  title: "Speed to Lead: Why the First Hour Decides Real Estate Deals",
  description: "What research says about how fast to answer a new lead, and how real estate teams can reply in minutes, even after hours.",
  category: "lead-management",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-21",
  updatedOn: "2026-10-27",
  blocks: [
    { kind: "h2", id: "the-research", text: "What the research found" },
    {
      kind: "p",
      text: "In a 2011 study published in Harvard Business Review, researchers sent web enquiries to 2,241 US companies. Only 37% replied within an hour, and 23% never replied at all [1].",
    },
    {
      kind: "p",
      text: "A companion analysis of more than a million leads found that firms which tried to contact a lead within an hour were nearly 7× as likely to qualify it as firms that waited even an hour longer, and more than 60× as likely as firms that waited a day or more [1].",
    },
    { kind: "h2", id: "why-real-estate", text: "Why this matters for property leads" },
    {
      kind: "p",
      text: "Someone who fills in a lead form on Instagram is thinking about your project right then. A few hours later they have seen other ads and may not remember yours. The sooner the first reply arrives, the more likely they are to engage.",
    },
    { kind: "h2", id: "automation-vs-manual", text: "Automated first reply, human follow-up" },
    {
      kind: "p",
      text: "Sales agents cannot call every lead within minutes, especially at night and on weekends. An automated WhatsApp welcome can greet every lead immediately and ask a few qualifying questions, so the agent who calls later already knows the buyer's budget and timeline.",
    },
    { kind: "h2", id: "action-plan", text: "Three steps to faster replies" },
    {
      kind: "list",
      ordered: true,
      items: [
        "Get leads out of Ads Manager automatically, instead of downloading files once a day.",
        "Send an automatic WhatsApp welcome with two or three easy questions.",
        "Give each lead to a named person, and check every day for leads nobody has called.",
      ],
    },
    { kind: "cta", text: "LeadOS greets every Meta lead on WhatsApp as it arrives. Try it free for 14 days." },
  ],
  sources: [
    { label: "Harvard Business Review: The Short Life of Online Sales Leads (2011)", url: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads" },
  ],
  related: ["leados-vs-spreadsheets-and-whatsapp", "real-estate-lead-follow-up-cadence"],
};
