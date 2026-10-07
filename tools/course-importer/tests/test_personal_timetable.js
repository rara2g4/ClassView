"use strict";

const assert = require("node:assert/strict");
const personal = require("../../../js/personal-timetable.js");

const fixedNow = "2026-09-12T00:00:00.000Z";
const dataVersion = { site: "site-v1", timetable: "table-v1" };
const baseProfileInput = {
  academicYear: "2026",
  term: "前期",
  grade: 2,
  homeroom: "1組",
  manualSelectedCourseIds: ["manual-course"],
  dataVersion,
};
const profileResult = personal.createProfile(baseProfileInput, { now: fixedNow });
assert.equal(profileResult.ok, true);
const profile = profileResult.profile;
assert.equal(profile.schemaVersion, 1);
assert.equal(profile.updatedAt, fixedNow);
assert.deepEqual(Object.keys(profile).sort(), [
  "academicYear",
  "dataVersion",
  "grade",
  "homeroom",
  "manualSelectedCourseIds",
  "schemaVersion",
  "term",
  "updatedAt",
]);
assert.equal(Object.hasOwn(profile, "name"), false);
assert.equal(Object.hasOwn(profile, "requiredCourseIds"), false);

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    has: (key) => values.has(key),
  };
};

const storage = memoryStorage();
assert.deepEqual(personal.loadProfile(storage), {
  status: "unset",
  profile: null,
  error: null,
});
assert.equal(personal.saveProfile(storage, profile).status, "saved");
assert.equal(storage.has(personal.STORAGE_KEY), true);
assert.deepEqual(personal.loadProfile(storage).profile, profile);

const malformedJsonStorage = { getItem: () => "{" };
assert.equal(personal.loadProfile(malformedJsonStorage).error, "malformed_json");
const malformedProfileStorage = { getItem: () => JSON.stringify({ schemaVersion: 1 }) };
assert.equal(personal.loadProfile(malformedProfileStorage).error, "invalid_profile");
const futureStorage = { getItem: () => JSON.stringify({ schemaVersion: 2 }) };
assert.equal(personal.loadProfile(futureStorage).status, "unsupported");
const missingVersionStorage = { getItem: () => JSON.stringify({ ...profile, schemaVersion: undefined }) };
assert.equal(personal.loadProfile(missingVersionStorage).status, "malformed");
const malformedVersionStorage = { getItem: () => JSON.stringify({ ...profile, schemaVersion: "2" }) };
assert.equal(personal.loadProfile(malformedVersionStorage).status, "malformed");
assert.equal(personal.saveProfile(storage, { ...profile, schemaVersion: undefined }).status, "malformed");
assert.equal(personal.saveProfile(storage, { ...profile, schemaVersion: "2" }).status, "malformed");
assert.equal(personal.saveProfile(storage, { ...profile, schemaVersion: 2 }).status, "unsupported");
assert.equal(personal.loadProfile(null).error, "storage_unavailable");
assert.equal(personal.resolveBrowserStorage().status, "unavailable");
assert.equal(personal.loadProfile({ getItem: () => { throw new Error("blocked"); } }).error, "read_failed");
assert.equal(
  personal.resolveBrowserStorage({
    get localStorage() { throw new Error("blocked"); },
  }).status,
  "unavailable",
);
assert.equal(
  personal.saveProfile({ setItem: () => { throw new Error("quota"); } }, profile).error,
  "write_failed",
);
assert.equal(
  personal.createProfile({ ...baseProfileInput, email: "not-stored@example.com" }, { now: fixedNow }).ok,
  true,
);
assert.equal(
  personal.validateProfile({ ...profile, email: "not-allowed@example.com" }).valid,
  false,
);

