import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { integrationTestsRefusal, localJobsRefusal } from "./db-lock.ts";

/** True when the first statement that runs code (comments and type-only imports don't) is the lock import. */
function loadsLockFirst(source: string) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/^\s*import\s+type\b[^;]*?from\s*["'][^"']+["'];?/gm, "");
  const first = code.split("\n").map((l) => l.trim()).find(Boolean);
  return /^import\s+["'](?:\.\.?\/)+_lock\.ts["'];?$/.test(first ?? "");
}

const noFile = () => null;
const fileWith = (text: string) => () => text;

test("U1: integration tests are refused unless the switch says yes", () => {
  for (const v of [undefined, "", "no", "1", "true", "y"]) {
    const why = integrationTestsRefusal({ LEADOS_ALLOW_LIVE_DB: v }, noFile);
    assert.ok(why, `allowed with ${JSON.stringify(v)}`);
    assert.match(why, /LEADOS_ALLOW_LIVE_DB=yes/);
  }
});

test("U2: 'yes' (any case, spaces trimmed) allows the run", () => {
  for (const v of ["yes", " YES ", "Yes"]) assert.equal(integrationTestsRefusal({ LEADOS_ALLOW_LIVE_DB: v }, noFile), null, v);
});

test("U3: local background jobs are refused in development without the switch", () => {
  const why = localJobsRefusal({ INNGEST_DEV: "1", NODE_ENV: "development" }, noFile);
  assert.ok(why);
  assert.match(why, /LEADOS_ALLOW_LIVE_DB=yes npm run dev/);
});

test("U4: jobs run when allowed, when not in local dev mode, or in production", () => {
  assert.equal(localJobsRefusal({ INNGEST_DEV: "1", NODE_ENV: "development", LEADOS_ALLOW_LIVE_DB: "yes" }, noFile), null);
  for (const v of [undefined, "", "0", "false", " FALSE "]) {
    assert.equal(localJobsRefusal({ INNGEST_DEV: v, NODE_ENV: "development" }, noFile), null, `INNGEST_DEV=${v}`);
  }
  let read = false;
  assert.equal(localJobsRefusal({ INNGEST_DEV: "1", NODE_ENV: "production" }, () => ((read = true), null)), null);
  assert.equal(read, false, "production never reads .env.local");
});

test("U5: the switch is refused when it's left in .env.local", () => {
  const file = fileWith("NEXT_PUBLIC_SITE_URL=http://localhost:3000\nLEADOS_ALLOW_LIVE_DB=yes\n");
  const env = { LEADOS_ALLOW_LIVE_DB: "yes", INNGEST_DEV: "1", NODE_ENV: "development" };
  for (const why of [integrationTestsRefusal(env, file), localJobsRefusal(env, file)]) {
    assert.ok(why);
    assert.match(why, /\.env\.local/);
  }
  // A commented-out line doesn't count.
  assert.equal(integrationTestsRefusal({ LEADOS_ALLOW_LIVE_DB: "yes" }, fileWith("# LEADOS_ALLOW_LIVE_DB=yes\n")), null);
});

test("U7: the colon form (LEADOS_ALLOW_LIVE_DB: yes) in a .env file is refused too", () => {
  for (const line of ["LEADOS_ALLOW_LIVE_DB: yes", "LEADOS_ALLOW_LIVE_DB:yes", "export LEADOS_ALLOW_LIVE_DB : yes"]) {
    assert.ok(integrationTestsRefusal({ LEADOS_ALLOW_LIVE_DB: "yes" }, fileWith(`${line}\n`)), line);
  }
});

test("U8: the switch is refused in every .env file Next.js reads in development, and the message names it", () => {
  for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) {
    const only = (n: string) => (n === name ? "LEADOS_ALLOW_LIVE_DB=yes\n" : null);
    const env = { LEADOS_ALLOW_LIVE_DB: "yes", INNGEST_DEV: "1", NODE_ENV: "development" };
    for (const why of [integrationTestsRefusal(env, only), localJobsRefusal(env, only)]) {
      assert.ok(why, name);
      assert.ok(why.startsWith(`LEADOS_ALLOW_LIVE_DB is set in ${name}.`), why);
    }
  }
  // .env.example is documentation, never loaded.
  const example = (n: string) => (n === ".env.example" ? "LEADOS_ALLOW_LIVE_DB=yes\n" : null);
  assert.equal(integrationTestsRefusal({ LEADOS_ALLOW_LIVE_DB: "yes" }, example), null);
});

test("U9: the job route's .env read is hidden from the build tracer, so the whole project isn't bundled", () => {
  const route = fs.readFileSync(path.join(import.meta.dirname, "..", "app", "api", "inngest", "route.ts"), "utf8");
  assert.match(route, /path\.join\(\/\*\s*turbopackIgnore: true\s*\*\/ process\.cwd\(\), name\)/);
});

test("U10: the test lock reads the project's .env files, not the folder the command was run from", () => {
  // A stray .env.local in some other folder must not decide anything.
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "lock-cwd-"));
  try {
    fs.writeFileSync(path.join(elsewhere, ".env.local"), "LEADOS_ALLOW_LIVE_DB=yes\n");
    const lock = path.join(import.meta.dirname, "..", "..", "tests", "integration", "_lock.ts");
    const run = spawnSync(process.execPath, ["--experimental-strip-types", lock], {
      cwd: elsewhere,
      env: { ...process.env, LEADOS_ALLOW_LIVE_DB: "yes" },
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
  } finally {
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("U11: the PowerShell instruction switches the lock back on even after Ctrl+C", () => {
  for (const [why, cmd] of [
    [integrationTestsRefusal({}, noFile), "npm run test:int"],
    [localJobsRefusal({ INNGEST_DEV: "1", NODE_ENV: "development" }, noFile), "npm run dev"],
  ] as const) {
    assert.ok(why?.includes(`$env:LEADOS_ALLOW_LIVE_DB="yes"; try { ${cmd} } finally { Remove-Item Env:LEADOS_ALLOW_LIVE_DB }`), why ?? "");
  }
});

test("U6a: the lock-first check sees through comments and type imports", () => {
  const src = (...lines: string[]) => lines.join("\n");
  assert.ok(loadsLockFirst(src('import "./_lock.ts";', 'import { x } from "y";')));
  assert.ok(loadsLockFirst(src("// note", '/* import "./_lock.ts"; */', 'import "./_lock.ts";')));
  assert.ok(loadsLockFirst(src('import type { A } from "a";', "import type {", "  B,", '} from "b";', 'import "./_lock.ts";')));
  assert.ok(loadsLockFirst('import "../_lock.ts";'), "a test in a subfolder");
  assert.ok(!loadsLockFirst(src("/*", 'import "./_lock.ts";', "*/", 'import { x } from "y";')), "a commented-out lock doesn't count");
  assert.ok(!loadsLockFirst(src('import { x } from "y";', 'import "./_lock.ts";')));
  assert.ok(!loadsLockFirst(src("const a = 1;", 'import "./_lock.ts";')));
});

test("U6: every integration test file, in any subfolder, loads the lock before anything else", () => {
  const dir = path.join(import.meta.dirname, "..", "..", "tests", "integration");
  const files = fs.readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => /\.test\.[cm]?[jt]s$/.test(f));
  assert.ok(files.length > 0);
  for (const f of files) assert.ok(loadsLockFirst(fs.readFileSync(path.join(dir, f), "utf8")), `${f} must start with import "./_lock.ts";`);
});
