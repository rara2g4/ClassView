"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const personal = require("../../../js/personal-timetable.js");
const ui = require("../../../js/personal-timetable-ui.js");

const demoRoot = path.resolve(__dirname, "../../../data/demo");
const manifest = JSON.parse(fs.readFileSync(path.join(demoRoot, "timetable/manifest.json"), "utf8"));
const courses = JSON.parse(fs.readFileSync(path.join(demoRoot, "courses.json"), "utf8")).courses;
const month = JSON.parse(fs.readFileSync(path.join(demoRoot, "timetable/2026-11.json"), "utf8"));
const entries = personal.flattenTimetableDays(month.days);
const dataVersion = { site: "demo-site", timetable: manifest.version };
const originalCourseIds = [
  "demo-digital-foundations",
  "demo-communication-basics",
  "demo-visual-design",
  "demo-game-prototyping",
  "demo-cross-media",
  "demo-long-title",
  "demo-web-creative",
  "demo-elective-required",
  "demo-type-unconfirmed",
  "demo-required-overlap",
  "demo-homeroom-one",
  "demo-homeroom-two",
  "demo-grade-two-required",
  "demo-grade-two-elective",
  "demo-grade-two-one",
  "demo-grade-two-two",
  "demo-grade-three-required",
  "demo-grade-three-elective",
  "demo-grade-three-one",
  "demo-grade-three-two",
];
const profileMetrics = [];

assert.equal(personal.resolveTermForDate("2026-04-01", manifest), "first");
assert.equal(personal.resolveTermForDate("2026-11-02", manifest), "second");
assert.ok(courses.length >= 100 && courses.length <= 140, "demo catalog contains 100–140 courses");
assert.deepEqual(
  originalCourseIds.filter((courseId) => !courses.some((course) => course.id === courseId)),
  [],
  "all original demo course IDs remain available",
);

for (const homeroom of manifest.homerooms) {
  const created = personal.createProfile({
    academicYear: manifest.academicYear,
    term: "second",
    grade: homeroom.grade,
    homeroomId: homeroom.id,
    manualSelectedCourseIds: [],
    dataVersion,
  });
  assert.equal(created.ok, true, `${homeroom.id} profile is valid`);
  const model = ui.buildModel({
    manifest,
    dateKey: "2026-11-02",
    courses,
    entries,
    profileLoad: { status: "ready", profile: created.profile },
    dataVersion,
  });
  assert.equal(model.active, true, `${homeroom.id} demo model is active`);
  assert.ok(model.enrollment.requiredCourseIds.length > 0, `${homeroom.id} has a required course`);
  const slotsByCourse = new Map(
    model.conflicts.slotsByCourse.map((item) => [item.courseId, item.slots]),
  );
  const requiredCourseIds = new Set(model.enrollment.requiredCourseIds);
  const applicableElectives = model.conflicts.candidateStates.filter(
    (candidate) => slotsByCourse.has(candidate.courseId) && !requiredCourseIds.has(candidate.courseId),
  );
  const selectableElectives = applicableElectives.filter(
    (candidate) => !candidate.selected && candidate.selectable,
  );
  assert.ok(
    selectableElectives.length >= 25,
    `${homeroom.id} has at least 25 actually selectable electives`,
  );
  assert.ok(
    selectableElectives.length / applicableElectives.length >= 0.7,
    `${homeroom.id} keeps at least 70% of elective candidates selectable after required courses`,
  );

  const slotCounts = new Map();
  for (const candidate of selectableElectives) {
    for (const slot of slotsByCourse.get(candidate.courseId)) {
      const slotKey = `${slot.weekday}-${slot.period}`;
      slotCounts.set(slotKey, (slotCounts.get(slotKey) || 0) + 1);
    }
  }
  const counts = [...slotCounts.values()];
  assert.ok(
    slotCounts.size >= 15,
    `${homeroom.id} has selectable electives in at least 15 of 20 slots (actual: ${slotCounts.size}; ${JSON.stringify(Object.fromEntries(slotCounts))})`,
  );
  assert.ok(
    counts.filter((count) => count >= 2 && count <= 4).length >= 10,
    `${homeroom.id} has many slots with two to four selectable candidates`,
  );
  assert.ok(
    counts.some((count) => count >= 6 && count <= 10),
    `${homeroom.id} has a busy slot with six to ten selectable candidates`,
  );
  const multiSlotElectives = selectableElectives.filter(
    (candidate) => slotsByCourse.get(candidate.courseId).length > 1,
  );
  assert.ok(
    multiSlotElectives.length >= 4,
    `${homeroom.id} has several selectable multi-slot courses`,
  );
  profileMetrics.push({
    profile: homeroom.id,
    grade: homeroom.grade,
    applicableElectives: applicableElectives.length,
    selectableElectives: selectableElectives.length,
    blockedByRequired: applicableElectives.length - selectableElectives.length,
    coveredSlots: slotCounts.size,
    twoToFourCandidateSlots: counts.filter((count) => count >= 2 && count <= 4).length,
    busiestSlotCandidates: Math.max(...counts),
    selectableMultiSlotCourses: multiSlotElectives.length,
  });
}