const currentCourses = [{ id: "manual-course" }, { id: "required-course" }];
assert.equal(
  personal.reconcileProfile(profile, {
    academicYear: "2027",
    term: "前期",
    courses: currentCourses,
  }).status,
  "period-changed",
);
assert.deepEqual(
  personal.reconcileProfile(profile, {
    academicYear: "2027",
    term: "前期",
    courses: currentCourses,
  }).validManualSelectedCourseIds,
  [],
);
assert.equal(
  personal.reconcileProfile(profile, {
    academicYear: "2026",
    term: "後期",
    courses: currentCourses,
  }).requiresReconfiguration,
  true,
);
const staleProfile = {
  ...profile,
  manualSelectedCourseIds: ["manual-course", "deleted-course"],
};
const reconciled = personal.reconcileProfile(staleProfile, {
  academicYear: "2026",
  term: "前期",
  courses: currentCourses,
  dataVersion: { site: "site-v2", timetable: "table-v1" },
});
assert.equal(reconciled.status, "stale-selections");
assert.deepEqual(reconciled.validManualSelectedCourseIds, ["manual-course"]);
assert.deepEqual(reconciled.staleManualSelectedCourseIds, ["deleted-course"]);
assert.equal(reconciled.dataVersionChanged, true);

const course = (id, courseType = "選択", category = "AI・データ") => ({
  id,
  title: id,
  courseType,
  category,
});
let entrySequence = 0;
const entry = (courseId, overrides = {}) => ({
  entryId: "entry-" + courseId + "-" + String(entrySequence += 1),
  courseId,
  grades: [2],
  groupTags: ["1組"],
  kind: "class",
  period: 1,
  dateKey: "2025-04-21",
  ...overrides,
});
const requiredCourse = course("required-course", "必修");
const selectableCourse = course("manual-course", "選択");
const electiveRequired = course("elective-required", "選択必修");
const nullType = course("null-type", null);
const knownHomeroomGroups = ["1組", "2組"];
const currentPeriod = { academicYear: "2026", term: "前期", dataVersion };

const requiredIds = (courses, entries) => personal.deriveRequiredCourses({
  courses,
  entries,
  profile,
  knownHomeroomGroups,
}).requiredCourseIds;

assert.deepEqual(requiredIds([requiredCourse], [entry("required-course")]), ["required-course"]);
assert.deepEqual(requiredIds([selectableCourse], [entry("manual-course")]), []);
assert.deepEqual(requiredIds([electiveRequired], [entry("elective-required")]), []);
assert.deepEqual(requiredIds([nullType], [entry("null-type")]), []);
assert.deepEqual(requiredIds([requiredCourse], [entry("required-course", { grades: [1] })]), []);
assert.deepEqual(requiredIds([requiredCourse], [entry("required-course", { grades: [] })]), []);
assert.deepEqual(requiredIds([requiredCourse], [entry("required-course", { groupTags: ["2組"] })]), []);
assert.deepEqual(requiredIds([requiredCourse], [entry("required-course", { groupTags: [] })]), ["required-course"]);
assert.deepEqual(requiredIds([requiredCourse], [entry("required-course", { groupTags: ["A組"] })]), []);
assert.equal(
  personal.matchAudience(entry("required-course", { groupTags: ["A組"] }), profile, { knownHomeroomGroups }).group,
  "unknown",
);
assert.deepEqual(requiredIds([], [entry("missing-course")]), []);

const enrollment = personal.deriveEffectiveEnrollment({
  courses: [requiredCourse, selectableCourse],
  entries: [entry("required-course")],
  profile: {
    ...profile,
    manualSelectedCourseIds: ["manual-course", "required-course", "deleted-course"],
  },
  currentPeriod,
  knownHomeroomGroups,
});
assert.deepEqual(enrollment.requiredCourseIds, ["required-course"]);
assert.deepEqual(enrollment.validManualSelectedCourseIds, ["manual-course", "required-course"]);
assert.deepEqual(enrollment.staleManualSelectedCourseIds, ["deleted-course"]);
assert.deepEqual(enrollment.effectiveCourseIds, ["required-course", "manual-course"]);
assert.deepEqual(enrollment.items, [
  { courseId: "required-course", required: true, manual: true },
  { courseId: "manual-course", required: false, manual: true },
]);
const manualOnly = personal.deriveEffectiveEnrollment({
  courses: [selectableCourse],
  entries: [],
  profile,
  currentPeriod,
  knownHomeroomGroups,
});
assert.deepEqual(manualOnly.effectiveCourseIds, ["manual-course"]);
const requiredOnly = personal.deriveEffectiveEnrollment({
  courses: [requiredCourse],
  entries: [entry("required-course")],
  profile: { ...profile, manualSelectedCourseIds: [] },
  currentPeriod,
  knownHomeroomGroups,
});
assert.deepEqual(requiredOnly.effectiveCourseIds, ["required-course"]);

