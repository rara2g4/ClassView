"use strict";

const assert = require("node:assert/strict");
const personal = require("../../../js/personal-timetable.js");
const ui = require("../../../js/personal-timetable-ui.js");

const manifest = {
  academicYear: "2025",
  version: "tt-v1",
  termPeriods: [
    { term: "first", startDate: "2025-04-01", endDate: "2025-09-30" },
    { term: "second", startDate: "2025-10-01", endDate: "2026-03-31" },
  ],
  homerooms: [{ id: "grade1-1", grade: 1, label: "1組" }],
};
const profile = personal.createProfile({
  academicYear: "2025",
  term: "first",
  grade: 1,
  homeroomId: "grade1-1",
  manualSelectedCourseIds: ["manual-a", "missing-course"],
  dataVersion: { site: "site-v1", timetable: "tt-v1" },
}, { now: "2025-04-01T00:00:00.000Z" }).profile;
const courses = [
  { id: "required-a", title: "必修A", courseType: "必修", category: "AI・データ" },
  { id: "manual-a", title: "選択A", courseType: "選択", category: "AI・データ" },
  { id: "manual-b", title: "選択B", courseType: "選択必修", category: "ゲーム制作" },
  { id: "manual-c", title: "選択C", courseType: null, category: "旧分類" },
];
const entry = (courseId, period, extra = {}) => ({
  entryId: `${courseId}-${period}`,
  dateKey: "2025-04-07",
  weekday: 1,
  period,
  kind: "class",
  courseId,
  grades: [1],
  homeroomIds: ["grade1-1"],
  ...extra,
});
const entries = [
  entry("required-a", 1),
  entry("manual-a", 2),
  entry("manual-b", 2),
  entry("manual-c", 3, { grades: [], homeroomIds: null }),
];
const ready = { status: "ready", profile };

assert.equal(ui.initialDisplayMode({ status: "unset", profile: null }), "school");
assert.equal(ui.initialDisplayMode({ status: "unavailable", profile: null }), "school");
assert.equal(ui.initialDisplayMode(ready), "personal");

const model = ui.buildModel({
  manifest,
  dateKey: "2025-04-07",
  courses,
  entries,
  profileLoad: ready,
  dataVersion: { site: "site-v1", timetable: "tt-v1" },
});
assert.equal(model.active, true);
assert.deepEqual(model.enrollment.requiredCourseIds, ["required-a"]);
assert.deepEqual(model.enrollment.validManualSelectedCourseIds, ["manual-a"]);
assert.deepEqual(model.enrollment.staleManualSelectedCourseIds, ["missing-course"]);
assert.equal(model.conflicts.requiredConflicts.length, 0);

const conflictCandidate = model.conflicts.candidateStates.find((item) => item.courseId === "manual-b");
assert.equal(conflictCandidate.selectable, false);
assert.deepEqual(conflictCandidate.conflicts[0].slots, [{ weekday: 1, period: 2 }]);
assert.equal(ui.updateManualSelection(model, "manual-b").reason, "conflict");
assert.equal(ui.updateManualSelection(model, "required-a").reason, "required-course");
assert.deepEqual(
  ui.updateManualSelection(model, "manual-a").courseIds,
  ["missing-course"],
);

const afterDeselectProfile = { ...profile, manualSelectedCourseIds: ["missing-course"] };
const afterDeselect = ui.buildModel({
  manifest,
  dateKey: "2025-04-07",
  courses,
  entries,
  profileLoad: { status: "ready", profile: afterDeselectProfile },
  dataVersion: { site: "site-v1", timetable: "tt-v1" },
});
assert.equal(
  afterDeselect.conflicts.candidateStates.find((item) => item.courseId === "manual-b").selectable,
  true,
);

const gradeFiltered = ui.buildModel({
  manifest,
  dateKey: "2025-04-07",
  courses,
  entries,
  profileLoad: ready,
  gradeFilter: 2,
  categoryFilter: "AI・データ",
  dataVersion: { site: "site-v1", timetable: "tt-v1" },
});
assert.deepEqual(
  new Set(gradeFiltered.filteredCourseIds),
  new Set(["required-a", "manual-a"]),
  "selected and required courses remain visible through discovery filters",
);
const exactCategory = ui.buildModel({
  manifest,
  dateKey: "2025-04-07",
  courses,
  entries,
  profileLoad: { status: "ready", profile: { ...profile, manualSelectedCourseIds: [] } },
  categoryFilter: "ゲーム制作",
  dataVersion: { site: "site-v1", timetable: "tt-v1" },
});
assert.equal(exactCategory.filteredCourseIds.includes("manual-b"), true);
assert.equal(exactCategory.filteredCourseIds.includes("manual-c"), false);

const unresolved = ui.buildModel({
  manifest: { ...manifest, termPeriods: [] },
  dateKey: "2025-04-07",
  courses,
  entries,
  profileLoad: ready,
});
assert.equal(unresolved.active, false);
assert.equal(unresolved.reason, "term-unresolved");
assert.deepEqual(unresolved.enrollment.effectiveCourseIds, []);

const unresolvedScope = model.conflicts.scopeDiagnostics.unknownScopedEntries;
assert.equal(unresolvedScope.some((item) => item.courseId === "manual-c"), true);

assert.deepEqual(
  ui.manualSelectionsForSettings(profile, {
    academicYear: "2025", term: "first", grade: 1, homeroomId: "grade1-1",
  }),
  ["manual-a", "missing-course"],
);
assert.deepEqual(
  ui.manualSelectionsForSettings(profile, {
    academicYear: "2025", term: "first", grade: 2, homeroomId: "grade2-1",
  }),
  [],
  "profile identity changes do not guess how old selections transfer",
);
assert.equal(ui.filterSummary({ grade: "all", category: "all" }), "すべて");
assert.equal(ui.filterSummary({ grade: 2, category: "ゲーム制作" }), "2年 / ゲーム制作");
assert.deepEqual(ui.courseTypePresentation(null), { code: "?", label: "区分未確認", kind: "unknown" });

console.log("Personal timetable UI integration tests passed.");
