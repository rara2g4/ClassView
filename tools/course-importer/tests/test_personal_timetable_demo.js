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

assert.equal(personal.resolveTermForDate("2026-04-01", manifest), "first");
assert.equal(personal.resolveTermForDate("2026-11-02", manifest), "second");

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
  const coursesWithSlots = new Set(model.conflicts.slotsByCourse.map((item) => item.courseId));
  assert.equal(
    model.conflicts.candidateStates.some(
      (candidate) => !candidate.selected && candidate.selectable && coursesWithSlots.has(candidate.courseId),
    ),
    true,
    `${homeroom.id} has a selectable course with an applicable timetable slot`,
  );
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

console.log("Personal timetable demo integration tests passed.");
