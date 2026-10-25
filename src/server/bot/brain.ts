/**
 * The WhatsApp lead bot's decision-making, as a pure function.
 *
 *   processMessage(conversation, inbound message, settings) → { patch, out }
 *
 * It sends nothing and saves nothing: the runner (runner.ts) does that with
 * the result. That keeps every conversation path unit-testable without
 * WhatsApp. Ported from meta-crm's engine; the order of checks is the same:
 * button taps, keywords and option matching first, the injection/off-topic
 * pre-screen next, and the AI last, which may only pick a fixed intent or
 * option id, and whose free-text answers are checked against the facts.
 */

import {
  FOLLOWUPS,
  LLM_CALLS_PER_LEAD_PER_DAY,
  MAX_OFF_TOPIC,
  NOT_INTERESTED_WORDS,
  OPT_IN_WORDS,
  OPT_OUT_WORDS,
  SMALLTALK_WORDS,
  TEMPLATE_BUTTONS,
  texts,
  type Answers,
  type BotSettings,
  type Question,
} from "./settings.ts";
import { checkReply, preScreen, sanitizeInput } from "./guard.ts";

const DAY = 86_400_000;

export type ConvState =
  | "awaiting_start"
  | "in_progress"
  | "completed"
  | "not_interested"
  | "opted_out"
  | "no_response"
  | "undeliverable"
  | "failed"
  | "duplicate";

export type Conversation = {
  id: string;
  name: string | null;
  state: ConvState;
  answers: Answers;
  score: "hot" | "warm" | "cold" | null;
  lead_questions: string | null;
  bot_paused: boolean;
  off_topic_count: number;
  llm_calls_date: string | null;
  llm_calls_count: number;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  completed_at: string | null;
  started_at: string;
  followup_track: "nudge" | "nurture" | null;
  followup_stage: number;
  next_followup_at: string | null;
  unanswered_followups: number;
};

export type ConvPatch = Partial<Omit<Conversation, "id">> & {
  summary?: string;
  needs_attention?: boolean;
  attention_reason?: string | null;
  last_message?: string;
};

export type Inbound = {
  messageId: string;
  type: string; // text | button | interactive | image | audio | …
  text?: string;
  buttonText?: string;
  replyId?: string;
  replyTitle?: string;
};

export type Outbound =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: { id: string; title: string }[] }
  | { kind: "list"; body: string; button: string; rows: { id: string; title: string; description?: string }[] };

/** What to add to the lead's timeline in the CRM. */
export type TimelineNote = { text: string };

export type Effects = { patch: ConvPatch; out: Outbound[]; notes: TimelineNote[] };

export type Classification = { intent: Intent; option: string | null; reply: string | null };
export type Classifier = (q: Question | null, text: string, facts: string) => Promise<{ intent: string; option_id?: string | null; answered?: boolean; reply?: string } | null>;

export const INTENTS = ["answer", "question", "call_request", "visit_request", "not_interested", "smalltalk", "off_topic", "unclear"] as const;
type Intent = (typeof INTENTS)[number];

// ------------------------------------------------------------ question flow

export function findQuestion(s: BotSettings, id: string) {
  return s.questions.find((q) => q.id === id);
}

export function optionTitle(s: BotSettings, questionId: string, optionId: unknown): string {
  if (typeof optionId !== "string") return "";
  return findQuestion(s, questionId)?.options.find((o) => o.id === optionId)?.title ?? "";
}

/** The next question to ask, or null when everything needed is answered. */
export function nextQuestion(s: BotSettings, a: Answers): Question | null {
  for (const q of s.questions) {
    if (a.shortcut && q.id !== "call_time") continue;
    if (q.showIf && !q.showIf.in.includes(String(a[q.showIf.question] ?? ""))) continue;
    if (!a[q.id]) return q;
  }
  return null;
}

/** Hot / warm / cold from option points, plus "asked for a call or visit". */
export function scoreLead(s: BotSettings, a: Answers): "hot" | "warm" | "cold" {
  let points = 0;
  for (const q of s.questions) {
    const v = a[q.id];
    if (typeof v === "string") points += q.options.find((o) => o.id === v)?.points ?? 0;
  }
  if (points >= 5) return "hot";
  if (points >= 3 || a.next_step === "call" || a.next_step === "visit") return "warm";
  return "cold";
}

export function summarize(s: BotSettings, a: Answers): string {
  const parts = s.questions.map((q) => optionTitle(s, q.id, a[q.id])).filter(Boolean);
  if (a.shortcut && !a.config) parts.push("(skipped questions)");
  return parts.join(" · ");
}

