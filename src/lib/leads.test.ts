import { test } from "node:test";
import assert from "node:assert/strict";
import { toE164 } from "./leads.ts";

test("Indian numbers in common formats become +91…", () => {
  for (const raw of ["9876543210", "09876543210", "+91 98765 43210", "91-98765-43210", "0091 9876543210"]) {
    assert.equal(toE164(raw), "+919876543210", raw);
  }
});
test("foreign numbers with + keep their country code; junk is rejected", () => {
  assert.equal(toE164("+1 (415) 555-0123"), "+14155550123");
  assert.equal(toE164("12345"), null);
  assert.equal(toE164(""), null);
});
