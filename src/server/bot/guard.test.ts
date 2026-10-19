import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReply } from "./guard.ts";

const facts = "Skyline Residences, Baner. 2 BHK from ₹1.15 Cr. Possession December 2027.";

test("a reply may only use numbers that are in the facts", () => {
  assert.equal(checkReply("2 BHK starts at ₹1.15 Cr.", facts), "2 BHK starts at ₹1.15 Cr.");
  // "1" and "2" appear inside "1.15" and "2027"; an invented price must still be refused.
  assert.equal(checkReply("2 BHK is ₹1 Cr.", facts), null);
  assert.equal(checkReply("Possession in 2027.", facts), "Possession in 2027.");
});
