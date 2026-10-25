import { test } from "node:test";
import assert from "node:assert/strict";
import { checkBuild, productionEnvProblems } from "./env.ts";

const good = {
  SUPABASE_SECRET_KEY: "sb_secret_TESTVALUE_123",
  META_APP_SECRET: "appsecret_TESTVALUE_456",
  META_WEBHOOK_VERIFY_TOKEN: "verify_TESTVALUE_789",
  NEXT_PUBLIC_SITE_URL: "https://leados.example",
  INNGEST_EVENT_KEY: "evt_TESTVALUE_111",
  INNGEST_SIGNING_KEY: "signkey-prod-TESTVALUE_222",
};

test("U1: complete production settings have no problems", () => {
  assert.deepEqual(productionEnvProblems(good), []);
});

test("U2: a missing secret is named", () => {
  const problems = productionEnvProblems({ ...good, SUPABASE_SECRET_KEY: undefined });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /SUPABASE_SECRET_KEY/);
});

test("U3: empty or blank values count as missing", () => {
  assert.match(productionEnvProblems({ ...good, META_APP_SECRET: "" }).join(), /META_APP_SECRET/);
  assert.match(productionEnvProblems({ ...good, META_APP_SECRET: "   " }).join(), /META_APP_SECRET/);
});

test("U4: every missing key gets its own problem", () => {
  const problems = productionEnvProblems({});
  const keys = ["SUPABASE_SECRET_KEY", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "NEXT_PUBLIC_SITE_URL", "INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"];
  for (const key of keys) assert.equal(problems.filter((p) => p.includes(key)).length, 1, key);
  assert.equal(problems.length, keys.length);
});

test("U5: dev-only switches are refused", () => {
  assert.match(productionEnvProblems({ ...good, WA_DRY_RUN: "1" }).join(), /WA_DRY_RUN/);
  assert.match(productionEnvProblems({ ...good, INNGEST_DEV: "1" }).join(), /INNGEST_DEV/);
});

test("U6: switches that are off are fine", () => {
  assert.deepEqual(productionEnvProblems({ ...good, WA_DRY_RUN: "0", INNGEST_DEV: "" }), []);
  assert.deepEqual(productionEnvProblems({ ...good, WA_DRY_RUN: "false", INNGEST_DEV: " FALSE " }), []);
});

test("F1: any 'on' spelling of a dev switch is refused (Inngest reads true/1/URLs as dev mode)", () => {
  for (const v of ["true", "TRUE", " 1", "1 ", "yes", "http://localhost:8288"]) {
    assert.match(productionEnvProblems({ ...good, INNGEST_DEV: v }).join(), /INNGEST_DEV/, `INNGEST_DEV=${v}`);
    assert.match(productionEnvProblems({ ...good, WA_DRY_RUN: v }).join(), /WA_DRY_RUN/, `WA_DRY_RUN=${v}`);
  }
});

test("U7: the site URL must be https", () => {
  assert.match(productionEnvProblems({ ...good, NEXT_PUBLIC_SITE_URL: "http://leados.example" }).join(), /NEXT_PUBLIC_SITE_URL.*https/);
  assert.match(productionEnvProblems({ ...good, NEXT_PUBLIC_SITE_URL: "not a url" }).join(), /NEXT_PUBLIC_SITE_URL.*https/);
});

test("U8: problem messages never contain secret values", () => {
  const text = productionEnvProblems({ ...good, NEXT_PUBLIC_SITE_URL: "http://x", WA_DRY_RUN: "1" }).join("\n");
  for (const value of Object.values(good)) assert.ok(!text.includes(value), "leaked a value");
});

test("F3: a production build with unsafe settings fails; dev server and good settings don't", () => {
  assert.throws(() => checkBuild("phase-production-build", { ...good, NEXT_PUBLIC_SITE_URL: undefined }), /NEXT_PUBLIC_SITE_URL/);
  assert.throws(() => checkBuild("phase-production-build", { ...good, INNGEST_DEV: "1" }), /INNGEST_DEV/);
  assert.doesNotThrow(() => checkBuild("phase-production-build", good));
  assert.doesNotThrow(() => checkBuild("phase-development-server", { INNGEST_DEV: "1" }));
});

test("F5: the site URL must be a bare https origin (no path, query or fragment)", () => {
  for (const bad of ["https://a.com/app", "https://a.com/?x=1", "https://a.com#x", "https:foo"]) {
    assert.match(productionEnvProblems({ ...good, NEXT_PUBLIC_SITE_URL: bad }).join(), /NEXT_PUBLIC_SITE_URL/, bad);
  }
  for (const ok of ["https://a.com", "https://a.com/", " https://A.com "]) {
    assert.deepEqual(productionEnvProblems({ ...good, NEXT_PUBLIC_SITE_URL: ok }), [], ok);
  }
});

test("F9: the Inngest Cloud keys are required in production", () => {
  assert.match(productionEnvProblems({ ...good, INNGEST_SIGNING_KEY: undefined }).join(), /INNGEST_SIGNING_KEY/);
  assert.match(productionEnvProblems({ ...good, INNGEST_EVENT_KEY: " " }).join(), /INNGEST_EVENT_KEY/);
});

test("F3b: `next typegen` (which also reports the build phase) is not blocked; `next build` is", () => {
  const bad = { INNGEST_DEV: "1" };
  assert.doesNotThrow(() => checkBuild("phase-production-build", bad, ["node", "next", "typegen"]));
  assert.throws(() => checkBuild("phase-production-build", bad, ["node", "next", "build"]), /INNGEST_DEV/);
});
