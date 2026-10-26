import { test } from "node:test";
import assert from "node:assert/strict";
import { ageText, maskError, minutesLeft, supportReason } from "./admin.ts";

// U1 (sessionActive) was removed with the helper: the database decides whether a view is active (B6 fix 11).

test("U2: a support reason is 3–300 characters after trimming", () => {
  assert.equal(supportReason("   ").ok, false);
  assert.equal(supportReason("ab").ok, false);
  assert.deepEqual(supportReason("  Customer asked about a sync error  "), { ok: true, reason: "Customer asked about a sync error" });
  assert.equal(supportReason("x".repeat(300)).ok, true);
  assert.equal(supportReason("x".repeat(301)).ok, false);
});

test("U3: backlog ages read as now / minutes / hours", () => {
  assert.equal(ageText(0), "now");
  assert.equal(ageText(30), "now");
  assert.equal(ageText(90), "2 min");
  assert.equal(ageText(7200), "2 h");
});

test("U4: minutes left in a support view round up and never show 0", () => {
  const now = Date.parse("2026-10-25T10:00:00Z");
  assert.equal(minutesLeft("2026-10-25T10:30:00Z", now), 30);
  assert.equal(minutesLeft("2026-10-25T10:00:20Z", now), 1);
  assert.equal(minutesLeft("2026-10-25T09:59:00Z", now), 1);
});

test("F3: invisible, control and direction characters are removed; at least 3 letters or digits needed", () => {
  for (const bad of ["​​​", "\t\t\t", "   ", "　　　", "\u0001\u0002\u0003", "‮‮‮", "...", "!!??"]) {
    assert.equal(supportReason(bad).ok, false, JSON.stringify(bad));
  }
  assert.deepEqual(supportReason("‮Customer​ asked\u0007 about sync "), { ok: true, reason: "Customer asked about sync" });
  assert.equal(supportReason("ग्राहक ने पूछा").ok, true, "Hindi letters count as letters");
});

test("F11: length is counted in characters, the same way as the database", () => {
  const emoji = "😀";
  assert.equal(supportReason("abc" + emoji.repeat(297)).ok, true); // 300 characters
  assert.equal(supportReason("abc" + emoji.repeat(298)).ok, false); // 301 characters
});

test("F7: error text shows its first line, long digit runs masked, at most 200 characters", () => {
  assert.equal(maskError("Meta API error 100: lead +919876543210 invalid\nstack trace…"), "Meta API error 100: lead +••• invalid");
  assert.equal(maskError('Key (phone)=(919876543210) already exists'), "Key (phone)=(•••) already exists");
  assert.equal(maskError("x".repeat(500))?.length, 200);
  assert.equal(maskError(null), null);
});