const termMismatchEnrollment = personal.deriveEffectiveEnrollment({
  courses: [selectableCourse],
  entries: [],
  profile,
  currentPeriod: { ...currentPeriod, term: "後期" },
  knownHomeroomGroups,
});
assert.equal(termMismatchEnrollment.requiresReconfiguration, true);
assert.deepEqual(termMismatchEnrollment.validManualSelectedCourseIds, []);
assert.deepEqual(termMismatchEnrollment.effectiveCourseIds, []);
const yearMismatchEnrollment = personal.deriveEffectiveEnrollment({
  courses: [selectableCourse],
  entries: [],
  profile,
  currentPeriod: { ...currentPeriod, academicYear: "2027" },
  knownHomeroomGroups,
});
assert.equal(yearMismatchEnrollment.requiresReconfiguration, true);
assert.deepEqual(yearMismatchEnrollment.validManualSelectedCourseIds, []);
assert.deepEqual(yearMismatchEnrollment.effectiveCourseIds, []);

const conflictCourses = [
  course("required-a", "必修"),
  course("required-b", "必修"),
  course("manual-a"),
  course("manual-b"),
  course("candidate"),
  course("free"),
];
const conflictEntries = [
  entry("required-a", { period: 1, dateKey: "2025-04-21" }),
  entry("required-a", { period: 2, dateKey: "2025-04-21" }),
  entry("required-b", { period: 2, dateKey: "2025-04-21" }),
  entry("required-b", { period: 3, dateKey: "2025-04-21" }),
  entry("manual-a", { period: 2, dateKey: "2025-04-21" }),
  entry("manual-b", { period: 1, dateKey: "2025-04-21" }),
  entry("candidate", { period: 1, dateKey: "2025-04-21" }),
  entry("candidate", { period: 2, dateKey: "2025-04-21" }),
  entry("free", { period: 1, dateKey: "2025-04-22" }),
];
const conflictEnrollment = {
  effectiveCourseIds: ["required-a", "required-b", "manual-a"],
  requiredCourseIds: ["required-a", "required-b"],
  validManualSelectedCourseIds: ["manual-a"],
  items: [
    { courseId: "required-a", required: true, manual: false },
    { courseId: "required-b", required: true, manual: false },
    { courseId: "manual-a", required: false, manual: true },
  ],
};
const conflicts = personal.analyzeConflicts({
  courses: conflictCourses,
  entries: conflictEntries,
  enrollment: conflictEnrollment,
});
const candidateState = conflicts.candidateStates.find((state) => state.courseId === "candidate");
assert.equal(candidateState.selectable, false);
assert.equal(candidateState.conflicts.length, 3);
assert.deepEqual(candidateState.conflicts[0].slots, [
  { weekday: 1, period: 1 },
  { weekday: 1, period: 2 },
]);
assert.equal(candidateState.conflicts[0].source, "required");
assert.equal(candidateState.conflicts[2].source, "manual");
assert.equal(conflicts.requiredConflicts.length, 1);
assert.equal(conflicts.requiredConflicts[0].type, "required-required");
assert.deepEqual(conflicts.requiredConflicts[0].slots, [{ weekday: 1, period: 2 }]);
assert.equal(conflicts.candidateStates.find((state) => state.courseId === "free").selectable, true);

