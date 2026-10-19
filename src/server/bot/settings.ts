/**
 * Per-workspace bot settings: the qualifying questions (stored as JSON in
 * bot_settings.questions), template names and fixed replies.
 *
 * Questions with special meaning keep fixed ids so the flow logic can rely
 * on them, whatever the workspace renames their text to:
 *   next_step (options visit / call / details), call_time (asked even when
 *   the lead skipped the other questions), config.
 *
 * WhatsApp limits: reply buttons max 3 (title ≤ 20 chars); list rows max 10
 * (title ≤ 24, description ≤ 72).
 */

export type QuestionOption = { id: string; title: string; description?: string; synonyms?: string[]; points?: number };

export type Question = {
  id: string;
  label: string;
  prompt: string;
  kind: "buttons" | "list";
  listButton?: string;
  options: QuestionOption[];
  /** Only ask when an earlier answer is one of these option ids. */
  showIf?: { question: string; in: string[] };
};

export type Templates = { welcome: string; nudge: string; followup: string; language: string };

export type BotSettings = {
  enabled: boolean;
  enabledAt: string | null;
  businessName: string;
  questions: Question[];
  templates: Templates;
  knowledge: string;
};

export type Answers = Record<string, string | boolean | undefined> & { shortcut?: boolean };

/** Starting questions for a new workspace (real-estate defaults, editable in Settings → WhatsApp). */
export const DEFAULT_QUESTIONS: Question[] = [
  {
    id: "config",
    label: "Configuration",
    prompt: "Which configuration are you looking for?",
    kind: "list",
    listButton: "Choose option",
    options: [
      { id: "1bhk", title: "1 BHK", synonyms: ["1bhk", "1 bhk", "one bhk", "1 bed"] },
      { id: "2bhk", title: "2 BHK", synonyms: ["2bhk", "2 bhk", "two bhk", "2 bed"] },
      { id: "3bhk", title: "3 BHK", synonyms: ["3bhk", "3 bhk", "three bhk", "3 bed"] },
      { id: "4bhk", title: "4 BHK", synonyms: ["4bhk", "4 bhk", "four bhk", "4 bed"] },
      { id: "5bhk", title: "5 BHK+ / Penthouse", synonyms: ["5bhk", "5 bhk", "penthouse", "duplex"] },
      { id: "undecided", title: "Not decided yet", synonyms: ["not decided", "not sure", "undecided", "any"] },
    ],
  },
  {
    id: "budget",
    label: "Budget",
    prompt: "What budget range are you considering?",
    kind: "list",
    listButton: "Choose budget",
    options: [
      { id: "lt2", title: "Under ₹2 Cr", points: 1 },
      { id: "2to5", title: "₹2 – 5 Cr", points: 1 },
      { id: "5to10", title: "₹5 – 10 Cr", points: 1 },
      { id: "10to20", title: "₹10 – 20 Cr", points: 1 },
      { id: "gt20", title: "Above ₹20 Cr", points: 1 },
      { id: "na", title: "Prefer not to say", synonyms: ["prefer not to say", "not now", "later"] },
    ],
  },
  {
    id: "purpose",
    label: "Purpose",
    prompt: "Is this for your own use or as an investment?",
    kind: "buttons",
    options: [
      { id: "own", title: "Own use", synonyms: ["own use", "self use", "self", "to live", "end use", "personal"] },
      { id: "invest", title: "Investment", synonyms: ["investment", "invest", "rental", "returns"] },
      { id: "both", title: "Both", synonyms: ["both"] },
    ],
  },
  {
    id: "timeline",
    label: "Timeline",
    prompt: "When are you planning to buy?",
    kind: "list",
    listButton: "Choose timeline",
    options: [
      { id: "now", title: "Immediately", synonyms: ["immediately", "asap", "right now", "urgent"], points: 3 },
      { id: "3m", title: "Within 3 months", synonyms: ["within 3 months", "3 months", "1 month", "2 months"], points: 3 },
      { id: "6m", title: "3 – 6 months", synonyms: ["3-6 months", "6 months", "4 months", "5 months"], points: 2 },
      { id: "later", title: "After 6 months", synonyms: ["after 6 months", "next year", "1 year"], points: 1 },
      { id: "exploring", title: "Just exploring", synonyms: ["just exploring", "exploring", "just looking", "browsing"] },
    ],
  },
  {
    id: "next_step",
    label: "Next step",
    prompt: "How would you like to proceed?",
    kind: "buttons",
    options: [
      { id: "visit", title: "Book site visit", synonyms: ["site visit", "visit", "see the property", "book visit"], points: 3 },
      { id: "call", title: "Call me", synonyms: ["call me", "call", "phone me", "talk"], points: 2 },
      { id: "details", title: "Send details", synonyms: ["send details", "details", "brochure", "share details"] },
    ],
  },
  {
    id: "call_time",
    label: "Best time to call",
    prompt: "What is the best time for our advisor to reach you?",
    kind: "buttons",
    options: [
      { id: "morning", title: "Morning (9–12)", synonyms: ["morning"] },
      { id: "afternoon", title: "Afternoon (12–4)", synonyms: ["afternoon", "lunch"] },
      { id: "evening", title: "Evening (4–8)", synonyms: ["evening", "night"] },
    ],
    showIf: { question: "next_step", in: ["call", "visit"] },
  },
];

