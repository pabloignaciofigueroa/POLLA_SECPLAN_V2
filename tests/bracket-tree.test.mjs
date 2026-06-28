import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildBracketTree } from "../src/lib/knockout/bracketTree.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../src/data/knockout-matches.json"), "utf8"),
);
const MATCHES = data.matches;
const ids = (list) => list.map((m) => m.id);

test("split LEFT/RIGHT de R32 coincide con la referencia (orden post-orden del arbol)", () => {
  const tree = buildBracketTree(MATCHES);
  assert.deepEqual(ids(tree.left.R32), ["P74", "P77", "P73", "P75", "P83", "P84", "P81", "P82"]);
  assert.deepEqual(ids(tree.right.R32), ["P76", "P78", "P79", "P80", "P86", "P88", "P85", "P87"]);
});

test("rondas intermedias ordenadas correctamente por lado", () => {
  const tree = buildBracketTree(MATCHES);
  assert.deepEqual(ids(tree.left.R16), ["P89", "P90", "P93", "P94"]);
  assert.deepEqual(ids(tree.right.R16), ["P91", "P92", "P95", "P96"]);
  assert.deepEqual(ids(tree.left.QF), ["P97", "P98"]);
  assert.deepEqual(ids(tree.right.QF), ["P99", "P100"]);
  assert.deepEqual(ids(tree.left.SF), ["P101"]);
  assert.deepEqual(ids(tree.right.SF), ["P102"]);
});

test("CENTER = Final (P104) + Tercer puesto (P103)", () => {
  const tree = buildBracketTree(MATCHES);
  assert.equal(tree.center.final.id, "P104");
  assert.equal(tree.center.third.id, "P103");
  assert.equal(tree.roots.left, "P101");
  assert.equal(tree.roots.right, "P102");
});

test("cada lado tiene 8 R32, 4 R16, 2 QF, 1 SF", () => {
  const tree = buildBracketTree(MATCHES);
  for (const side of [tree.left, tree.right]) {
    assert.equal(side.R32.length, 8);
    assert.equal(side.R16.length, 4);
    assert.equal(side.QF.length, 2);
    assert.equal(side.SF.length, 1);
  }
});

test("idempotente ante input barajado (determinista)", () => {
  const shuffled = MATCHES.slice().reverse();
  const a = buildBracketTree(MATCHES);
  const b = buildBracketTree(shuffled);
  assert.deepEqual(ids(b.left.R32), ids(a.left.R32));
  assert.deepEqual(ids(b.right.R32), ids(a.right.R32));
  assert.deepEqual(ids(b.left.R16), ids(a.left.R16));
  assert.equal(b.center.final.id, a.center.final.id);
});
