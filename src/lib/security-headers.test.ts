import { test } from "node:test";
import assert from "node:assert/strict";
import { extraHeaders } from "./security-headers.ts";

test("U17: production forces HTTPS for a year (HSTS)", () => {
  assert.equal(extraHeaders(false)["strict-transport-security"], "max-age=31536000; includeSubDomains");
});

test("U18: development sends no HSTS (it would break http://localhost)", () => {
  assert.equal(extraHeaders(true)["strict-transport-security"], undefined);
});