export const DEFAULT_TEMPLATES: Templates = { welcome: "lead_welcome", nudge: "lead_nudge", followup: "lead_followup", language: "en" };

/** Builds settings from a bot_settings row (or defaults when there is none yet). */
export function settingsFromRow(row: Record<string, unknown> | null | undefined, orgName: string): BotSettings {
  const questions = Array.isArray(row?.questions) && (row!.questions as unknown[]).length ? (row!.questions as Question[]) : DEFAULT_QUESTIONS;
  const t = (row?.templates ?? {}) as Partial<Templates>;
  return {
    enabled: row?.enabled === true,
    enabledAt: (row?.enabled_at as string | null) ?? null,
    businessName: String(row?.business_name || orgName),
    questions,
    templates: { ...DEFAULT_TEMPLATES, ...t },
    knowledge: String(row?.knowledge ?? ""),
  };
}

/** Follow-up schedule, sent with approved templates. */
export const FOLLOWUPS = {
  /** Lead never replied or stopped mid-way: hours after their last activity. */
  nudge: [24, 72].map((h) => h * 3_600_000),
  /** Lead finished the questions: days after they finished. */
  nurture: [3, 7, 15, 30].map((d) => d * 86_400_000),
  /** Stop after this many follow-ups in a row get no reply. */
  maxUnanswered: 3,
};

/** Template quick-reply buttons arrive as their text. Match these (case-insensitive). */
export const TEMPLATE_BUTTONS: Record<string, "start" | "call" | "visit" | "not_interested"> = {
  "yes, let's start": "start",
  "yes, lets start": "start",
  yes: "start",
  "yes, continue": "start",
  "share options": "start",
  "call me instead": "call",
  "request a call": "call",
  "call me": "call",
  "book site visit": "visit",
  "site visit": "visit",
  "not interested": "not_interested",
};

export const MAX_OFF_TOPIC = 3;
export const LLM_CALLS_PER_LEAD_PER_DAY = 15;
/** AI calls per workspace per day (cost control on the platform's AI key). */
export const LLM_CALLS_PER_ORG_PER_DAY = 500;

export const OPT_OUT_WORDS = new Set(["stop", "unsubscribe", "stop messages", "dont message", "don't message", "remove me", "block"]);
export const OPT_IN_WORDS = new Set(["start", "subscribe", "unstop"]);
export const NOT_INTERESTED_WORDS = ["not interested", "no thanks", "no thank you", "not looking", "already bought"];
export const SMALLTALK_WORDS = new Set([
  "hi", "hello", "hey", "hii", "hiii", "ok", "okay", "k", "thanks", "thank you", "thx", "ty", "great", "sure",
  "fine", "good", "👍", "🙏", "namaste", "good morning", "good evening", "done", "noted",
]);

const firstName = (name?: string | null) => (name || "").trim().split(/\s+/)[0] || "";

/** Fixed replies. The AI never writes these, so they can't be manipulated. */
export function texts(business: string) {
  return {
    directWelcome: (name?: string | null) =>
      `Hello${firstName(name) ? ` ${firstName(name)}` : ""}, welcome to ${business} 🙏\n\nI'm the virtual assistant. A few quick taps and our advisor will share the options that suit you best.`,
    startQuestions: "Wonderful! Just a few quick questions. Please tap an option below 👇",
    tapOption: "Please tap one of the options below 👇",
    offTopic: `I'm the ${business} assistant, so I can only help with your property enquiry 🙂`,
    offTopicFinal: "I can only help with property enquiries. Our advisor will get in touch with you personally.",
    media: "Sorry, I can only read text and button taps for now.",
    handoffQuestion: "Good question! I've passed it to our property advisor, who will answer you personally.",
    smalltalkDone: "Thank you! Our advisor will be in touch with you shortly 🙏",
    updated: "Noted, I've updated that for you ✅",
    notInterested: (name?: string | null) =>
      `Thank you for letting us know${firstName(name) ? `, ${firstName(name)}` : ""}. If your plans change, just send us a message here 🙏`,
    optedOut: "You've been unsubscribed and won't receive further messages from us. Reply START anytime to reconnect.",
    optedIn: "Welcome back! 🙏",
  };
}
