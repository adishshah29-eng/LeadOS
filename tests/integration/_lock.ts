// Loaded first by every integration test file. These tests create and delete
// users and workspaces in the Supabase database the live site also uses, so
// they stop here unless this one run is allowed (see src/lib/db-lock.ts).
import fs from "node:fs";
import path from "node:path";
import { integrationTestsRefusal } from "../../src/lib/db-lock.ts";

const why = integrationTestsRefusal(process.env, (name) => {
  try {
    return fs.readFileSync(path.join(import.meta.dirname, "..", "..", name), "utf8");
  } catch {
    return null;
  }
});
if (why) throw new Error(why);
