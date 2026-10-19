/**
 * Help-center guides, as data so pages, the setup checklist and settings can
 * link to them by slug. Meta changes its menus often: when a step drifts,
 * fix it here once.
 */
export type GuideSection = {
  heading: string;
  body?: string;
  steps?: string[];
  items?: string[];
  /** Ready-to-copy text, shown in a monospace block. */
  sample?: string;
};

export type Guide = {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  sections: GuideSection[];
};

export const GUIDES: Guide[] = [
  {
    slug: "connect-meta",
    title: "Connect Meta ads and lead forms",
    summary: "Give LeadOS read access to your ad accounts and lead forms with a System User token.",
    minutes: 10,
    sections: [
      {
        heading: "Before you start",
        items: [
          "You need to be an admin of your business portfolio in Meta Business Suite (business.facebook.com).",
          "Meta only lets a business create tokens for a Meta app it owns. If you've never made one, create a free \"Business\" app at developers.facebook.com first, or book a setup call and we'll do it with you.",
          "Do this on a computer. Meta's business settings are hard to use on a phone.",
        ],
      },
      {
        heading: "1. Create a system user",
        steps: [
          "Open business.facebook.com/settings.",
          "In the left menu, open Users → System users, then click Add.",
          "Name it LeadOS, set the role to Admin, and create it.",
        ],
      },
      {
        heading: "2. Give it your ad accounts and Pages",
        steps: [
          "With the system user selected, click Assign assets.",
          "Under Ad accounts, tick the accounts you advertise from and allow View performance (Manage campaigns is not needed).",
          "Under Pages, tick the Facebook Pages that run your lead forms and turn on full control. This is what lets LeadOS read leads.",
          "If your business uses Integrations → Leads access, add the system user there too, for each Page.",
        ],
      },
      {
        heading: "3. Generate the token",
        steps: [
          "Back on the system user, click Generate new token.",
          "Choose your app, and set Token expiration to Never.",
          "Tick these permissions: ads_read, leads_retrieval, pages_show_list, pages_read_engagement, pages_manage_metadata and business_management.",
          "Click Generate and copy the token. Meta shows it only once; keep the tab open until it's saved in LeadOS.",
        ],
      },
      {
        heading: "4. Paste it into LeadOS",
        steps: [
          "In LeadOS, open Settings → Meta ads & lead forms, paste the token and click Connect. It's checked with Meta and stored encrypted; nobody can see it again.",
          "Tick the ad accounts to track, pick the project each belongs to, and tick the Pages whose leads you want.",
          "Click Save. The first sync brings in the last 30 days and takes a few minutes. After that, numbers refresh every hour and new leads arrive within the hour, usually much sooner.",
        ],
      },
      {
        heading: "If something goes wrong",
        items: [
          "\"Meta rejected this token\": it was copied incompletely, has expired, or was revoked. Generate a new one.",
          "\"This token can't see any ad accounts\": repeat step 2; the ad accounts weren't assigned to the system user.",
          "A Page says \"Not subscribed\": the system user needs full control of that Page (step 2).",
          "Numbers differ slightly from Ads Manager: check the date range and that every ad account is ticked. LeadOS uses the same attribution setting as Ads Manager and re-checks the last few days on every sync.",
        ],
      },
    ],
  },
  {
    slug: "connect-whatsapp",
    title: "Connect WhatsApp",
    summary: "Let LeadOS welcome and qualify every new lead from your own WhatsApp Business number.",
    minutes: 15,
    sections: [
      {
        heading: "Before you start",
        items: [
          "You need a number on the WhatsApp Business Platform (the Cloud API) in your Meta business portfolio. If your number is only in the WhatsApp Business app on a phone, ask us how to connect it.",
          "WhatsApp's own conversation fees are billed by Meta to your WhatsApp Business account.",
          "Connect Meta ads first; you can reuse the same system user.",
        ],
      },
      {
        heading: "1. Give the system user your WhatsApp account",
        steps: [
          "Open business.facebook.com/settings → Users → System users and select your LeadOS system user.",
          "Click Assign assets → WhatsApp accounts, tick your WhatsApp Business Account and turn on full control.",
        ],
      },
      {
        heading: "2. Generate a token",
        steps: [
          "Click Generate new token, choose your app, and set expiration to Never.",
          "Tick whatsapp_business_messaging, whatsapp_business_management and business_management.",
          "Generate and copy it.",
        ],
      },
      {
        heading: "3. Find your Phone number ID",
        steps: [
          "Open WhatsApp Manager (business.facebook.com/wa/manage) → Phone numbers.",
          "Click your number. Copy the Phone number ID: a long number, not the phone number itself.",
        ],
      },
      {
        heading: "4. Connect in LeadOS",
        steps: [
          "Open Settings → WhatsApp, paste the Phone number ID and the token, and click Connect number.",
          "LeadOS links your WhatsApp account automatically. Look for \"Receiving replies\" at the top. If it says \"Not receiving replies yet\", follow the fix shown there and click Check again.",
        ],
      },
      {
        heading: "5. Get your messages ready",
        steps: [
          "Create the three message templates and wait for Meta to approve them (see the templates guide).",
          "Under What the bot knows, write the facts it may share: projects, locations, prices, possession dates. It never invents a number that isn't written there.",
          "Review the qualifying questions, then tick Message new leads automatically and save. Only leads that arrive after this are messaged.",
        ],
      },
      {
        heading: "Good to know",
        items: [
          "WhatsApp lets a business message someone first only with an approved template. After the lead replies, the bot can chat freely for 24 hours.",
          "Anyone who replies STOP is never messaged again unless they write START.",
          "Pause the bot on any conversation from the WhatsApp inbox to reply yourself.",
        ],
      },
    ],
  },
  {
    slug: "whatsapp-templates",
    title: "WhatsApp message templates",
    summary: "The three templates the bot uses to start a chat and follow up, ready to copy.",
    minutes: 10,
    sections: [
      {
        heading: "Why templates",
        body: "WhatsApp only lets a business start a conversation, or write after 24 hours of silence, with a message Meta has approved in advance. LeadOS uses three: a welcome, a nudge if there's no reply, and a later follow-up.",
      },
      {
        heading: "How to create one",
        steps: [
          "Open WhatsApp Manager → Message templates → Create template.",
          "Category: Marketing. Language: English (or the language your leads use; set the same code in LeadOS).",
          "Name it exactly as below, paste the body, and add sample values for {{1}} (a first name) and {{2}} (a project name).",
          "For the welcome, add three Quick reply buttons. Submit. Approval usually takes minutes, sometimes up to a day.",
        ],
      },
      {
        heading: "lead_welcome",
        sample:
          "Hi {{1}}, thanks for your interest in {{2}}! I'm the assistant here. Can I ask 3 quick questions so our team can share the right options?\n\nButtons: Yes, let's start · Call me · Not interested",
      },
      { heading: "lead_nudge", sample: "Hi {{1}}, just checking in about {{2}}. Shall we pick up where we left off? It takes under a minute." },
      { heading: "lead_followup", sample: "Hi {{1}}, there's an update on {{2}} you may like. Reply here if you'd like details or a site visit." },
      {
        heading: "Then in LeadOS",
        body: "Settings → WhatsApp → Message templates already uses these names. Change them there only if you named yours differently.",
      },
    ],
  },
  {
    slug: "roles",
    title: "Team roles",
    summary: "Who can see and do what, so everyone gets exactly the access they need.",
    minutes: 3,
    sections: [
      {
        heading: "Roles",
        items: [
          "Owner: everything, including billing and deleting the workspace. One per workspace.",
          "Admin: connections, team, bot settings and every project.",
          "Manager: dashboards and leads for the projects you give them; can assign leads.",
          "Agent: only the leads assigned to them: call, WhatsApp, notes, status.",
          "Viewer: a read-only dashboard for chosen projects, with no phone numbers. Good for clients.",
        ],
      },
      {
        heading: "Inviting someone",
        steps: [
          "Open Team, enter their email and pick a role.",
          "Copy the invite link and send it to them. It works once and expires in 7 days.",
          "For managers and viewers, open Projects and tick which projects they can see.",
        ],
      },
      {
        heading: "Sharing with a client without an account",
        body: "Settings → Client report links creates a read-only link to a project's dashboard that expires on its own. It never shows lead names or numbers.",
      },
    ],
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);

export const FAQ: { q: string; a: string }[] = [
  {
    q: "What do I need to get started?",
    a: "A Meta business portfolio that runs your ads, and admin access to it. WhatsApp is optional and needs a WhatsApp Business Platform number.",
  },
  {
    q: "Is my data safe?",
    a: "Each workspace's data is isolated in the database, access tokens are stored encrypted, team members only see what their role allows, and two-factor sign-in is available.",
  },
  {
    q: "Will the WhatsApp bot message my old leads?",
    a: "No. It only messages leads that arrive after you switch it on, within 24 hours of their enquiry, and never anyone who replied STOP.",
  },
  {
    q: "Do the numbers match Ads Manager?",
    a: "Yes. LeadOS uses the same attribution setting as Ads Manager and re-checks recent days on every sync, so late conversions are counted.",
  },
  {
    q: "What happens when the free trial ends?",
    a: "The workspace pauses until you pick a plan. Leads keep being collected while it's paused, and you can still download them, so nothing is lost.",
  },
  {
    q: "Can you set it up for me?",
    a: "Yes. Book a free setup call and we'll connect Meta and WhatsApp with you.",
  },
];
