(function (root, factory) {
  "use strict";

  const personal = typeof module === "object" && module.exports
    ? require("./personal-timetable.js")
    : root.ClassViewPersonalTimetable;
  const api = factory(personal);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ClassViewPersonalTimetableUi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (personal) {
  "use strict";

  const READY_PROFILE_STATES = new Set(["ready", "migrated"]);

  const usableProfile = (profileLoad) =>
    Boolean(profileLoad && READY_PROFILE_STATES.has(profileLoad.status) && profileLoad.profile);

  const initialDisplayMode = (profileLoad) => usableProfile(profileLoad) ? "personal" : "school";

  const courseTypePresentation = (courseType) => {
    if (courseType === "必修") return { code: "必", label: "必修", kind: "required" };
    if (courseType === "選択必修") return { code: "選必", label: "選択必修", kind: "elective-required" };
    if (courseType === "選択") return { code: "", label: "選択", kind: "elective" };
    return { code: "?", label: "区分未確認", kind: "unknown" };
  };

  const sameProfileIdentity = (left, right) => Boolean(
    left && right &&
    left.academicYear === right.academicYear &&
    left.term === right.term &&
    left.grade === right.grade &&
    left.homeroomId === right.homeroomId
  );

  const manualSelectionsForSettings = (currentProfile, nextIdentity) =>
    sameProfileIdentity(currentProfile, nextIdentity) &&
    Array.isArray(currentProfile.manualSelectedCourseIds)
      ? [...currentProfile.manualSelectedCourseIds]
      : [];

  const createDraftProfile = ({ currentProfile, identity, dataVersion, now } = {}) => {
    const manualSelectedCourseIds = manualSelectionsForSettings(currentProfile, identity);
    return personal.createProfile({
      ...identity,
      manualSelectedCourseIds,
      dataVersion,
    }, now ? { now } : undefined);
  };

  const entriesForPeriod = (entries, manifest, term) =>
    (Array.isArray(entries) ? entries : []).filter(
      (entry) => personal.resolveTermForDate(entry && entry.dateKey, manifest) === term,
    );

  const emptyEnrollment = Object.freeze({
    status: "unavailable",
    requiresReconfiguration: true,
    requiredCourseIds: [],
    validManualSelectedCourseIds: [],
    staleManualSelectedCourseIds: [],
    effectiveCourseIds: [],
    items: [],
  });

  const emptyConflicts = Object.freeze({
    candidateStates: [],
    enrollmentConflicts: [],
    requiredConflicts: [],
    slotsByCourse: [],
    scopeDiagnostics: { unknownScopedEntries: [], nonMatchingEntries: [] },
  });

  const buildModel = ({
    manifest,
    dateKey,
    courses = [],
    entries = [],
    profileLoad,
    gradeFilter = personal.ALL_FILTER,
    categoryFilter = personal.ALL_FILTER,
    dataVersion = { site: null, timetable: null },
  } = {}) => {
    const period = personal.periodContextForDate(dateKey, manifest);
    const profile = usableProfile(profileLoad) ? profileLoad.profile : null;
    const base = {
      profile,
      profileStatus: profileLoad && profileLoad.status || "unset",
      period,
      active: false,
      reason: "profile-unavailable",
      periodEntries: [],
      enrollment: emptyEnrollment,
      conflicts: emptyConflicts,
      filters: { grade: gradeFilter, category: categoryFilter },
      filteredCourseIds: [],
      courses: Array.isArray(courses) ? courses : [],
      dataVersion,
    };
    if (!profile) return base;
    if (!period.valid) return { ...base, reason: "term-unresolved" };

    const periodEntries = entriesForPeriod(entries, manifest, period.currentPeriod.term);
    const enrollment = personal.deriveEffectiveEnrollment({
      courses,
      entries: periodEntries,
      profile,
      currentPeriod: { ...period.currentPeriod, dataVersion },
    });
    if (enrollment.requiresReconfiguration) {
      return {
        ...base,
        periodEntries,
        enrollment,
        reason: "period-reconfiguration-required",
      };
    }
    const conflicts = personal.analyzeConflicts({
      courses,
      entries: periodEntries,
      enrollment,
      profile,
    });
    const filtered = personal.filterCandidateCourses({
      courses,
      entries: periodEntries,
      gradeFilter,
      categoryFilter,
      preserveCourseIds: enrollment.effectiveCourseIds,
    });
    return {
      ...base,
      active: true,
      reason: enrollment.status,
      periodEntries,
      enrollment,
      conflicts,
      filteredCourseIds: filtered.visibleCourseIds,
    };
  };

  const candidateState = (model, courseId) =>
    model && model.conflicts && model.conflicts.candidateStates.find(
      (item) => item.courseId === courseId,
    );

  const updateManualSelection = (model, courseId) => {
    if (!model || !model.active || !model.profile) {
      return { changed: false, reason: "personal-timetable-unavailable", courseIds: [] };
    }
    const current = Array.isArray(model.profile.manualSelectedCourseIds)
      ? [...model.profile.manualSelectedCourseIds]
      : [];
    const enrollmentItem = model.enrollment.items.find((item) => item.courseId === courseId);
    if (enrollmentItem && enrollmentItem.required) {
      return { changed: false, reason: "required-course", courseIds: current };
    }
    if (current.includes(courseId)) {
      return {
        changed: true,
        reason: "deselected",
        courseIds: current.filter((value) => value !== courseId),
      };
    }
    const state = candidateState(model, courseId);
    if (!state || !state.selectable) {
      return { changed: false, reason: "conflict", courseIds: current };
    }
    return { changed: true, reason: "selected", courseIds: [...new Set([...current, courseId])] };
  };

  const replaceManualSelection = (model, courseId) => {
    if (!model || !model.active || !model.profile) {
      return { changed: false, reason: "personal-timetable-unavailable", courseIds: [] };
    }
    const current = Array.isArray(model.profile.manualSelectedCourseIds)
      ? [...model.profile.manualSelectedCourseIds]
      : [];
    const candidate = candidateState(model, courseId);
    if (!candidate || candidate.selected || !candidate.conflicts.length) {
      return { changed: false, reason: "no-replacement-needed", courseIds: current };
    }
    const requiredConflictIds = candidate.conflicts
      .filter((conflict) => conflict.required)
      .map((conflict) => conflict.courseId);
    if (requiredConflictIds.length) {
      return {
        changed: false,
        reason: "required-conflict",
        courseIds: current,
        requiredConflictIds: [...new Set(requiredConflictIds)],
        manualConflictIds: [],
      };
    }
    const manualConflictIds = [...new Set(candidate.conflicts
      .filter((conflict) => conflict.manual && !conflict.required)
      .map((conflict) => conflict.courseId))];
    if (!manualConflictIds.length) {
      return { changed: false, reason: "conflict", courseIds: current, requiredConflictIds: [], manualConflictIds: [] };
    }
    const proposed = [...new Set([
      ...current.filter((id) => !manualConflictIds.includes(id) && id !== courseId),
      courseId,
    ])];
    const nextProfileResult = personal.createProfile({
      ...model.profile,
      manualSelectedCourseIds: proposed,
      dataVersion: model.dataVersion,
    });
    if (!nextProfileResult.ok) {
      return { changed: false, reason: "invalid-profile", courseIds: current, requiredConflictIds: [], manualConflictIds };
    }
    const nextEnrollment = personal.deriveEffectiveEnrollment({
      courses: model.courses,
      entries: model.periodEntries,
      profile: nextProfileResult.profile,
      currentPeriod: { ...model.period.currentPeriod, dataVersion: model.dataVersion },
    });
    const nextConflicts = personal.analyzeConflicts({
      courses: model.courses,
      entries: model.periodEntries,
      enrollment: nextEnrollment,
      profile: nextProfileResult.profile,
    });
    const remaining = nextConflicts.enrollmentConflicts.filter(
      (conflict) => conflict.left.courseId === courseId || conflict.right.courseId === courseId,
    );
    if (remaining.length) {
      return {
        changed: false,
        reason: "remaining-conflict",
        courseIds: current,
        requiredConflictIds: [],
        manualConflictIds,
        remainingConflicts: remaining,
      };
    }
    return {
      changed: true,
      reason: "replaced",
      courseIds: proposed,
      removedCourseIds: manualConflictIds,
      requiredConflictIds: [],
      manualConflictIds,
    };
  };

  const filterSummary = ({ grade = personal.ALL_FILTER, category = personal.ALL_FILTER } = {}) => {
    const labels = [];
    if (grade !== personal.ALL_FILTER) labels.push(`${grade}年`);
    if (category !== personal.ALL_FILTER) labels.push(category);
    return labels.length ? labels.join(" / ") : "すべて";
  };

  return Object.freeze({
    buildModel,
    courseTypePresentation,
    createDraftProfile,
    filterSummary,
    initialDisplayMode,
    manualSelectionsForSettings,
    replaceManualSelection,
    sameProfileIdentity,
    updateManualSelection,
    usableProfile,
  });
});
