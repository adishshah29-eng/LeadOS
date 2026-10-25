import { test } from "node:test";
import assert from "node:assert/strict";
import { checkStartup } from "./instrumentation.ts";

const good = {
  SUPABASE_SECRET_KEY: "s",
  META_APP_SECRET: "s",
  META_WEBHOOK_VERIFY_TOKEN: "s",
  NEXT_PUBLIC_SITE_URL: "https://leados.example",
  INNGEST_EVENT_KEY: "s",
  INNGEST_SIGNING_KEY: "s",
};

test("U9: production with a problem refuses to start and lists it", () => {
  assert.throws(() => checkStartup({ ...good, NODE_ENV: "production", WA_DRY_RUN: "1" }), /WA_DRY_RUN/);
  assert.doesNotThrow(() => checkStartup({ ...good, NODE_ENV: "production" }));
});

test("U10: development starts with the same settings", () => {
  assert.doesNotThrow(() => checkStartup({ NODE_ENV: "development", WA_DRY_RUN: "1" }));
});
