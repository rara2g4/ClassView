"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const personal = require("../../../js/personal-timetable.js");
const personalUi = require("../../../js/personal-timetable-ui.js");

const repoRoot = path.resolve(__dirname, "../../..");
const wizardSource = fs.readFileSync(path.join(repoRoot, "js/personal-timetable-wizard.js"), "utf8");
const productionManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "data/timetable/manifest.json"), "utf8"));

for (const htmlName of ["index.html", "timetable.html"]) {
  const html = fs.readFileSync(path.join(repoRoot, htmlName), "utf8");
  assert.match(html, /data-personal-step="1"/);
  assert.match(html, /data-personal-step="2"/);
  assert.match(html, /data-personal-step="3"/);
  assert.match(html, /data-personal-step="4"/);
  assert.match(html, /id="personal-day-tabs"/);
  assert.match(html, /id="personal-period-tabs"/);
  assert.match(html, /id="personal-weekly-summary"/);
  assert.match(html, /id="personal-conflict-dialog"/);
  assert.equal(html.includes("personal-course-selector"), false);
  assert.equal(html.includes("personal-filter-dialog"), false);
}

assert.match(wizardSource, /createDraftProfile/);
assert.match(wizardSource, /updateManualSelection/);
assert.match(wizardSource, /replaceManualSelection/);
assert.match(wizardSource, /periodContextForDate/);
assert.match(wizardSource, /personal\.matchAudience/);
assert.match(wizardSource, /aria-haspopup/);
assert.match(wizardSource, /arrow-left-right/);
assert.match(wizardSource, /calendar-x/);
assert.match(wizardSource, /lock-keyhole/);
assert.equal(wizardSource.includes("PersonalTimetableMock"), false);
assert.equal(wizardSource.includes("localStorage"), false);

const productionPeriod = personal.periodContextForDate("2025-04-07", productionManifest);
assert.equal(productionPeriod.valid, false);
assert.equal(productionPeriod.currentPeriod, null);
assert.match(productionPeriod.errors[0], /resolved term/);

const fixtureManifest = {
  academicYear: "2025",
  version: "fixture-v1",
  termPeriods: [{ term: "first", startDate: "2025-04-01", endDate: "2025-09-30" }],
  homerooms: [{ id: "grade1-1", grade: 1, label: "1組" }],
};
const fixtureCourses = [
  { id: "required-a", title: "必修A", courseType: "必修" },
  { id: "manual-a", title: "選択A", courseType: "選択" },
  { id: "manual-b", title: "選択B", courseType: "選択" },
];
const fixtureEntry = (courseId, weekday, period) => ({
  entryId: `${courseId}-${weekday}-${period}`,
  dateKey: `2025-04-0${weekday + 6}`,
  weekday,
  period,
  kind: "class",
  courseId,
  grades: [1],
  homeroomIds: ["grade1-1"],
});
const fixtureEntries = [
  fixtureEntry("required-a", 1, 1),
  fixtureEntry("manual-a", 1, 2),
  fixtureEntry("manual-a", 1, 3),
  fixtureEntry("manual-b", 1, 2),
];
const draft = personalUi.createDraftProfile({
  currentProfile: null,
  identity: { academicYear: "2025", term: "first", grade: 1, homeroomId: "grade1-1" },
  dataVersion: { site: "fixture-site", timetable: "fixture-v1" },
});
assert.equal(draft.ok, true);
const model = personalUi.buildModel({
  manifest: fixtureManifest,
  dateKey: "2025-04-07",
  courses: fixtureCourses,
  entries: fixtureEntries,
  profileLoad: { status: "ready", profile: draft.profile },
  dataVersion: { site: "fixture-site", timetable: "fixture-v1" },
});
assert.equal(model.active, true);
assert.deepEqual(model.enrollment.requiredCourseIds, ["required-a"]);
assert.deepEqual(
  model.conflicts.slotsByCourse.find((item) => item.courseId === "manual-a").slots,
  [{ weekday: 1, period: 2 }, { weekday: 1, period: 3 }],
  "a course occupying multiple periods remains one course with multiple visible slots",
);
const selected = personalUi.updateManualSelection(model, "manual-a");
assert.equal(selected.changed, true);
const selectedProfile = personal.createProfile({ ...draft.profile, manualSelectedCourseIds: selected.courseIds }).profile;
const selectedModel = personalUi.buildModel({
  manifest: fixtureManifest,
  dateKey: "2025-04-07",
  courses: fixtureCourses,
  entries: fixtureEntries,
  profileLoad: { status: "ready", profile: selectedProfile },
  dataVersion: { site: "fixture-site", timetable: "fixture-v1" },
});
const replacement = personalUi.replaceManualSelection(selectedModel, "manual-b");
assert.equal(replacement.changed, true);
assert.deepEqual(replacement.courseIds, ["manual-b"]);

console.log("Personal timetable B production integration tests passed.");
