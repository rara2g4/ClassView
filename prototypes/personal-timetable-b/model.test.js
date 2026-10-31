"use strict";

const assert = require("node:assert/strict");
const model = require("./model.js");

const records = [
  { id: "multi", title: "複数時限", day: "mon", period: 1, courseType: null, grades: ["1"] },
  { id: "multi", title: "複数時限", day: "mon", period: 2, courseType: null, grades: ["1"] },
  { id: "overlap", title: "重複授業", day: "mon", period: 2, courseType: null, grades: ["1"] },
  { id: "required", title: "必修授業", day: "tue", period: 1, courseType: "必修", grades: ["1"] },
  { id: "wide", title: "複数競合対象", day: "wed", period: 1, courseType: null, grades: ["1"] },
  { id: "wide", title: "複数競合対象", day: "wed", period: 2, courseType: null, grades: ["1"] },
  { id: "manual-a", title: "選択A", day: "wed", period: 1, courseType: null, grades: ["1"] },
  { id: "manual-b", title: "選択B", day: "wed", period: 2, courseType: null, grades: ["1"] },
  { id: "required-overlap", title: "必修重複", day: "tue", period: 1, courseType: null, grades: ["1"] },
];

assert.deepEqual(model.uniqueCourseIds(records), ["multi", "overlap", "required", "wide", "manual-a", "manual-b", "required-overlap"]);
assert.deepEqual(
  model.recordsForCourse(records, "multi").map(model.slotKey),
  ["mon-1", "mon-2"],
  "the same course remains visible in every occupied slot",
);
assert.deepEqual(
  model.recordsForSlot(records, "mon", 2).map((record) => record.id),
  ["multi", "overlap"],
  "only the focused day and period are returned",
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
assert.deepEqual(blockedOverlap.manualConflictIds, ["multi"]);
assert.deepEqual(blockedOverlap.requiredConflictIds, []);

const singleReplacement = model.replaceCourse({
  records,
  selectedIds: selectedMulti.selectedIds,
  requiredIds: new Set(),
  courseId: "overlap",
});
assert.equal(singleReplacement.changed, true);
assert.equal(singleReplacement.reason, "replaced");
assert.deepEqual(singleReplacement.removedCourseIds, ["multi"]);
assert.deepEqual([...singleReplacement.selectedIds], ["overlap"], "single replacement is applied as one state update");

const multipleReplacement = model.replaceCourse({
  records,
  selectedIds: new Set(["manual-a", "manual-b"]),
  requiredIds: new Set(),
  courseId: "wide",
});
assert.equal(multipleReplacement.changed, true);
assert.deepEqual(multipleReplacement.removedCourseIds, ["manual-a", "manual-b"]);
assert.deepEqual([...multipleReplacement.selectedIds], ["wide"], "all manual conflicts are removed before the target is selected");
assert.equal(model.conflictEntries(records, multipleReplacement.selectedIds).length, 0);

const requiredBlockedReplacement = model.replaceCourse({
  records,
  selectedIds: new Set(["required"]),
  requiredIds: new Set(["required"]),
  courseId: "required-overlap",
});
assert.equal(requiredBlockedReplacement.changed, false);
assert.equal(requiredBlockedReplacement.reason, "required-conflict");
assert.deepEqual(requiredBlockedReplacement.requiredConflictIds, ["required"]);
assert.deepEqual([...requiredBlockedReplacement.selectedIds], ["required"], "required courses are never removed by replacement");

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
