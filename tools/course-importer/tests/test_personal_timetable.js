"use strict";

const assert = require("node:assert/strict");
const personal = require("../../../js/personal-timetable.js");

const fixedNow = "2026-09-12T00:00:00.000Z";
const dataVersion = { site: "site-v1", timetable: "table-v1" };
const baseProfileInput = {
  academicYear: "2026",
  term: "first",
  grade: 2,
  homeroomId: "grade2-1",
  manualSelectedCourseIds: ["manual-course"],
  dataVersion,
};
const profileResult = personal.createProfile(baseProfileInput, { now: fixedNow });
assert.equal(profileResult.ok, true);
const profile = profileResult.profile;
assert.equal(profile.schemaVersion, 2);
assert.equal(profile.updatedAt, fixedNow);
assert.deepEqual(Object.keys(profile).sort(), [
  "academicYear",
  "dataVersion",
  "grade",
  "homeroomId",
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

const legacyProfile = {
  schemaVersion: 1,
  academicYear: "2026",
  term: "前期",
  grade: 2,
  homeroom: "1組",
  manualSelectedCourseIds: ["manual-course"],
  dataVersion,
  updatedAt: fixedNow,
};
const legacyStorage = { getItem: () => JSON.stringify(legacyProfile) };
const migratedLegacy = personal.loadProfile(legacyStorage, {
  homerooms: [{ id: "grade2-1", grade: 2, label: "1組" }],
});
assert.equal(migratedLegacy.status, "migrated");
assert.equal(migratedLegacy.profile.schemaVersion, 2);
assert.equal(migratedLegacy.profile.term, "first");
assert.equal(migratedLegacy.profile.homeroomId, "grade2-1");
const ambiguousLegacy = personal.loadProfile(legacyStorage, {
  homerooms: [
    { id: "grade2-1", grade: 2, label: "1組" },
    { id: "grade2-one", grade: 2, label: "1組" },
  ],
});
assert.equal(ambiguousLegacy.status, "needs-reconfiguration");
assert.equal(ambiguousLegacy.requiresReconfiguration, true);

const malformedJsonStorage = { getItem: () => "{" };
assert.equal(personal.loadProfile(malformedJsonStorage).error, "malformed_json");
const malformedProfileStorage = { getItem: () => JSON.stringify({ schemaVersion: 1 }) };
assert.equal(personal.loadProfile(malformedProfileStorage).error, "invalid_profile");
const futureStorage = { getItem: () => JSON.stringify({ schemaVersion: 3 }) };
assert.equal(personal.loadProfile(futureStorage).status, "unsupported");
const missingVersionStorage = { getItem: () => JSON.stringify({ ...profile, schemaVersion: undefined }) };
assert.equal(personal.loadProfile(missingVersionStorage).status, "malformed");
const malformedVersionStorage = { getItem: () => JSON.stringify({ ...profile, schemaVersion: "2" }) };
assert.equal(personal.loadProfile(malformedVersionStorage).status, "malformed");
assert.equal(personal.saveProfile(storage, { ...profile, schemaVersion: undefined }).status, "malformed");
assert.equal(personal.saveProfile(storage, { ...profile, schemaVersion: "2" }).status, "malformed");
assert.equal(personal.saveProfile(storage, { ...profile, schemaVersion: 3 }).status, "unsupported");
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

const { schemaVersion: _schemaVersion, ...profileWithoutSchemaVersion } = profile;
const assertSchemaVersionDiagnostic = (candidate, expected) => {
  const validation = personal.validateProfile(candidate);
  assert.equal(validation.valid, false);
  assert.equal(
    validation.errors.some((error) => error.includes("unsupported")),
    expected === "unsupported",
  );
  assert.equal(
    validation.errors.some((error) => error.includes("invalid")),
    expected === "malformed",
  );
};
assertSchemaVersionDiagnostic(profileWithoutSchemaVersion, "malformed");
assertSchemaVersionDiagnostic({ ...profile, schemaVersion: null }, "malformed");
assertSchemaVersionDiagnostic({ ...profile, schemaVersion: "2" }, "malformed");
assertSchemaVersionDiagnostic({ ...profile, schemaVersion: 0 }, "malformed");
assertSchemaVersionDiagnostic({ ...profile, schemaVersion: -1 }, "malformed");
assertSchemaVersionDiagnostic({ ...profile, schemaVersion: 1.5 }, "malformed");
assertSchemaVersionDiagnostic({ ...profile, schemaVersion: 3 }, "unsupported");

const annualManifest = {
  academicYear: "2026",
  title: "表示上は後期と書かれていても解析しない",
  filename: "前期時間割.xlsx",
  termPeriods: [
    { term: "first", startDate: "2026-04-01", endDate: "2026-09-30" },
    { term: "second", startDate: "2026-10-01", endDate: "2027-03-31" },
  ],
};
assert.equal(personal.resolveTermForDate("2026-04-21", annualManifest), "first");
assert.equal(personal.resolveTermForDate("2026-10-21", annualManifest), "second");
assert.equal(personal.resolveTermForDate("2026-03-31", annualManifest), "unresolved");
assert.deepEqual(
  personal.periodContextForDate("2026-04-21", annualManifest),
  {
    valid: true,
    currentPeriod: { academicYear: "2026", term: "first" },
    errors: [],
  },
);
assert.equal(
  personal.periodContextForDate("2026-04-21", { academicYear: "2026", termPeriods: [] }).valid,
  false,
);
assert.equal(personal.validateTermPeriods([
  { term: "first", startDate: "2026-04-01", endDate: "2026-10-01" },
  { term: "second", startDate: "2026-10-01", endDate: "2027-03-31" },
]).valid, false);
assert.equal(personal.validateTermPeriods([
  { term: "first", startDate: "2026-04-01", endDate: "2026-09-30" },
  { term: "first", startDate: "2026-10-01", endDate: "2027-03-31" },
]).valid, false);
for (const periods of [
  [{ term: "first", startDate: "2026-02-30", endDate: "2026-09-30" }],
  [{ term: "first", startDate: "2026-09-30", endDate: "2026-04-01" }],
]) {
  assert.equal(personal.validateTermPeriods(periods).valid, false);
}

const currentCourses = [{ id: "manual-course" }, { id: "required-course" }];
assert.equal(
  personal.reconcileProfile(profile, {
    academicYear: "2027",
    term: "first",
    courses: currentCourses,
  }).status,
  "period-changed",
);
assert.deepEqual(
  personal.reconcileProfile(profile, {
    academicYear: "2027",
    term: "first",
    courses: currentCourses,
  }).validManualSelectedCourseIds,
  [],
);
assert.equal(
  personal.reconcileProfile(profile, {
    academicYear: "2026",
    term: "second",
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
  term: "first",
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
  groupTags: ["A組"],
  homeroomIds: ["grade2-1"],
  kind: "class",
  period: 1,
  dateKey: "2025-04-21",
  ...overrides,
});
const requiredCourse = course("required-course", "必修");
const selectableCourse = course("manual-course", "選択");
const electiveRequired = course("elective-required", "選択必修");
const nullType = course("null-type", null);
const currentPeriod = { academicYear: "2026", term: "first", dataVersion };

const requiredIds = (courses, entries) => personal.deriveRequiredCourses({
  courses,
  entries,
  profile,
}).requiredCourseIds;

assert.deepEqual(requiredIds([requiredCourse], [entry("required-course")]), ["required-course"]);
assert.deepEqual(requiredIds([selectableCourse], [entry("manual-course")]), []);
assert.deepEqual(requiredIds([electiveRequired], [entry("elective-required")]), []);
assert.deepEqual(requiredIds([nullType], [entry("null-type")]), []);
assert.deepEqual(requiredIds([requiredCourse], [entry("required-course", { grades: [1] })]), []);
assert.deepEqual(requiredIds([requiredCourse], [entry("required-course", { grades: [] })]), []);
assert.deepEqual(requiredIds([requiredCourse], [entry("required-course", { homeroomIds: ["grade2-2"] })]), []);
assert.deepEqual(requiredIds([requiredCourse], [entry("required-course", { homeroomIds: [] })]), ["required-course"]);
assert.deepEqual(requiredIds([requiredCourse], [entry("required-course", { homeroomIds: null })]), []);
assert.equal(
  personal.matchAudience(entry("required-course", { groupTags: ["A組"], homeroomIds: null }), profile).homeroom,
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
});
assert.deepEqual(enrollment.requiredCourseIds, ["required-course"]);
assert.equal(enrollment.status, "stale-selections");
assert.equal(enrollment.requiresReconfiguration, false);
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
});
assert.deepEqual(manualOnly.effectiveCourseIds, ["manual-course"]);
const requiredOnly = personal.deriveEffectiveEnrollment({
  courses: [requiredCourse],
  entries: [entry("required-course")],
  profile: { ...profile, manualSelectedCourseIds: [] },
  currentPeriod,
});
assert.deepEqual(requiredOnly.effectiveCourseIds, ["required-course"]);