function completedText(s: BotSettings, name: string | null, a: Answers) {
  const first = (name || "").trim().split(/\s+/)[0];
  const who = first ? `, ${first}` : "";
  const time = optionTitle(s, "call_time", a.call_time).replace(/\s*\(.*\)/, "").toLowerCase();
  const when = time ? ` in the ${time}` : " shortly";
  let next = `Our advisor will reach out${when} with the best options for you.`;
  if (a.next_step === "visit") next = `Our advisor will call you${when} to schedule your site visit.`;
  else if (a.next_step === "call") next = `Our advisor will call you${when}.`;
  else if (a.next_step === "details") next = "Our advisor will share the details with you here shortly.";
  return `Thank you${who}! 🙏 ${next}\n\nMeanwhile, feel free to ask any question here.`;
}

function ask(q: Question, preface?: string): Outbound {
  const body = preface ? `${preface}\n\n${q.prompt}` : q.prompt;
  const opts = q.options.map((o) => ({ id: `a:${q.id}:${o.id}`, title: o.title, description: o.description }));
  return q.kind === "buttons" && opts.length <= 3
    ? { kind: "buttons", body, buttons: opts.map(({ id, title }) => ({ id, title })) }
    : { kind: "list", body, button: q.listButton || "Choose option", rows: opts };
}