const gradeOneProfile = personal.createProfile({
  academicYear: manifest.academicYear,
  term: "second",
  grade: 1,
  homeroomId: "demo-grade1-1",
  manualSelectedCourseIds: ["demo-visual-design", "demo-game-prototyping"],
  dataVersion,
}).profile;
const gradeOneModel = ui.buildModel({
  manifest,
  dateKey: "2026-11-02",
  courses,
  entries,
  profileLoad: { status: "ready", profile: gradeOneProfile },
  dataVersion,
});

assert.deepEqual(
  new Set(gradeOneModel.enrollment.requiredCourseIds),
  new Set(["demo-digital-foundations", "demo-communication-basics"]),
);
assert.deepEqual(
  gradeOneModel.conflicts.slotsByCourse.find((item) => item.courseId === "demo-digital-foundations").slots,
  [{ weekday: 1, period: 1 }, { weekday: 1, period: 2 }],
  "the same required course occupies both periods",
);

const crossState = gradeOneModel.conflicts.candidateStates.find(
  (item) => item.courseId === "demo-cross-media",
);
assert.equal(crossState.selectable, false);
assert.deepEqual(
  new Set(crossState.conflicts.map((conflict) => conflict.courseId)),
  new Set(["demo-visual-design", "demo-game-prototyping"]),
);
const replacement = ui.replaceManualSelection(gradeOneModel, "demo-cross-media");
assert.equal(replacement.changed, true);
assert.deepEqual(
  new Set(replacement.removedCourseIds),
  new Set(["demo-visual-design", "demo-game-prototyping"]),
);
assert.deepEqual(replacement.courseIds, ["demo-cross-media"]);

const requiredConflict = ui.replaceManualSelection(gradeOneModel, "demo-required-overlap");
assert.equal(requiredConflict.changed, false);
assert.equal(requiredConflict.reason, "required-conflict");
assert.deepEqual(requiredConflict.requiredConflictIds, ["demo-digital-foundations"]);

const gradeOneCandidates = gradeOneModel.conflicts.candidateStates.filter((candidate) =>
  gradeOneModel.conflicts.slotsByCourse.some((item) =>
    item.courseId === candidate.courseId && item.slots.some((slot) => slot.weekday === 1 && slot.period === 3),
  ),
);
assert.ok(gradeOneCandidates.length >= 7, "busy demo slot has at least seven candidates");
assert.equal(courses.some((course) => course.courseType === "選択必修"), true);
assert.equal(courses.some((course) => course.courseType === null), true);
assert.equal(entries.some((entry) => entry.kind === "event" && entry.courseId === null), true);

console.log(JSON.stringify({ totalCourses: courses.length, profileMetrics }, null, 2));
console.log("Personal timetable demo integration tests passed.");