const termMismatchEnrollment = personal.deriveEffectiveEnrollment({
  courses: [selectableCourse],
  entries: [],
  profile,
  currentPeriod: { ...currentPeriod, term: "second" },
});
assert.equal(termMismatchEnrollment.requiresReconfiguration, true);
assert.deepEqual(termMismatchEnrollment.validManualSelectedCourseIds, []);
assert.deepEqual(termMismatchEnrollment.effectiveCourseIds, []);
const yearMismatchEnrollment = personal.deriveEffectiveEnrollment({
  courses: [selectableCourse],
  entries: [],
  profile,
  currentPeriod: { ...currentPeriod, academicYear: "2027" },
});
assert.equal(yearMismatchEnrollment.requiresReconfiguration, true);
assert.deepEqual(yearMismatchEnrollment.validManualSelectedCourseIds, []);
assert.deepEqual(yearMismatchEnrollment.effectiveCourseIds, []);
const directBypassAttempt = personal.deriveEffectiveEnrollment({
  courses: [selectableCourse],
  entries: [],
  profile,
  manualSelectedCourseIds: ["manual-course"],
});
assert.equal(directBypassAttempt.status, "invalid-context");
assert.equal(directBypassAttempt.requiresReconfiguration, true);
assert.deepEqual(directBypassAttempt.effectiveCourseIds, []);
assert.equal(personal.reconcileManualSelections, undefined);

