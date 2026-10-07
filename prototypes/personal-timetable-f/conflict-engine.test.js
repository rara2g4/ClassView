"use strict";

const assert = require("node:assert/strict");
const { analyze, formatConflictReason } = require("./conflict-engine.js");

const course = (id, title, slots) => ({ id, title, slots });
const slotLabel = (slot) => ({ "mon-1": "月曜1限", "mon-2": "月曜2限", "mon-3": "月曜3限", "wed-3": "水曜3限", "fri-1": "金曜1限", "fri-2": "金曜2限", "fri-3": "金曜3限" })[slot];
const orderedSlotKeys = ["mon-1", "mon-2", "mon-3", "wed-3", "fri-1", "fri-2", "fri-3"];

const courses = [
  course("a", "Python基礎", ["mon-1"]),
  course("b", "Webアプリ開発", ["mon-1", "mon-2"]),
  course("c", "データ活用", ["mon-2", "mon-3"]),
  course("d", "キャリア演習", ["mon-2"]),
  course("required", "必修プロジェクト", ["wed-3"]),
  course("required-option", "クラウド制作", ["wed-3"]),
  course("required-2", "必修HR", ["fri-1", "fri-2"]),
  course("required-3", "必修キャリア", ["fri-2", "fri-3"]),
];

const case1 = analyze({
  courses,
  selectedIds: new Set(["a"]),
  requiredIds: new Set(),
  orderedSlotKeys,
});
assert.deepEqual(case1.candidateConflicts.get("b")[0].sharedSlots, ["mon-1"]);
assert.equal(case1.candidateConflicts.get("d").length, 0);

const case2 = analyze({
  courses,
  selectedIds: new Set(["b"]),
  requiredIds: new Set(),
  orderedSlotKeys,
});
assert.deepEqual(case2.candidateConflicts.get("c")[0].sharedSlots, ["mon-2"]);

const case4 = analyze({
  courses,
  selectedIds: new Set(),
  requiredIds: new Set(),
  orderedSlotKeys,
});
assert.equal(case4.candidateConflicts.get("b").length, 0);

const case5 = analyze({
  courses,
  selectedIds: new Set(["required"]),
  requiredIds: new Set(["required"]),
  orderedSlotKeys,
});
const case5Conflicts = case5.candidateConflicts.get("required-option");
assert.equal(case5Conflicts[0].required, true);
assert.deepEqual(
  formatConflictReason(case5Conflicts, slotLabel),
  ["水曜3限：必修授業 必修プロジェクトと重複"],
);

const case6 = analyze({
  courses,
  selectedIds: new Set(["required-2", "required-3"]),
  requiredIds: new Set(["required-2", "required-3"]),
  orderedSlotKeys,
});
assert.equal(case6.requiredConflicts.length, 1);
assert.deepEqual(case6.requiredConflicts[0].sharedSlots, ["fri-2"]);
assert.equal(case6.occupancy.get("fri-2").length, 2);

console.log("conflict-engine: all prototype cases passed");