const manualConflict = personal.analyzeConflicts({
  courses: conflictCourses,
  entries: conflictEntries,
  enrollment: {
    effectiveCourseIds: ["manual-b"],
    requiredCourseIds: [],
    validManualSelectedCourseIds: ["manual-b"],
    items: [{ courseId: "manual-b", required: false, manual: true }],
  },
  candidateCourseIds: ["candidate"],
});
assert.equal(manualConflict.candidateStates[0].selectable, false);
assert.equal(manualConflict.candidateStates[0].conflicts[0].source, "manual");
const afterDeselect = personal.analyzeConflicts({
  courses: conflictCourses,
  entries: conflictEntries,
  enrollment: { effectiveCourseIds: [], items: [] },
  candidateCourseIds: ["candidate"],
});
assert.equal(afterDeselect.candidateStates[0].selectable, true);
assert.deepEqual(personal.intersectSlots(
  [{ weekday: 1, period: 1 }, { weekday: 1, period: 2 }],
  [{ weekday: 1, period: 2 }, { weekday: 1, period: 3 }],
), [{ weekday: 1, period: 2 }]);

const scopedCourse = course("scoped-course");
const scopedCandidate = course("scoped-candidate");
const scopedEntries = [
  entry("scoped-course", { grades: [2], groupTags: ["1組"], period: 1, dateKey: "2025-04-21" }),
  entry("scoped-course", { grades: [2], groupTags: ["2組"], period: 2, dateKey: "2025-04-22" }),
  entry("scoped-course", { grades: [3], groupTags: ["1組"], period: 3, dateKey: "2025-04-23" }),
  entry("scoped-candidate", { grades: [2], groupTags: ["1組"], period: 2, dateKey: "2025-04-22" }),
];
const scopedConflicts = personal.analyzeConflicts({
  courses: [scopedCourse, scopedCandidate],
  entries: scopedEntries,
  enrollment: {
    effectiveCourseIds: ["scoped-course"],
    requiredCourseIds: [],
    validManualSelectedCourseIds: ["scoped-course"],
    items: [{ courseId: "scoped-course", required: false, manual: true }],
  },
  profile,
  knownHomeroomGroups,
  candidateCourseIds: ["scoped-candidate"],
});
assert.equal(scopedConflicts.candidateStates[0].selectable, true);
assert.deepEqual(
  scopedConflicts.slotsByCourse.find((item) => item.courseId === "scoped-course").slots,
  [{ weekday: 1, period: 1 }],
);

const unknownScopeCourse = course("unknown-scope-course");
const unknownScopeCandidate = course("unknown-scope-candidate");
const unknownScopeConflicts = personal.analyzeConflicts({
  courses: [unknownScopeCourse, unknownScopeCandidate],
  entries: [
    entry("unknown-scope-course", { grades: [], groupTags: [], period: 1 }),
    entry("unknown-scope-course", { grades: [2], groupTags: ["A組"], period: 2 }),
    entry("unknown-scope-candidate", { grades: [2], groupTags: ["1組"], period: 1 }),
  ],
  enrollment: {
    effectiveCourseIds: ["unknown-scope-course"],
    requiredCourseIds: [],
    validManualSelectedCourseIds: ["unknown-scope-course"],
    items: [{ courseId: "unknown-scope-course", required: false, manual: true }],
  },
  profile,
  knownHomeroomGroups,
  candidateCourseIds: ["unknown-scope-candidate"],
});
assert.equal(unknownScopeConflicts.candidateStates[0].selectable, true);
assert.equal(unknownScopeConflicts.scopeDiagnostics.unknownScopedEntries.length, 2);

