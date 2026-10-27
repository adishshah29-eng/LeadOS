import type { Post } from "@/lib/blog";

export const post: Post = {
  slug: "speed-to-lead-real-estate",
  title: "Speed to Lead: Why the First 5 Minutes Decide Site Visits",
  description: "Why responding to real estate leads within 5 minutes increases conversion rates and how automated qualification works.",
  category: "lead-management",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-21",
  blocks: [
    {
      kind: "h2",
      id: "the-decay-curve",
      text: "The lead decay curve in real estate",
    },
    {
      kind: "p",
      text: "When a prospective homebuyer fills out a lead form on Instagram, they are actively looking at floor plans. After 30 minutes, they have scrolled on to other content. Immediate contact preserves buyer intent.",
    },
    {
      kind: "h2",
      id: "automation-vs-manual",
      text: "Automated qualification vs manual calling",
    },
    {
      kind: "p",
      text: "Sales agents cannot call every lead within sixty seconds, especially after hours. An automated WhatsApp welcome greets the buyer instantly, asks qualifying questions, and prepares the lead for human takeover.",
    },
    {
      kind: "h2",
      id: "action-plan",
      text: "Three steps to improve team response time",
    },
    {
      kind: "p",
      text: "Set up instant webhook ingestion, configure your WhatsApp welcome flow, and assign qualified leads immediately to available agents.",
    },
    {
      kind: "cta",
      text: "Automate your lead qualification in minutes with LeadOS.",
    },
  ],
  sources: [
    {
      label: "Lead Response Management Study",
      url: "https://www.leadresponsemanagement.org",
    },
  ],
  related: ["leados-vs-spreadsheets-and-whatsapp"],
};
