import type { Post } from "@/lib/blog";

export const post: Post = {
  slug: "site-visit-conversion-real-estate-india",
  title: "How to Increase Site Visit Conversion in Indian Real Estate",
  description: "Turn more property leads into site visits that actually happen, with clear confirmations, timely reminders and easier travel.",
  category: "real-estate-marketing",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-24",
  updatedOn: "2026-10-27",
  blocks: [
    { kind: "h2", id: "the-site-visit-bottleneck", text: "The site visit is where deals are won" },
    {
      kind: "p",
      text: "Few people buy a home without seeing it. Most of the work of digital marketing and calling is about getting a serious buyer to the sample flat. Yet many booked visits never happen, often because a verbal confirmation on the phone is easy to forget.",
    },
    { kind: "h2", id: "reducing-no-shows-whatsapp", text: "Confirm and remind on WhatsApp" },
    {
      kind: "p",
      text: "A simple three-message sequence helps:",
    },
    {
      kind: "list",
      ordered: true,
      items: [
        "When the visit is booked: date, time, the salesperson's name and number, and the project's RERA registration number.",
        "The day before: a short reminder with parking details and what they will see.",
        "A couple of hours before: the map location and an easy way to say they are on their way or need to reschedule.",
      ],
    },
    { kind: "h2", id: "frictionless-travel-coordination", text: "Make getting there easy" },
    {
      kind: "p",
      text: "In busy cities, weekend travel puts people off. Consider offering a pickup or a cab for serious buyers, and always send clear directions and parking information.",
    },
    { kind: "cta", text: "LeadOS asks every Meta lead whether they want a visit and marks those leads for your team. Try it free for 14 days." },
  ],
  related: ["real-estate-lead-follow-up-cadence", "meta-lead-ads-real-estate-setup"],
};
