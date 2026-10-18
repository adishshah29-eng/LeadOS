import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, csvRow } from "./csv.ts";

test("quotes plain values", () => assert.equal(csvCell("Rohan"), '"Rohan"'));
test("escapes embedded quotes", () => assert.equal(csvCell('2 BHK "Baner"'), '"2 BHK ""Baner"""'));
test("keeps commas and newlines inside one cell", () => assert.equal(csvCell("a,b\nc"), '"a,b\nc"'));
test("neutralises formula injection", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), '"\'=HYPERLINK(""http://x"")"');
  assert.equal(csvCell("+91 98765"), "\"'+91 98765\"");
  assert.equal(csvCell("@SUM(A1)"), "\"'@SUM(A1)\"");
  assert.equal(csvCell("-1"), "\"'-1\"");
});
test("renders null and undefined as empty", () => {
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
});
test("joins a row", () => assert.equal(csvRow(["a", 1, null]), '"a","1",""'));