const audienceEntry = (kind, overrides = {}) => entry(null, {
  courseId: null,
  kind,
  grades: [2],
  groupTags: ["1組"],
  ...overrides,
});
for (const kind of ["holiday", "event", "special", "other"]) {
  assert.equal(
    personal.entryVisibility(audienceEntry(kind), profile, [], { knownHomeroomGroups }).visible,
    true,
  );
}
assert.equal(
  personal.entryVisibility(audienceEntry("holiday", { grades: [] }), profile, [], { knownHomeroomGroups }).visible,
  false,
);
assert.equal(
  personal.entryVisibility(audienceEntry("exam", { courseId: "manual-course" }), profile, ["manual-course"], { knownHomeroomGroups }).visible,
  true,
);
assert.equal(
  personal.entryVisibility(audienceEntry("exam", { courseId: "other-course" }), profile, ["manual-course"], { knownHomeroomGroups }).visible,
  false,
);
assert.equal(
  personal.entryVisibility(audienceEntry("exam"), profile, [], { knownHomeroomGroups }).visible,
  true,
);
assert.equal(
  personal.entryVisibility(
    entry("manual-course", { groupTags: ["2組"] }),
    profile,
    ["manual-course"],
    { knownHomeroomGroups },
  ).visible,
  false,
);
assert.equal(
  personal.entryVisibility(
    entry("manual-course", { grades: [] }),
    profile,
    ["manual-course"],
    { knownHomeroomGroups },
  ).visible,
  false,
);
assert.equal(personal.entryVisibility(audienceEntry("unknown"), profile, []).reason, "unknown-kind");

const category = personal.OFFICIAL_CATEGORIES[0];
const filterCourses = [
  course("grade-1", "選択", category),
  course("grade-2", "選択", category),
  course("grade-3", "選択", category),
  course("grade-unknown", "選択", category),
  course("empty-category", "選択", ""),
  course("legacy-category", "選択", "情報・デザイン"),
];
const filterEntries = [
  entry("grade-1", { grades: [1] }),
  entry("grade-2", { grades: [2] }),
  entry("grade-3", { grades: [3] }),
  entry("grade-unknown", { grades: [] }),
  entry("empty-category", { grades: [2] }),
  entry("legacy-category", { grades: [2] }),
];
assert.equal(personal.matchesGradeFilter(filterEntries[0], 1), true);
assert.equal(personal.matchesGradeFilter(filterEntries[0], 2), false);
assert.equal(personal.matchesGradeFilter(filterEntries[1], 2), true);
assert.equal(personal.matchesGradeFilter(filterEntries[2], 3), true);
assert.equal(personal.matchesGradeFilter(filterEntries[3], 1), false);
assert.equal(personal.matchesGradeFilter(filterEntries[3], personal.ALL_FILTER), true);
assert.equal(personal.matchesCategoryFilter(filterCourses[0], category), true);
assert.equal(personal.matchesCategoryFilter(filterCourses[4], category), false);
assert.equal(personal.matchesCategoryFilter(filterCourses[5], category), false);
assert.equal(personal.matchesCategoryFilter({ id: "null-category", category: null }, category), false);
assert.equal(personal.matchesCategoryFilter({ id: "missing-category" }, category), false);
assert.equal(personal.matchesCategoryFilter(filterCourses[5], personal.ALL_FILTER), true);
const filtered = personal.filterCandidateCourses({
  courses: filterCourses,
  entries: filterEntries,
  gradeFilter: 2,
  categoryFilter: category,
  preserveCourseIds: ["grade-1", "legacy-category"],
});
assert.deepEqual(filtered.visibleCourseIds, ["grade-1", "grade-2", "legacy-category"]);
assert.equal(filtered.states.find((state) => state.courseId === "grade-1").preserved, true);
assert.equal(filtered.states.find((state) => state.courseId === "grade-unknown").visible, false);
assert.deepEqual(
  personal.filterCandidateCourses({
    courses: filterCourses,
    entries: filterEntries,
  }).visibleCourseIds,
  filterCourses.map((item) => item.id),
);

const flattened = personal.flattenTimetableDays({
  "2025-04-21": [{ courseId: "manual-course", period: 1 }],
});
assert.equal(flattened[0].dateKey, "2025-04-21");
assert.deepEqual(personal.slotFromEntry(flattened[0]), { weekday: 1, period: 1 });

console.log("Personal timetable Phase 1 tests passed.");
