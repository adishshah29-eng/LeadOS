import { test } from "node:test";
import assert from "node:assert/strict";
import { disablesFirst, LIMITS, PLANS, planIncludesAssistant, planLimitMessage, settingsForPlan, usageLevel } from "./plans.ts";

test("U1: usage level warns at 80% and is full at the limit; unlimited is always ok", () => {
  assert.equal(usageLevel(7, 10), "ok");
  assert.equal(usageLevel(8, 10), "warn");
  assert.equal(usageLevel(10, 10), "full");
  assert.equal(usageLevel(12, 10), "full"); // over the limit after a downgrade
  assert.equal(usageLevel(500, null), "ok");
  assert.equal(usageLevel(0, 2), "ok");
});

test("U2: limits match the approved table", () => {
  assert.deepEqual(LIMITS, {
    trial: { adAccounts: 10, seats: 10, whatsapp: true, reportLinks: true },
    starter: { adAccounts: 2, seats: 3, whatsapp: false, reportLinks: false },
    growth: { adAccounts: 10, seats: 10, whatsapp: true, reportLinks: false },
    agency: { adAccounts: null, seats: null, whatsapp: true, reportLinks: true },
  });
});

test("U3: database limit errors become clear messages; other errors pass through as null", () => {
  assert.match(planLimitMessage("plan limit: ad_accounts", "starter") ?? "", /Starter includes 2 ad accounts.*[Uu]pgrade/);
  assert.match(planLimitMessage("plan limit: seats", "growth") ?? "", /Growth includes 10 team members/);
  assert.match(planLimitMessage("plan limit: whatsapp", "starter") ?? "", /WhatsApp.*Starter/);
  assert.match(planLimitMessage("plan limit: report_links", "growth") ?? "", /report links.*Growth/i);
  assert.equal(planLimitMessage("duplicate key value violates unique constraint", "starter"), null);
});

test("U4: only plans with WhatsApp include the assistant", () => {
  assert.equal(planIncludesAssistant("starter"), false);
  for (const p of ["trial", "growth", "agency"]) assert.equal(planIncludesAssistant(p), true, p);
  assert.equal(planIncludesAssistant("unknown-plan"), false);
});

test("U5: the plan bullets on the trial-ended page come from the limits", () => {
  const points = Object.fromEntries(PLANS.map((p) => [p.id, p.points]));
  assert.deepEqual(points.starter, ["2 ad accounts", "3 team members"]);
  assert.deepEqual(points.growth, ["10 ad accounts", "10 team members", "WhatsApp lead assistant"]);
  assert.deepEqual(points.agency, ["Unlimited ad accounts", "Unlimited team members", "WhatsApp lead assistant", "Client report links"]);
});

test("U6: on a plan without WhatsApp the assistant settings read as switched off; other settings are untouched", () => {
  const on = { enabled: true, businessName: "Acme" };
  assert.deepEqual(settingsForPlan(on, "starter"), { enabled: false, businessName: "Acme" });
  assert.deepEqual(settingsForPlan(on, "growth"), on);
  assert.deepEqual(settingsForPlan(on, "trial"), on);
  assert.deepEqual(settingsForPlan(on, "something-unknown"), { enabled: false, businessName: "Acme" });
});

test("F1: when saving ad accounts, turn-offs come before turn-ons so a swap at the limit isn't refused", () => {
  const rows = [
    { id: "B", sync_enabled: true },
    { id: "A", sync_enabled: false },
    { id: "C", sync_enabled: true },
    { id: "D", sync_enabled: false },
  ];
  assert.deepEqual(disablesFirst(rows).map((r) => r.id), ["A", "D", "B", "C"]); // stable within each group
  assert.deepEqual(rows.map((r) => r.id), ["B", "A", "C", "D"], "the input must not be reordered in place");
  assert.deepEqual(disablesFirst([]), []);
});
