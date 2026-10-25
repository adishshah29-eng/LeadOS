import { test } from "node:test";
import assert from "node:assert/strict";
import { emailMatches, nameMatches } from "./deletion.ts";

test("U1: the exact workspace name is accepted", () => {
  assert.equal(nameMatches("Acme Realty", "Acme Realty"), true);
});

test("U2: spaces around the typed name are ignored", () => {
  assert.equal(nameMatches("  Acme Realty ", "Acme Realty"), true);
});

test("U3: a different case, or nothing typed, is refused", () => {
  assert.equal(nameMatches("acme realty", "Acme Realty"), false);
  assert.equal(nameMatches("", "Acme Realty"), false);
  assert.equal(nameMatches("   ", "Acme Realty"), false);
});

test("U4: a unicode name typed exactly is accepted", () => {
  assert.equal(nameMatches("श्री Realty", "श्री Realty"), true);
});

test("U5: email confirmation ignores case and spaces, but not a different address", () => {
  assert.equal(emailMatches(" Owner@Example.test ", "owner@example.test"), true);
  assert.equal(emailMatches("other@example.test", "owner@example.test"), false);
  assert.equal(emailMatches("", "owner@example.test"), false);
});
