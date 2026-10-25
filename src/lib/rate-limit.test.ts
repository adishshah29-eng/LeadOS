import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLimits, clientIp, emailKey, formatWait, LIMIT_RULES, safeKey } from "./rate-limit.ts";

const headers = (v?: string) => ({ get: (k: string) => (k === "x-forwarded-for" ? (v ?? null) : null) });

test("U1: the network address is the first x-forwarded-for value; missing is 'unknown'", () => {
  assert.equal(clientIp(headers("1.2.3.4, 5.6.7.8")), "1.2.3.4");
  assert.equal(clientIp(headers("  9.9.9.9  ,10.0.0.1")), "9.9.9.9");
  assert.equal(clientIp(headers("2001:db8::1")), "2001:db8:0:0::/64"); // IPv6 counts per /64 (B4 fix 4)
  assert.equal(clientIp(headers()), "unknown");
  assert.equal(clientIp(headers("")), "unknown");
});

test("U2: waits read in whole minutes, rounded up", () => {
  assert.equal(formatWait(30), "1 minute");
  assert.equal(formatWait(61), "2 minutes");
  assert.equal(formatWait(900), "15 minutes");
  assert.equal(formatWait(3600), "60 minutes");
});

test("U3: email keys ignore case and spaces and never contain the email", () => {
  const a = emailKey("signin", "Owner@Example.test ");
  assert.equal(a, emailKey("signin", "owner@example.test"));
  assert.ok(!a.toLowerCase().includes("owner"), a);
  assert.ok(!a.includes("example"), a);
  assert.notEqual(a, emailKey("reset", "owner@example.test"), "different actions share a key");
});

test("U4: with several rules the longest wait wins; all allowed gives 0", async () => {
  const waits: Record<string, number> = { a: 0, b: 120, c: 30 };
  const hit = async (key: string) => waits[key];
  assert.equal(await checkLimits([{ key: "a", max: 1, windowSec: 60 }, { key: "b", max: 1, windowSec: 60 }, { key: "c", max: 1, windowSec: 60 }], hit), 120);
  assert.equal(await checkLimits([{ key: "a", max: 1, windowSec: 60 }], hit), 0);
  assert.equal(await checkLimits([], hit), 0);
});

test("U5: when the database can't be reached the attempt is allowed and logged", async () => {
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    const wait = await checkLimits([{ key: "x", max: 1, windowSec: 60 }], async () => {
      throw new Error("fetch failed");
    });
    assert.equal(wait, 0);
    assert.equal(logged.length, 1);
  } finally {
    console.error = original;
  }
});

// ---------------------------------------------------------------- review fixes

test("F2: junk or oversized addresses become 'unknown'; long keys are shortened, still unique", () => {
  assert.equal(clientIp(headers("x".repeat(3000))), "unknown");
  assert.equal(clientIp(headers("999.1.1.1")), "unknown");
  assert.equal(clientIp(headers("not-an-ip")), "unknown");
  assert.equal(clientIp(headers("203.0.113.7")), "203.0.113.7");
  const a = safeKey("report:ip:" + "a".repeat(5000));
  const b = safeKey("report:ip:" + "a".repeat(4999) + "b");
  assert.ok(a.length <= 200 && b.length <= 200, `${a.length}, ${b.length}`);
  assert.notEqual(a, b);
  assert.equal(safeKey("signin:ip:1.2.3.4"), "signin:ip:1.2.3.4");
});

test("F4: one IPv6 /64 is one address; spellings and IPv4-mapped forms are normalised", () => {
  assert.equal(clientIp(headers("::ffff:1.2.3.4")), "1.2.3.4");
  const one = clientIp(headers("2001:DB8::1"));
  assert.equal(one, clientIp(headers("2001:db8:0:0:0:0:0:2")));
  assert.equal(one, clientIp(headers("2001:0db8:0000:0000:abcd:ef01:2345:6789")));
  assert.notEqual(one, clientIp(headers("2001:db8:0:1::1")));
  assert.match(one, /\/64$/);
});

test("F3/F5: rules are checked in order and stop at the first block, so later counters aren't touched", async () => {
  const called: string[] = [];
  const hit = async (key: string) => {
    called.push(key);
    return key === "first" ? 60 : 0;
  };
  const wait = await checkLimits([{ key: "first", max: 1, windowSec: 60 }, { key: "second", max: 1, windowSec: 60 }], hit);
  assert.equal(wait, 60);
  assert.deepEqual(called, ["first"]);
});

test("F10: a counter call that hangs is given up after the timeout and the attempt allowed", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const started = Date.now();
    const wait = await checkLimits([{ key: "x", max: 1, windowSec: 60 }], () => new Promise(() => {}), { timeoutMs: 50 });
    assert.equal(wait, 0);
    assert.ok(Date.now() - started < 1000);
  } finally {
    console.error = original;
  }
});

test("F7: per-address limits are sized for shared mobile/office addresses; per-email ones unchanged", () => {
  const ip = "203.0.113.9";
  const pick = (rules: { key: string; max: number; windowSec: number }[], part: string) => rules.find((r) => r.key.includes(part));
  assert.deepEqual(pick(LIMIT_RULES.signIn(ip, "a@x.test"), "signin:ip:"), { key: `signin:ip:${ip}`, max: 100, windowSec: 900 });
  assert.equal(pick(LIMIT_RULES.signIn(ip, "a@x.test"), ":email:")!.max, 10);
  assert.deepEqual(LIMIT_RULES.signUp(ip), [{ key: `signup:ip:${ip}`, max: 20, windowSec: 3600 }]);
  assert.equal(pick(LIMIT_RULES.passwordReset(ip, "a@x.test"), "reset:ip:")!.max, 30);
  assert.deepEqual(LIMIT_RULES.reportLink(ip), [{ key: `report:ip:${ip}`, max: 300, windowSec: 60 }]);
});

test("F3: password reset is limited per email+address (3/h) with a looser email-only cap (10/h), address first", () => {
  const rules = LIMIT_RULES.passwordReset("203.0.113.9", "victim@x.test");
  assert.equal(rules[0].key, "reset:ip:203.0.113.9");
  const perPair = rules.find((r) => r.key.includes(":email:") && r.key.includes(":ip:"));
  const perEmail = rules.find((r) => r.key.includes(":email:") && !r.key.includes(":ip:"));
  assert.deepEqual([perPair?.max, perPair?.windowSec], [3, 3600]);
  assert.deepEqual([perEmail?.max, perEmail?.windowSec], [10, 3600]);
});

test("F6: the two-factor code check is limited per user", () => {
  assert.deepEqual(LIMIT_RULES.mfaVerify("u-1"), [{ key: "mfa:user:u-1", max: 5, windowSec: 900 }]);
});

test("F9: with no known address, address-only limits are skipped (per-email ones still apply)", () => {
  assert.deepEqual(LIMIT_RULES.signUp("unknown"), []);
  assert.deepEqual(LIMIT_RULES.reportLink("unknown"), []);
  const signIn = LIMIT_RULES.signIn("unknown", "a@x.test");
  assert.equal(signIn.length, 1);
  assert.match(signIn[0].key, /:email:/);
});
