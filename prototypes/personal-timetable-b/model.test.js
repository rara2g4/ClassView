"use strict";

const assert = require("node:assert/strict");
const model = require("./model.js");

const records = [
  { id: "multi", title: "複数時限", day: "mon", period: 1, courseType: null, grades: ["1"] },
  { id: "multi", title: "複数時限", day: "mon", period: 2, courseType: null, grades: ["1"] },
  { id: "overlap", title: "重複授業", day: "mon", period: 2, courseType: null, grades: ["1"] },
  { id: "required", title: "必修授業", day: "tue", period: 1, courseType: "必修", grades: ["1"] },
];

assert.deepEqual(model.uniqueCourseIds(records), ["multi", "overlap", "required"]);
assert.deepEqual(
  model.recordsForCourse(records, "multi").map(model.slotKey),
  ["mon-1", "mon-2"],
  "the same course remains visible in every occupied slot",
);

const selectedMulti = model.toggleCourse({
  records,
  selectedIds: new Set(),
  requiredIds: new Set(),
  courseId: "multi",
});
assert.equal(selectedMulti.changed, true);
assert.deepEqual([...selectedMulti.selectedIds], ["multi"], "selection is stored once by courseId");

const blockedOverlap = model.toggleCourse({
  records,
  selectedIds: selectedMulti.selectedIds,
  requiredIds: new Set(),
  courseId: "overlap",
});
assert.equal(blockedOverlap.changed, false);
assert.equal(blockedOverlap.reason, "conflict");
assert.deepEqual(blockedOverlap.conflicts.map((entry) => entry.slotKey), ["mon-2"]);
assert.deepEqual(blockedOverlap.conflicts[0].courseIds, ["multi"]);

const forcedConflict = model.conflictEntries(records, new Set(["multi", "overlap"]));
assert.equal(forcedConflict.length, 1);
assert.equal(forcedConflict[0].slotKey, "mon-2", "all occupied slots participate in conflict detection");

const requiredIds = model.requiredCourseIds(records, "1");
assert.deepEqual([...requiredIds], ["required"]);
const requiredToggle = model.toggleCourse({ records, selectedIds: requiredIds, requiredIds, courseId: "required" });
assert.equal(requiredToggle.changed, false);
assert.equal(requiredToggle.reason, "required");
assert.deepEqual([...requiredToggle.selectedIds], ["required"]);

const deselected = model.toggleCourse({
  records,
  selectedIds: selectedMulti.selectedIds,
  requiredIds: new Set(),
  courseId: "multi",
});
assert.equal(deselected.reason, "deselected");
assert.equal(deselected.selectedIds.size, 0, "deselecting either occurrence clears the courseId once");

console.log("personal timetable B model tests passed");
