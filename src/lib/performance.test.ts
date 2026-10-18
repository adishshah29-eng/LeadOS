import { test } from "node:test";
import assert from "node:assert/strict";
import { flagRow, groupAverageCpl, wastedSpend } from "./performance.ts";

const rows = [
  { spend: 10000, results: 50 }, // CPL 200
  { spend: 8000, results: 0 }, // big spend, no leads
  { spend: 300, results: 0 }, // tiny test ad
  { spend: 6000, results: 5 }, // CPL 1200
  { spend: 2000, results: 20 }, // CPL 100
];

test("flags big spend with zero leads as waste", () => assert.equal(flagRow(rows[1], rows), "waste"));
test("does not flag a tiny test ad", () => assert.equal(flagRow(rows[2], rows), null));
test("flags cost per lead above 2x the average as waste", () => assert.equal(flagRow(rows[3], rows), "waste"));
test("flags cost per lead under 0.6x the average with 3+ leads as best", () => {
  assert.equal(flagRow(rows[4], rows), "best");
  assert.equal(flagRow(rows[0], rows), "best");
});
test("averages cost per lead across the group", () => assert.equal(Math.round(groupAverageCpl(rows)!), 351));
test("has no average when nothing produced leads", () => assert.equal(groupAverageCpl([{ spend: 100, results: 0 }]), null));
test("sums spend that produced no leads", () => assert.equal(wastedSpend(rows), 8300));
test("handles an empty group", () => assert.equal(flagRow({ spend: 0, results: 0 }, []), null));
