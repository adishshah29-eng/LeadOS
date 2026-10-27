import type { Post } from "@/lib/blog";

export const post: Post = {
  slug: "lead-scoring-real-estate-india",
  title: "Lead Scoring for Indian Real Estate: A Practical Framework",
  description: "A simple way to sort property leads into hot, warm and cold, so your best callers spend their time on genuine buyers first.",
  category: "lead-management",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-24",
  updatedOn: "2026-10-27",
  blocks: [
    { kind: "h2", id: "why-scoring-matters", text: "The problem on a busy launch weekend" },
    {
      kind: "p",
      text: "A project launch or festive offer can bring in hundreds of leads in a few days. Without a way to sort them, callers work through the list in order, reaching casual browsers first while serious buyers wait for a call.",
    },
    {
      kind: "p",
      text: "Lead scoring sorts every lead into hot, warm or cold, so the most likely buyers are called first.",
    },
    { kind: "h2", id: "the-scoring-matrix", text: "Three things to score on" },
    {
      kind: "list",
      items: [
        "Budget fit: does their budget match the units you have?",
        "Timeline: are they buying soon for their own use, or browsing for later?",
        "Engagement: did they answer your first message and ask for a call or a visit?",
      ],
    },
    { kind: "h2", id: "routing-to-top-closers", text: "Send hot leads to your best people" },
    {
      kind: "p",
      text: "Hot leads should skip the general calling queue and go straight to an experienced salesperson, the same day. Speed matters: research in Harvard Business Review found that firms contacting leads within an hour were nearly 7× as likely to qualify them [1].",
    },
    {
      kind: "p",
      text: "Cold leads are not lost leads. Keep them warm with occasional, useful updates, such as construction progress or new offers, and score them again when they reply.",
    },
    {
      kind: "callout",
      tone: "tip",
      text: "In LeadOS, the WhatsApp bot scores each lead hot, warm or cold from their answers and marks hot leads for your team's attention.",
    },
    { kind: "cta", text: "Let LeadOS ask the questions and score every Meta lead for you. Try it free for 14 days." },
  ],
  sources: [
    { label: "Harvard Business Review: The Short Life of Online Sales Leads (2011)", url: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads" },
  ],
  related: ["speed-to-lead-real-estate", "cost-per-lead-meta-ads-real-estate-india"],
};
