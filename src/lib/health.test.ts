import { test } from "node:test";
import assert from "node:assert/strict";
import { checkHealth } from "./health.ts";

test("U11: database answers -> 200 {ok:true}", async () => {
  assert.deepEqual(await checkHealth(async () => {}), { status: 200, body: { ok: true } });
});

test("U12: database error -> 503 {ok:false}, error text not leaked", async () => {
  const r = await checkHealth(async () => {
    throw new Error("password authentication failed for user postgres at db.internal:5432");
  });
  assert.deepEqual(r, { status: 503, body: { ok: false } });
});

test("U13: database hangs -> 503 after the timeout", async () => {
  const started = Date.now();
  const r = await checkHealth(() => new Promise(() => {}), 50);
  assert.deepEqual(r, { status: 503, body: { ok: false } });
  assert.ok(Date.now() - started < 1000, "did not time out");
});

test("F7: a hung database query is cancelled when the timeout fires", async () => {
  let received: AbortSignal | undefined;
  await checkHealth((signal) => {
    received = signal;
    return new Promise(() => {});
  }, 30);
  assert.ok(received, "no cancel signal was passed to the query");
  assert.equal(received.aborted, true);
});
