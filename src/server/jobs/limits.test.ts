import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Inngest refuses to register the whole app (so no job runs at all) when any
// function asks for more concurrency than the plan allows. Free plan: 5.
const PLAN_CONCURRENCY_LIMIT = 5;

test("J1: no background job asks for more concurrency than the Inngest plan allows", () => {
  const files = fs.readdirSync(import.meta.dirname).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  let checked = 0;
  for (const f of files) {
    const src = fs.readFileSync(path.join(import.meta.dirname, f), "utf8");
    for (const [, block] of src.matchAll(/concurrency:\s*\[([^\]]*)\]/g)) {
      for (const [, n] of block.matchAll(/limit:\s*(\d+)/g)) {
        checked++;
        assert.ok(Number(n) <= PLAN_CONCURRENCY_LIMIT, `${f}: concurrency limit ${n} is above the plan's ${PLAN_CONCURRENCY_LIMIT}`);
      }
    }
  }
  assert.ok(checked >= 10, `only found ${checked} limits; did the job files move?`);
});