const conflictCourses = [
  course("required-a", "必修"),
  course("required-b", "必修"),
  course("manual-a"),
  course("manual-b"),
  course("candidate"),
  course("free"),
  course("same-day-free"),
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
  entry("same-day-free", { period: 4, dateKey: "2025-04-21" }),
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
  profile,
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
assert.deepEqual(
  candidateState.conflicts.find((conflict) => conflict.courseId === "required-b").slots,
  [{ weekday: 1, period: 2 }],
);
assert.equal(conflicts.requiredConflicts.length, 1);
assert.equal(conflicts.requiredConflicts[0].type, "required-required");
assert.deepEqual(conflicts.requiredConflicts[0].slots, [{ weekday: 1, period: 2 }]);
assert.equal(conflicts.candidateStates.find((state) => state.courseId === "free").selectable, true);
assert.equal(conflicts.candidateStates.find((state) => state.courseId === "same-day-free").selectable, true);

const manualConflict = personal.analyzeConflicts({
  courses: conflictCourses,
  entries: conflictEntries,
  enrollment: {
    effectiveCourseIds: ["manual-b"],
    requiredCourseIds: [],
    validManualSelectedCourseIds: ["manual-b"],
    items: [{ courseId: "manual-b", required: false, manual: true }],
  },
  profile,
  candidateCourseIds: ["candidate"],
});
assert.equal(manualConflict.candidateStates[0].selectable, false);
assert.equal(manualConflict.candidateStates[0].conflicts[0].source, "manual");
const afterDeselect = personal.analyzeConflicts({
  courses: conflictCourses,
  entries: conflictEntries,
  enrollment: { effectiveCourseIds: [], items: [] },
  profile,
  candidateCourseIds: ["candidate"],
});
assert.equal(afterDeselect.candidateStates[0].selectable, true);
const selectedManualConflict = personal.analyzeConflicts({
  courses: conflictCourses,
  entries: conflictEntries,
  enrollment: {
    effectiveCourseIds: ["manual-a", "candidate"],
    requiredCourseIds: [],
    validManualSelectedCourseIds: ["manual-a", "candidate"],
    items: [
      { courseId: "manual-a", required: false, manual: true },
      { courseId: "candidate", required: false, manual: true },
    ],
  },
  profile,
});
assert.equal(selectedManualConflict.enrollmentConflicts.length, 1);
assert.equal(selectedManualConflict.enrollmentConflicts[0].type, "manual-manual");
assert.deepEqual(selectedManualConflict.enrollmentConflicts[0].slots, [
  { weekday: 1, period: 2 },
]);
assert.deepEqual(personal.intersectSlots(
  [{ weekday: 1, period: 1 }, { weekday: 1, period: 2 }],
  [{ weekday: 1, period: 2 }, { weekday: 1, period: 3 }],
), [{ weekday: 1, period: 2 }]);

const scopedCourse = course("scoped-course");
const scopedCandidate = course("scoped-candidate");
const scopedEntries = [
  entry("scoped-course", { grades: [2], homeroomIds: ["grade2-1"], period: 1, dateKey: "2025-04-21" }),
  entry("scoped-course", { grades: [2], homeroomIds: ["grade2-2"], period: 2, dateKey: "2025-04-22" }),
  entry("scoped-course", { grades: [3], homeroomIds: ["grade2-1"], period: 3, dateKey: "2025-04-23" }),
  entry("scoped-candidate", { grades: [2], homeroomIds: ["grade2-1"], period: 2, dateKey: "2025-04-22" }),
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
    entry("unknown-scope-course", { grades: [], homeroomIds: [], period: 1 }),
    entry("unknown-scope-course", { grades: [2], groupTags: ["A組"], homeroomIds: null, period: 2 }),
    entry("unknown-scope-candidate", { grades: [2], homeroomIds: ["grade2-1"], period: 1 }),
  ],
  enrollment: {
    effectiveCourseIds: ["unknown-scope-course"],
    requiredCourseIds: [],
    validManualSelectedCourseIds: ["unknown-scope-course"],
    items: [{ courseId: "unknown-scope-course", required: false, manual: true }],
  },
  profile,
  candidateCourseIds: ["unknown-scope-candidate"],
});
assert.equal(unknownScopeConflicts.candidateStates[0].selectable, true);
assert.equal(unknownScopeConflicts.scopeDiagnostics.unknownScopedEntries.length, 2);
assert.equal(
  unknownScopeConflicts.slotsByCourse.some((item) => item.courseId === "unknown-scope-course"),
  false,
);

const audienceEntry = (kind, overrides = {}) => entry(null, {
  courseId: null,
  kind,
  grades: [2],
  homeroomIds: ["grade2-1"],
  ...overrides,
});
for (const kind of ["holiday", "event", "special", "other"]) {
  assert.equal(
    personal.entryVisibility(audienceEntry(kind), profile, []).visible,
    true,
  );
}
assert.equal(
  personal.entryVisibility(audienceEntry("holiday", { grades: [] }), profile, []).visible,
  false,
);
assert.equal(
  personal.entryVisibility(audienceEntry("exam", { courseId: "manual-course" }), profile, ["manual-course"]).visible,
  true,
);
assert.equal(
  personal.entryVisibility(audienceEntry("exam", { courseId: "other-course" }), profile, ["manual-course"]).visible,
  false,
);
assert.equal(
  personal.entryVisibility(audienceEntry("exam"), profile, []).visible,
  true,
);
assert.equal(
  personal.entryVisibility(
    entry("manual-course", { homeroomIds: ["grade2-2"] }),
    profile,
    ["manual-course"],
  ).visible,
  false,
);
assert.equal(
  personal.entryVisibility(
    entry("manual-course", { grades: [] }),
    profile,
    ["manual-course"],
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