// ------------------------------------------------------------ understanding

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[.!?,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const EMOJI_ONLY = /^[\p{Extended_Pictographic}‍️\s]+$/u;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Typed text → one option of a question, or null when none or ambiguous. */
export function matchOption(q: Question, text: string): string | null {
  const hits = new Set<string>();
  for (const o of q.options) {
    for (const cand of [o.title, ...(o.synonyms ?? [])].map(norm)) {
      if (!cand) continue;
      if (text === cand || (cand.length >= 3 && new RegExp(`(^|\\W)${escapeRe(cand)}(\\W|$)`).test(text))) hits.add(o.id);
    }
  }
  return hits.size === 1 ? [...hits][0] : null;
}

type Action =
  | { kind: "answer"; qid: string; oid: string }
  | { kind: "start" }
  | { kind: "shortcut"; step: "call" | "visit" }
  | { kind: "not_interested" }
  | { kind: "opt_out" }
  | { kind: "smalltalk" }
  | { kind: "question"; text: string; reply: string | null }
  | { kind: "off_topic" }
  | { kind: "unclear" }
  | { kind: "media" };

type Ctx = { settings: BotSettings; now: Date; today: string; classify?: Classifier; aiBudgetLeft: boolean };

async function decide(c: Conversation, m: Inbound, text: string, P: ConvPatch, ctx: Ctx): Promise<Action> {
  const s = ctx.settings;
  if (m.type === "button") {
    const mapped = TEMPLATE_BUTTONS[norm(m.buttonText ?? "")];
    if (mapped === "start") return { kind: "start" };
    if (mapped === "call" || mapped === "visit") return { kind: "shortcut", step: mapped };
    if (mapped === "not_interested") return { kind: "not_interested" };
    text = sanitizeInput(m.buttonText ?? "");
  }
  if (m.type === "interactive") {
    const [tag, qid, oid] = (m.replyId ?? "").split(":");
    const q = tag === "a" ? findQuestion(s, qid) : undefined;
    if (q && q.options.some((o) => o.id === oid)) return { kind: "answer", qid, oid };
    return { kind: "unclear" };
  }
  if (!text) return { kind: "media" };

  const n = norm(text);
  if (OPT_OUT_WORDS.has(n)) return { kind: "opt_out" };
  if (NOT_INTERESTED_WORDS.some((w) => n.includes(w))) return { kind: "not_interested" };

  const q = c.state === "completed" ? null : nextQuestion(s, c.answers ?? {});
  if (q) {
    const oid = matchOption(q, n);
    if (oid) return { kind: "answer", qid: q.id, oid };
  }
  if (/\b(call me|call back|callback|give me a call|talk to (a |an )?(person|human|agent|someone|advisor)|speak to)\b/.test(n)) {
    return { kind: "shortcut", step: "call" };
  }
  if (/\b(site visit|visit the (site|property|project)|book a visit)\b/.test(n)) return { kind: "shortcut", step: "visit" };
  if (SMALLTALK_WORDS.has(n) || OPT_IN_WORDS.has(n) || EMOJI_ONLY.test(n)) return { kind: "smalltalk" };
  if (preScreen(text) === "off_topic") return { kind: "off_topic" };

  // AI, within the per-lead and per-workspace daily budgets.
  const used = c.llm_calls_date === ctx.today ? c.llm_calls_count : 0;
  if (!ctx.classify || !ctx.aiBudgetLeft || used >= LLM_CALLS_PER_LEAD_PER_DAY) {
    return q ? { kind: "unclear" } : { kind: "question", text, reply: null };
  }
  P.llm_calls_date = ctx.today;
  P.llm_calls_count = used + 1;

  const raw = await ctx.classify(q, text, s.knowledge).catch(() => null);
  if (!raw) return q ? { kind: "unclear" } : { kind: "question", text, reply: null };
  const intent: Intent = (INTENTS as readonly string[]).includes(String(raw.intent)) ? (raw.intent as Intent) : "unclear";
  const option = q?.options.find((o) => o.id === raw.option_id)?.id ?? null;
  const reply = raw.answered === true && typeof raw.reply === "string" ? checkReply(raw.reply, s.knowledge) : null;

  switch (intent) {
    case "answer":
      return q && option ? { kind: "answer", qid: q.id, oid: option } : { kind: "unclear" };
    case "question":
      return { kind: "question", text, reply };
    case "call_request":
      return { kind: "shortcut", step: "call" };
    case "visit_request":
      return { kind: "shortcut", step: "visit" };
    case "not_interested":
      return { kind: "not_interested" };
    case "smalltalk":
      return { kind: "smalltalk" };
    case "off_topic":
      return { kind: "off_topic" };
    default:
      return { kind: "unclear" };
  }
}

function scheduleAfterReply(c: Conversation, P: ConvPatch, now: number) {
  const state = P.state ?? c.state;
  if (state === "in_progress" || state === "awaiting_start") {
    P.followup_track = "nudge";
    P.followup_stage = 0;
    P.next_followup_at = new Date(now + FOLLOWUPS.nudge[0]).toISOString();
  } else if (state === "completed") {
    if (c.state !== "completed" || c.followup_track !== "nurture") {
      P.followup_track = "nurture";
      P.followup_stage = 0;
      P.next_followup_at = new Date(now + FOLLOWUPS.nurture[0]).toISOString();
    } else if (c.next_followup_at) {
      // They're talking to us: no follow-up for at least 2 days.
      P.next_followup_at = new Date(Math.max(new Date(c.next_followup_at).getTime(), now + 2 * DAY)).toISOString();
    }
  } else {
    P.followup_track = null;
    P.next_followup_at = null;
  }
}

/** Handles one inbound message. Pure apart from the optional AI classifier. */
/**
 * STOP and similar, honoured even when the assistant is off (switched off or
 * not on the plan): the lead is opted out and follow-ups stop. Nothing is
 * sent. Null when the message isn't an opt-out.
 */
export function optOutPatch(m: Inbound): { patch: ConvPatch; note: string } | null {
  if (m.type !== "text" || !m.text) return null;
  if (!OPT_OUT_WORDS.has(norm(sanitizeInput(m.text)))) return null;
  return { patch: { state: "opted_out", next_followup_at: null }, note: "Unsubscribed from WhatsApp messages" };
}

export async function processMessage(
  c: Conversation,
  m: Inbound,
  opts: { settings: BotSettings; now?: Date; classify?: Classifier; aiBudgetLeft?: boolean },
): Promise<Effects> {
  const s = opts.settings;
  const now = opts.now ?? new Date();
  const ctx: Ctx = {
    settings: s,
    now,
    today: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now),
    classify: opts.classify,
    aiBudgetLeft: opts.aiBudgetLeft ?? true,
  };
  const T = texts(s.businessName);
  const text = m.text ? sanitizeInput(m.text) : "";
  const out: Outbound[] = [];
  const notes: TimelineNote[] = [];
  const P: ConvPatch = {
    last_inbound_at: now.toISOString(),
    unanswered_followups: 0,
    last_message: text || m.buttonText || m.replyTitle || `[${m.type}]`,
  };
  const say = (body: string) => out.push({ kind: "text", body });

  if (c.state === "opted_out") {
    if (!OPT_IN_WORDS.has(norm(text))) return { patch: P, out, notes }; // stay silent
    const q = nextQuestion(s, c.answers ?? {});
    P.state = q ? "in_progress" : "completed";
    out.push(q ? ask(q, T.optedIn) : { kind: "text", body: T.optedIn });
    notes.push({ text: "Opted back in on WhatsApp" });
    scheduleAfterReply(c, P, now.getTime());
    return { patch: P, out, notes };
  }
  if (c.bot_paused) {
    P.needs_attention = true;
    P.attention_reason = "New WhatsApp message (bot paused)";
    return { patch: P, out, notes };
  }

  const answers: Answers = { ...(c.answers ?? {}) };
  const action = await decide(c, m, text, P, ctx);
  const isFirstContact = !c.last_outbound_at;
  const preface = (fallback?: string) => (isFirstContact ? T.directWelcome(c.name) : fallback);
  const refresh = () => {
    P.answers = answers;
    P.score = scoreLead(s, answers);
    P.summary = summarize(s, answers);
  };
  const complete = () => {
    const was = c.state === "completed";
    P.state = "completed";
    if (!c.completed_at) P.completed_at = now.toISOString();
    refresh();
    say(completedText(s, c.name, answers));
    if (!was) {
      notes.push({ text: `Finished WhatsApp questions: ${P.summary || "no answers"} (${P.score})` });
      if (P.score === "hot" || answers.next_step === "call" || answers.next_step === "visit") {
        P.needs_attention = true;
        P.attention_reason = P.score === "hot" ? "Hot lead" : "Asked for a call or visit";
      }
    }
  };
  const continueFlow = (pre?: string) => {
    const q = nextQuestion(s, answers);
    if (!q) return complete();
    if (P.state === undefined && c.state !== "completed" && c.state !== "in_progress") P.state = "in_progress";
    out.push(ask(q, pre));
  };
  const inFlow = c.state !== "completed";

  switch (action.kind) {
    case "opt_out":
      P.state = "opted_out";
      say(T.optedOut);
      notes.push({ text: "Unsubscribed from WhatsApp messages" });
      break;
    case "not_interested":
      P.state = "not_interested";
      say(T.notInterested(c.name));
      notes.push({ text: "Said they're not interested (WhatsApp)" });
      break;
    case "start":
      continueFlow(preface(c.state === "awaiting_start" ? T.startQuestions : undefined));
      break;
    case "answer":
      answers[action.qid] = action.oid;
      if (action.qid === "config" && answers.shortcut) delete answers.shortcut;
      refresh();
      if (inFlow) continueFlow(preface());
      else if (nextQuestion(s, answers)) continueFlow();
      else say(T.updated);
      break;
    case "shortcut":
      answers.next_step = action.step;
      if (!answers.config) answers.shortcut = true;
      refresh();
      P.needs_attention = true;
      P.attention_reason = action.step === "visit" ? "Asked for a site visit" : "Asked for a call";
      notes.push({ text: action.step === "visit" ? "Asked for a site visit on WhatsApp" : "Asked for a call on WhatsApp" });
      continueFlow(preface());
      break;
    case "smalltalk":
      if (inFlow) continueFlow(preface(c.state === "awaiting_start" ? T.startQuestions : undefined));
      else if (!c.last_outbound_at || now.getTime() - new Date(c.last_outbound_at).getTime() > 3_600_000) say(T.smalltalkDone);
      break;
    case "question": {
      P.lead_questions = [c.lead_questions, action.text].filter(Boolean).join(" | ").slice(-1000);
      if (action.reply) say(action.reply);
      else {
        P.needs_attention = true;
        P.attention_reason = "Question to answer";
        say(T.handoffQuestion);
        notes.push({ text: `Asked on WhatsApp: ${action.text.slice(0, 300)}` });
      }
      if (inFlow) continueFlow(preface());
      break;
    }
    case "off_topic": {
      const count = (c.off_topic_count ?? 0) + 1;
      P.off_topic_count = count;
      if (count > MAX_OFF_TOPIC) break;
      if (count === MAX_OFF_TOPIC) {
        P.needs_attention = true;
        P.attention_reason = "Off-topic messages";
        say(T.offTopicFinal);
        break;
      }
      if (inFlow) continueFlow(preface(T.offTopic));
      else say(T.offTopic);
      break;
    }
    case "media":
      if (inFlow) continueFlow(preface(T.media));
      else {
        P.needs_attention = true;
        P.attention_reason = "Sent a photo or voice note";
      }
      break;
    default:
      if (inFlow) continueFlow(preface(T.tapOption));
      else {
        P.needs_attention = true;
        P.attention_reason = "Message to read";
      }
  }

  scheduleAfterReply(c, P, now.getTime());
  return { patch: P, out, notes };
}

// ---------------------------------------------------------------- follow-ups

/** When the next follow-up after `stage` is due, or null when the track is done. */
export function nextFollowupAt(c: Conversation, stage: number, now: number): string | null {
  const track = c.followup_track === "nurture" ? "nurture" : "nudge";
  const offsets = FOLLOWUPS[track];
  if (stage >= offsets.length) return null;
  const base = new Date(track === "nurture" ? (c.completed_at ?? c.started_at) : (c.last_inbound_at ?? c.started_at)).getTime();
  // Never closer than ~a day after the one just sent.
  return new Date(Math.max(base + offsets[stage], now + 20 * 3_600_000)).toISOString();
}

/** Should this conversation's due follow-up be skipped and the track stopped? */
export function shouldStopFollowups(c: Conversation, leadStatus: string | null): boolean {
  return (
    c.unanswered_followups >= FOLLOWUPS.maxUnanswered ||
    ["site_visit", "negotiation", "won", "lost"].includes(leadStatus ?? "") ||
    !["awaiting_start", "in_progress", "completed"].includes(c.state)
  );
}
