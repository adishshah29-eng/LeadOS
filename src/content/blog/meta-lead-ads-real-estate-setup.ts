import type { Post } from "@/lib/blog";

export const post: Post = {
  slug: "meta-lead-ads-real-estate-setup",
  title: "How to Set Up Meta Lead Ads for Real Estate in India",
  description: "Step-by-step setup guide for real estate Facebook and Instagram lead forms. Learn custom questions, high-intent forms, targeting, and instant sync.",
  category: "real-estate-marketing",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-24",
  blocks: [
    {
      kind: "h2",
      id: "instant-forms-vs-landing-pages",
      text: "Meta instant forms vs external landing pages for property campaigns",
    },
    {
      kind: "p",
      text: "Real estate marketing teams often debate whether to direct ad traffic to an external landing page or use Meta Instant Forms (native lead generation ads). In Indian mobile environments, native instant forms load in milliseconds without external redirect delays, delivering 3x to 5x higher conversion rates compared to slow mobile websites.",
    },
    {
      kind: "p",
      text: "However, because Meta forms auto-populate user contact details from Facebook profiles, poorly configured forms can attract accidental submissions. Configuring the right form settings is essential to filtering out junk inquiries.",
    },
    {
      kind: "h2",
      id: "more-volume-vs-higher-intent",
      text: "Choosing Higher Intent over More Volume",
    },
    {
      kind: "p",
      text: "In Meta Ads Manager, always select the Higher Intent form type rather than More Volume. The Higher Intent setting adds a mandatory review step where users must swipe to confirm their phone number and answers before submitting. This single extra step eliminates accidental clicks by over 60%.",
    },
    {
      kind: "h2",
      id: "essential-custom-questions",
      text: "The 3 custom questions every real estate form must include",
    },
    {
      kind: "list",
      ordered: true,
      items: [
        "Apartment Configuration: Dropdown options (e.g., 2 BHK Elegance, 3 BHK Grand, 4 BHK Penthouse).",
        "Purchase Budget: Realistic price bands (e.g., ₹85 Lakh - ₹1.2 Cr, ₹1.2 Cr - ₹1.8 Cr, Above ₹1.8 Cr). Avoid open text fields.",
        "Possession Requirement: Pre-defined options (e.g., Ready to move in, Within 6 months, Under construction 2027+).",
      ],
    },
    {
      kind: "h2",
      id: "instant-crm-sync",
      text: "Connecting instant webhooks to avoid CSV download delays",
    },
    {
      kind: "p",
      text: "Never allow leads to sit in Ads Manager CSV export queues. Hook your Meta lead form directly to an automated real estate OS via real-time webhooks so your sales automation triggers within seconds of the user swiping submit.",
    },
    {
      kind: "cta",
      text: "Connect your Meta lead ad accounts to LeadOS in under 5 minutes with zero coding required.",
    },
  ],
  sources: [
    {
      label: "Meta Ads Guide for Real Estate Advertisers",
      url: "https://www.facebook.com/business/industries/real-estate",
    },
  ],
  related: ["cost-per-lead-meta-ads-real-estate-india", "speed-to-lead-real-estate"],
};
