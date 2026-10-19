import { Inngest } from "inngest";

/**
 * Inngest client. Locally it talks to the Inngest dev server
 * (`npm run inngest:dev`, with INNGEST_DEV=1); in production it needs
 * INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY.
 */
export const inngest = new Inngest({ id: "leados" });

/** Event names in one place, so senders and functions can't drift apart. */
export const EV = {
  adsSync: "meta/ads.sync",
  leadsSync: "meta/leads.sync",
  leadReceived: "meta/lead.received",
  pageSubscribe: "meta/page.subscribe",
  waLeadStart: "wa/lead.start",
  waInbound: "wa/message.received",
  waManual: "wa/send.manual",
  waLink: "wa/waba.link",
} as const;
