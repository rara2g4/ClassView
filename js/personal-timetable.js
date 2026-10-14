(function (root, factory) {
  "use strict";

  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ClassViewPersonalTimetable = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (environmentRoot) {
  "use strict";

  const SCHEMA_VERSION = 2;
  const STORAGE_KEY = "classview.personalTimetable.profile";
  const ALL_FILTER = "all";
  const TERMS = Object.freeze(["first", "second"]);
  const OFFICIAL_CATEGORIES = Object.freeze([
    "プログラミング・Web・情報システム",
    "AI・データ",
    "ネットワーク・セキュリティ",
    "デザイン・写真・映像",
    "3DCG・VR",
    "ゲーム制作",
    "eスポーツ・配信・イベント",
    "ドローン・ロボット・ものづくり",
    "総合制作・プロジェクト",
    "キャリア・資格・基礎教養",
  ]);
  const ACADEMIC_YEAR_PATTERN = /^[0-9]{4}$/;
  const COURSE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const HOMEROOM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const VERSION_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
  const PROFILE_KEYS = new Set([
    "schemaVersion",
    "academicYear",
    "term",
    "grade",
    "homeroomId",
    "manualSelectedCourseIds",
    "dataVersion",
    "updatedAt",
  ]);
  const DATA_VERSION_KEYS = new Set(["site", "timetable"]);
  const AUDIENCE_KINDS = new Set(["holiday", "event", "special", "other"]);

  const isRecord = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);

  const unique = (values) => [...new Set(values)];

  const classifySchemaVersion = (value) => {
    if (
      !isRecord(value) ||
      !Object.prototype.hasOwnProperty.call(value, "schemaVersion") ||
      !Number.isInteger(value.schemaVersion) ||
      value.schemaVersion < 1
    ) {
      return "malformed";
    }
    return value.schemaVersion === SCHEMA_VERSION ? "supported" : "unsupported";
  };

  const validateDataVersion = (value, errors) => {
    if (!isRecord(value)) {
      errors.push("dataVersion must be an object");
      return;
    }
    const keys = Object.keys(value);
    if (keys.some((key) => !DATA_VERSION_KEYS.has(key))) {
      errors.push("dataVersion contains an unknown field");
    }
    for (const key of DATA_VERSION_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push("dataVersion." + key + " is required");
        continue;
      }
      if (
        value[key] !== null &&
        (typeof value[key] !== "string" || !VERSION_PATTERN.test(value[key]))
      ) {
        errors.push("dataVersion." + key + " is invalid");
      }
    }
  };

  const validateProfile = (value) => {
    const errors = [];
    if (!isRecord(value)) {
      return { valid: false, errors: ["profile must be an object"] };
    }

    const keys = Object.keys(value);
    if (keys.some((key) => !PROFILE_KEYS.has(key))) {
      errors.push("profile contains an unknown field");
    }
    for (const key of PROFILE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(key + " is required");
      }
    }

    const schemaVersionState = classifySchemaVersion(value);
    if (schemaVersionState === "malformed") errors.push("schemaVersion is invalid");
    else if (schemaVersionState === "unsupported") errors.push("schemaVersion is unsupported");
    if (
      typeof value.academicYear !== "string" ||
      !ACADEMIC_YEAR_PATTERN.test(value.academicYear)
    ) {
      errors.push("academicYear must be four ASCII digits");
    }
    if (!TERMS.includes(value.term)) errors.push("term is invalid");
    if (![1, 2, 3].includes(value.grade)) errors.push("grade is invalid");
    if (
      typeof value.homeroomId !== "string" ||
      !HOMEROOM_ID_PATTERN.test(value.homeroomId) ||
      value.homeroomId.length > 64
    ) {
      errors.push("homeroomId is invalid");
    }

    if (!Array.isArray(value.manualSelectedCourseIds)) {
      errors.push("manualSelectedCourseIds must be an array");
    } else {
      if (
        value.manualSelectedCourseIds.some(
          (courseId) =>
            typeof courseId !== "string" || !COURSE_ID_PATTERN.test(courseId),
        )
      ) {
        errors.push("manualSelectedCourseIds contains an invalid course ID");
      }
      if (unique(value.manualSelectedCourseIds).length !== value.manualSelectedCourseIds.length) {
        errors.push("manualSelectedCourseIds must be unique");
      }
    }

    validateDataVersion(value.dataVersion, errors);
    if (
      typeof value.updatedAt !== "string" ||
      Number.isNaN(Date.parse(value.updatedAt))
    ) {
      errors.push("updatedAt must be a date-time string");
    }
    return { valid: errors.length === 0, errors };
  };

  const timestamp = (value) => {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return value;
    return new Date().toISOString();
  };

  const createProfile = (input = {}, options = {}) => {
    const profile = {
      schemaVersion: SCHEMA_VERSION,
      academicYear: input.academicYear,
      term: input.term,
      grade: input.grade,
      homeroomId: input.homeroomId,
      manualSelectedCourseIds: Array.isArray(input.manualSelectedCourseIds)
        ? [...input.manualSelectedCourseIds]
        : input.manualSelectedCourseIds,
      dataVersion: isRecord(input.dataVersion)
        ? { site: input.dataVersion.site ?? null, timetable: input.dataVersion.timetable ?? null }
        : { site: null, timetable: null },
      updatedAt: timestamp(options.now ?? input.updatedAt),
    };
    const validation = validateProfile(profile);
    return validation.valid
      ? { ok: true, profile, errors: [] }
      : { ok: false, profile: null, errors: validation.errors };
  };

  const migrateLegacyProfile = (value, options = {}) => {
    if (!isRecord(value) || value.schemaVersion !== 1) {
      return { status: "malformed", profile: null, error: "invalid_profile" };
    }
    const legacyKeys = new Set([
      "schemaVersion", "academicYear", "term", "grade", "homeroom",
      "manualSelectedCourseIds", "dataVersion", "updatedAt",
    ]);
    if (
      Object.keys(value).some((key) => !legacyKeys.has(key)) ||
      [...legacyKeys].some((key) => !Object.prototype.hasOwnProperty.call(value, key))
    ) {
      return { status: "malformed", profile: null, error: "invalid_profile" };
    }
    const term = value.term === "前期" ? "first" : value.term === "後期" ? "second" : null;
    if (!term || ![1, 2, 3].includes(value.grade) || typeof value.homeroom !== "string") {
      return { status: "malformed", profile: null, error: "invalid_profile" };
    }
    const homerooms = Array.isArray(options.homerooms) ? options.homerooms : [];
    const matches = homerooms.filter(
      (item) => isRecord(item) && item.grade === value.grade &&
        item.label === value.homeroom && typeof item.id === "string" &&
        HOMEROOM_ID_PATTERN.test(item.id),
    );
    if (matches.length !== 1) {
      return {
        status: "needs-reconfiguration",
        profile: null,
        error: "profile_migration_required",
        requiresReconfiguration: true,
      };
    }
    const migrated = createProfile({
      academicYear: value.academicYear,
      term,
      grade: value.grade,
      homeroomId: matches[0].id,
      manualSelectedCourseIds: value.manualSelectedCourseIds,
      dataVersion: value.dataVersion,
      updatedAt: value.updatedAt,
    }, { now: value.updatedAt });
    if (!migrated.ok) {
      return {
        status: "malformed",
        profile: null,
        error: "invalid_profile",
        errors: migrated.errors,
      };
    }
    return {
      status: "migrated",
      profile: migrated.profile,
      error: null,
      migratedFromSchemaVersion: 1,
      requiresReconfiguration: false,
    };
  };

  const resolveBrowserStorage = (browserRoot = environmentRoot) => {
    try {
      const storage = browserRoot && browserRoot.localStorage;
      if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
        return { status: "unavailable", storage: null, error: "storage_unavailable" };
      }
      return { status: "ready", storage, error: null };
    } catch (_error) {
      return { status: "unavailable", storage: null, error: "storage_unavailable" };
    }
  };

  const loadProfile = (storage, keyOrOptions = STORAGE_KEY, migrationOptions = {}) => {
    const key = typeof keyOrOptions === "string" ? keyOrOptions : STORAGE_KEY;
    const options = isRecord(keyOrOptions) ? keyOrOptions : migrationOptions;
    if (!storage || typeof storage.getItem !== "function") {
      return { status: "unavailable", profile: null, error: "storage_unavailable" };
    }
    let raw;
    try {
      raw = storage.getItem(key);
    } catch (_error) {
      return { status: "unavailable", profile: null, error: "read_failed" };
    }
    if (raw === null) return { status: "unset", profile: null, error: null };

    let value;
    try {
      value = JSON.parse(raw);
    } catch (_error) {
      return { status: "malformed", profile: null, error: "malformed_json" };
    }
    if (isRecord(value) && value.schemaVersion === 1) {
      return migrateLegacyProfile(value, options);
    }
    const schemaVersionState = classifySchemaVersion(value);
    if (schemaVersionState === "unsupported") {
      return {
        status: "unsupported",
        profile: null,
        error: "unsupported_schema_version",
        schemaVersion: value.schemaVersion,
      };
    }
    if (schemaVersionState === "malformed") {
      return { status: "malformed", profile: null, error: "invalid_profile" };
    }
    const validation = validateProfile(value);
    if (!validation.valid) {
      return {
        status: "malformed",
        profile: null,
        error: "invalid_profile",
        errors: validation.errors,
      };
    }
    return { status: "ready", profile: value, error: null };
  };

  const saveProfile = (storage, profile, key = STORAGE_KEY) => {
    const schemaVersionState = classifySchemaVersion(profile);
    if (schemaVersionState !== "supported") {
      const unsupported = schemaVersionState === "unsupported";
      return {
        status: unsupported ? "unsupported" : "malformed",
        saved: false,
        error: unsupported ? "unsupported_schema_version" : "invalid_profile",
      };
    }
    const validation = validateProfile(profile);
    if (!validation.valid) {
      return {
        status: "malformed",
        saved: false,
        error: "invalid_profile",
        errors: validation.errors,
      };
    }
    if (!storage || typeof storage.setItem !== "function") {
      return { status: "unavailable", saved: false, error: "storage_unavailable" };
    }
    try {
      storage.setItem(key, JSON.stringify(profile));
      return { status: "saved", saved: true, error: null };
    } catch (_error) {
      return { status: "unavailable", saved: false, error: "write_failed" };
    }
  };

  const courseIdsFrom = (context) => {
    if (Array.isArray(context.courseIds)) return context.courseIds;
    if (Array.isArray(context.courses)) {
      return context.courses
        .map((course) => course && course.id)
        .filter((courseId) => typeof courseId === "string");
    }
    return [];
  };

  const sameDataVersion = (left, right) =>
    isRecord(left) &&
    isRecord(right) &&
    left.site === right.site &&
    left.timetable === right.timetable;

  const validateTermPeriods = (value) => {
    if (!Array.isArray(value)) return { valid: false, errors: ["termPeriods must be an array"] };
    const errors = [];
    const seenTerms = new Set();
    const normalized = [];
    for (const item of value) {
      if (!isRecord(item) || Object.keys(item).some(
        (key) => !["term", "startDate", "endDate"].includes(key),
      )) {
        errors.push("term period is malformed");
        continue;
      }
      if (!TERMS.includes(item.term) || seenTerms.has(item.term)) {
        errors.push("term is invalid or duplicated");
      }
      const start = parseDateKey(item.startDate);
      const end = parseDateKey(item.endDate);
      if (!start || !end) {
        errors.push("term period date is invalid");
      } else if (item.startDate > item.endDate) {
        errors.push("term period end precedes start");
      } else {
        normalized.push(item);
      }
      seenTerms.add(item.term);
    }
    const sorted = [...normalized].sort((left, right) => left.startDate.localeCompare(right.startDate));
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].startDate <= sorted[index - 1].endDate) {
        errors.push("term periods overlap");
      }
    }
    return { valid: errors.length === 0, errors };
  };

  const resolveTermForDate = (dateKey, manifest) => {
    if (!parseDateKey(dateKey) || !isRecord(manifest)) return "unresolved";
    const validation = validateTermPeriods(manifest.termPeriods);
    if (!validation.valid) return "unresolved";
    const matching = manifest.termPeriods.filter(
      (period) => period.startDate <= dateKey && dateKey <= period.endDate,
    );
    return matching.length === 1 ? matching[0].term : "unresolved";
  };

  const periodContextForDate = (dateKey, manifest) => {
    const term = resolveTermForDate(dateKey, manifest);
    if (
      term === "unresolved" ||
      !isRecord(manifest) ||
      typeof manifest.academicYear !== "string" ||
      !ACADEMIC_YEAR_PATTERN.test(manifest.academicYear)
    ) {
      return {
        valid: false,
        currentPeriod: null,
        errors: ["manifest academicYear and resolved term are required"],
      };
    }
    return {
      valid: true,
      currentPeriod: { academicYear: manifest.academicYear, term },
      errors: [],
    };
  };

  const reconcileProfile = (profile, context = {}) => {
    const validation = validateProfile(profile);
    if (!validation.valid) {
      return {
        status: "invalid-profile",
        requiresReconfiguration: true,
        validManualSelectedCourseIds: [],
        staleManualSelectedCourseIds: [],
        errors: validation.errors,
      };
    }
    if (
      typeof context.academicYear !== "string" ||
      !ACADEMIC_YEAR_PATTERN.test(context.academicYear) ||
      !TERMS.includes(context.term)
    ) {
      return {
        status: "invalid-context",
        requiresReconfiguration: true,
        validManualSelectedCourseIds: [],
        staleManualSelectedCourseIds: [],
        errors: ["academicYear and term context are required"],
      };
    }
    if (profile.academicYear !== context.academicYear || profile.term !== context.term) {
      return {
        status: "period-changed",
        requiresReconfiguration: true,
        validManualSelectedCourseIds: [],
        staleManualSelectedCourseIds: [],
        previousManualSelectedCourseIds: [...profile.manualSelectedCourseIds],
        dataVersionChanged: isRecord(context.dataVersion)
          ? !sameDataVersion(profile.dataVersion, context.dataVersion)
          : false,
      };
    }

    const currentIds = new Set(courseIdsFrom(context));
    const valid = profile.manualSelectedCourseIds.filter((courseId) => currentIds.has(courseId));
    const stale = profile.manualSelectedCourseIds.filter((courseId) => !currentIds.has(courseId));
    return {
      status: stale.length ? "stale-selections" : "ready",
      requiresReconfiguration: false,
      validManualSelectedCourseIds: valid,
      staleManualSelectedCourseIds: stale,
      previousManualSelectedCourseIds: [],
      dataVersionChanged: isRecord(context.dataVersion)
        ? !sameDataVersion(profile.dataVersion, context.dataVersion)
        : false,
    };
  };

  const matchGrade = (entry, grade) => {
    if (![1, 2, 3].includes(grade)) return "invalid-profile";
    if (!Array.isArray(entry && entry.grades) || entry.grades.length === 0) {
      return "unknown";
    }
    if (entry.grades.some((value) => ![1, 2, 3].includes(value))) return "unknown";
    return entry.grades.includes(grade) ? "match" : "mismatch";
  };

  const matchHomeroom = (entry, homeroomId) => {
    const homeroomIds = entry && entry.homeroomIds;
    if (homeroomIds === null || !Array.isArray(homeroomIds)) return "unknown";
    if (homeroomIds.length === 0) return "all";
    if (
      typeof homeroomId !== "string" ||
      !HOMEROOM_ID_PATTERN.test(homeroomId)
    ) return "invalid-profile";
    if (homeroomIds.some(
      (value) => typeof value !== "string" || !HOMEROOM_ID_PATTERN.test(value),
    )) return "unknown";
    return homeroomIds.includes(homeroomId) ? "match" : "mismatch";
  };

  const matchAudience = (entry, profile) => {
    const grade = matchGrade(entry, profile && profile.grade);
    const homeroom = matchHomeroom(entry, profile && profile.homeroomId);
    return {
      matches: grade === "match" && (homeroom === "match" || homeroom === "all"),
      grade,
      homeroom,
    };
  };

  const deriveRequiredCourses = ({ courses = [], entries = [], profile } = {}) => {
    const entryList = Array.isArray(entries) ? entries : [];
    const requiredCourses = [];
    for (const course of Array.isArray(courses) ? courses : []) {
      if (!isRecord(course) || typeof course.id !== "string" || course.courseType !== "必修") {
        continue;
      }
      const matchingEntries = entryList.filter(
        (entry) =>
          isRecord(entry) &&
          entry.courseId === course.id &&
          matchAudience(entry, profile).matches,
      );
      if (!matchingEntries.length) continue;
      requiredCourses.push({
        courseId: course.id,
        entryIds: unique(
          matchingEntries
            .map((entry) => entry.entryId)
            .filter((entryId) => typeof entryId === "string"),
        ),
      });
    }
    return {
      requiredCourseIds: requiredCourses.map((item) => item.courseId),
      requiredCourses,
    };
  };

  const deriveEffectiveEnrollment = ({
    courses = [],
    entries = [],
    profile,
    currentPeriod,
  } = {}) => {
    const reconciliation = reconcileProfile(profile, {
      ...(isRecord(currentPeriod) ? currentPeriod : {}),
      courses,
    });
    const manual = {
      validManualSelectedCourseIds: reconciliation.requiresReconfiguration
        ? []
        : reconciliation.validManualSelectedCourseIds,
      staleManualSelectedCourseIds: reconciliation.requiresReconfiguration
        ? []
        : reconciliation.staleManualSelectedCourseIds,
    };
    const required = deriveRequiredCourses({ courses, entries, profile });
    const requiredIds = new Set(required.requiredCourseIds);
    const manualIds = new Set(manual.validManualSelectedCourseIds);
    const effectiveCourseIds = [];
    const items = [];
    for (const course of Array.isArray(courses) ? courses : []) {
      if (!isRecord(course) || typeof course.id !== "string") continue;
      const isRequired = requiredIds.has(course.id);
      const isManual = manualIds.has(course.id);
      if (!isRequired && !isManual) continue;
      effectiveCourseIds.push(course.id);
      items.push({ courseId: course.id, required: isRequired, manual: isManual });
    }
    return {
      status: reconciliation.status,
      requiresReconfiguration: reconciliation.requiresReconfiguration,
      reconciliation,
      requiredCourseIds: required.requiredCourseIds,
      requiredCourses: required.requiredCourses,
      validManualSelectedCourseIds: manual.validManualSelectedCourseIds,
      staleManualSelectedCourseIds: manual.staleManualSelectedCourseIds,
      effectiveCourseIds,
      items,
    };
  };

  const parseDateKey = (value) => {
    if (typeof value !== "string") return null;
    const match = value.match(/^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return { year, month, day, weekday: date.getUTCDay() || 7 };
  };

  const flattenTimetableDays = (days) => {
    if (!isRecord(days)) return [];
    return Object.entries(days).flatMap(([dateKey, entries]) =>
      Array.isArray(entries)
        ? entries.map((entry) => ({ ...entry, dateKey }))
        : [],
    );
  };

  const slotFromEntry = (entry) => {
    if (!isRecord(entry) || !Number.isInteger(entry.period) || entry.period < 1) return null;
    let weekday = Number.isInteger(entry.weekday) && entry.weekday >= 1 && entry.weekday <= 7
      ? entry.weekday
      : null;
    if (weekday === null) {
      const parsed = parseDateKey(entry.dateKey ?? entry.date);
      weekday = parsed && parsed.weekday;
    }
    return weekday ? { weekday, period: entry.period } : null;
  };

  const slotKey = (slot) => String(slot.weekday) + ":" + String(slot.period);
  const compareSlots = (left, right) => left.weekday - right.weekday || left.period - right.period;

  const courseSlots = (entries) => {
    const slotsByCourse = new Map();
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!isRecord(entry) || typeof entry.courseId !== "string") continue;
      const slot = slotFromEntry(entry);
      if (!slot) continue;
      if (!slotsByCourse.has(entry.courseId)) slotsByCourse.set(entry.courseId, new Map());
      slotsByCourse.get(entry.courseId).set(slotKey(slot), slot);
    }
    return new Map(
      [...slotsByCourse].map(([courseId, slots]) => [
        courseId,
        [...slots.values()].sort(compareSlots),
      ]),
    );
  };

  const intersectSlots = (left = [], right = []) => {
    const rightKeys = new Set(right.map(slotKey));
    return left.filter((slot) => rightKeys.has(slotKey(slot))).sort(compareSlots);
  };

  const enrollmentSource = (item = {}) => ({
    required: item.required === true,
    manual: item.manual === true,
    source: item.required === true
      ? item.manual === true ? "required+manual" : "required"
      : "manual",
  });

  const scopeEntriesForProfile = (entries, profile) => {
    const applicableEntries = [];
    const unknownScopedEntries = [];
    const nonMatchingEntries = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!isRecord(entry)) continue;
      const audience = matchAudience(entry, profile);
      const diagnostic = {
        entryId: typeof entry.entryId === "string" ? entry.entryId : null,
        courseId: typeof entry.courseId === "string" ? entry.courseId : null,
        grade: audience.grade,
        homeroom: audience.homeroom,
      };
      if (audience.matches) applicableEntries.push(entry);
      else if (
        audience.grade === "unknown" ||
        audience.grade === "invalid-profile" ||
        audience.homeroom === "unknown" ||
        audience.homeroom === "invalid-profile"
      ) {
        unknownScopedEntries.push(diagnostic);
      } else {
        nonMatchingEntries.push(diagnostic);
      }
    }
    return { applicableEntries, unknownScopedEntries, nonMatchingEntries };
  };

  const analyzeConflicts = ({
    courses = [],
    entries = [],
    enrollment = {},
    candidateCourseIds,
    profile,
  } = {}) => {
    const effectiveIds = unique(
      Array.isArray(enrollment.effectiveCourseIds) ? enrollment.effectiveCourseIds : [],
    );
    const effectiveSet = new Set(effectiveIds);
    const enrollmentItems = new Map(
      (Array.isArray(enrollment.items) ? enrollment.items : [])
        .filter((item) => isRecord(item) && typeof item.courseId === "string")
        .map((item) => [item.courseId, item]),
    );
    const requiredSet = new Set(
      Array.isArray(enrollment.requiredCourseIds) ? enrollment.requiredCourseIds : [],
    );
    const manualSet = new Set(
      Array.isArray(enrollment.validManualSelectedCourseIds)
        ? enrollment.validManualSelectedCourseIds
        : [],
    );
    for (const courseId of effectiveIds) {
      if (!enrollmentItems.has(courseId)) {
        enrollmentItems.set(courseId, {
          courseId,
          required: requiredSet.has(courseId),
          manual: manualSet.has(courseId),
        });
      }
    }

    const coursesById = new Map(
      (Array.isArray(courses) ? courses : [])
        .filter((course) => isRecord(course) && typeof course.id === "string")
        .map((course) => [course.id, course]),
    );
    const scopedEntries = scopeEntriesForProfile(entries, profile);
    const slotsByCourse = courseSlots(scopedEntries.applicableEntries);
    const detailsFor = (courseId) => {
      const item = enrollmentItems.get(courseId) || { courseId, required: false, manual: true };
      const source = enrollmentSource(item);
      return {
        courseId,
        title: typeof coursesById.get(courseId)?.title === "string"
          ? coursesById.get(courseId).title
          : courseId,
        ...source,
      };
    };

    const enrollmentConflicts = [];
    effectiveIds.forEach((leftId, index) => {
      effectiveIds.slice(index + 1).forEach((rightId) => {
        const slots = intersectSlots(
          slotsByCourse.get(leftId) || [],
          slotsByCourse.get(rightId) || [],
        );
        if (!slots.length) return;
        const left = detailsFor(leftId);
        const right = detailsFor(rightId);
        const type = left.required && right.required
          ? "required-required"
          : left.required || right.required
            ? "required-manual"
            : "manual-manual";
        enrollmentConflicts.push({ left, right, slots, type });
      });
    });

    const candidateIds = unique(
      Array.isArray(candidateCourseIds)
        ? candidateCourseIds
        : [...coursesById.keys()],
    );
    const candidateStates = candidateIds.map((courseId) => {
      if (effectiveSet.has(courseId)) {
        return { courseId, selected: true, selectable: true, conflicts: [] };
      }
      const conflicts = effectiveIds.flatMap((selectedId) => {
        const slots = intersectSlots(
          slotsByCourse.get(courseId) || [],
          slotsByCourse.get(selectedId) || [],
        );
        return slots.length ? [{ ...detailsFor(selectedId), slots }] : [];
      });
      return {
        courseId,
        selected: false,
        selectable: conflicts.length === 0,
        conflicts,
      };
    });

    return {
      candidateStates,
      enrollmentConflicts,
      requiredConflicts: enrollmentConflicts.filter(
        (conflict) => conflict.type === "required-required",
      ),
      slotsByCourse: [...slotsByCourse].map(([courseId, slots]) => ({ courseId, slots })),
      scopeDiagnostics: {
        unknownScopedEntries: scopedEntries.unknownScopedEntries,
        nonMatchingEntries: scopedEntries.nonMatchingEntries,
      },
    };
  };

  const entryVisibility = (entry, profile, effectiveCourseIds, options = {}) => {
    if (!isRecord(entry)) return { visible: false, reason: "invalid-entry", audience: null };
    const enrolled = new Set(Array.isArray(effectiveCourseIds) ? effectiveCourseIds : []);
    if (entry.kind === "class") {
      if (typeof entry.courseId !== "string" || !enrolled.has(entry.courseId)) {
        return { visible: false, reason: "course-not-enrolled", audience: null };
      }
      const audience = matchAudience(entry, profile);
      if (audience.matches) {
        return { visible: true, reason: "enrolled-course", audience };
      }
      const unresolved = audience.grade === "unknown" ||
        audience.grade === "invalid-profile" ||
        audience.homeroom === "unknown" ||
        audience.homeroom === "invalid-profile";
      return {
        visible: false,
        reason: unresolved ? "schedule-scope-unresolved" : "audience-no-match",
        audience,
      };
    }
    if (entry.kind === "exam" && typeof entry.courseId === "string" && entry.courseId) {
      const visible = enrolled.has(entry.courseId);
      return { visible, reason: visible ? "enrolled-exam" : "course-not-enrolled", audience: null };
    }
    if (entry.kind === "exam" || AUDIENCE_KINDS.has(entry.kind)) {
      const audience = matchAudience(entry, profile);
      return {
        visible: audience.matches,
        reason: audience.matches ? "audience-match" : "audience-no-match",
        audience,
      };
    }
    return { visible: false, reason: "unknown-kind", audience: null };
  };

  const matchesGradeFilter = (entry, filter) => {
    if (filter === ALL_FILTER) return true;
    if (![1, 2, 3].includes(filter)) return false;
    return Array.isArray(entry && entry.grades) && entry.grades.includes(filter);
  };

  const matchesCourseGradeFilter = (courseId, entries, filter) => {
    if (filter === ALL_FILTER) return true;
    return (Array.isArray(entries) ? entries : []).some(
      (entry) => entry && entry.courseId === courseId && matchesGradeFilter(entry, filter),
    );
  };

  const matchesCategoryFilter = (course, filter) => {
    if (filter === ALL_FILTER) return true;
    return OFFICIAL_CATEGORIES.includes(filter) && isRecord(course) && course.category === filter;
  };

  const filterCandidateCourses = ({
    courses = [],
    entries = [],
    gradeFilter = ALL_FILTER,
    categoryFilter = ALL_FILTER,
    preserveCourseIds = [],
  } = {}) => {
    const preserved = new Set(Array.isArray(preserveCourseIds) ? preserveCourseIds : []);
    const states = (Array.isArray(courses) ? courses : [])
      .filter((course) => isRecord(course) && typeof course.id === "string")
      .map((course) => {
        const gradeMatch = matchesCourseGradeFilter(course.id, entries, gradeFilter);
        const categoryMatch = matchesCategoryFilter(course, categoryFilter);
        const isPreserved = preserved.has(course.id);
        return {
          courseId: course.id,
          visible: isPreserved || (gradeMatch && categoryMatch),
          preserved: isPreserved,
          gradeMatch,
          categoryMatch,
        };
      });
    return {
      visibleCourseIds: states.filter((state) => state.visible).map((state) => state.courseId),
      states,
    };
  };

  return Object.freeze({
    ALL_FILTER,
    OFFICIAL_CATEGORIES,
    SCHEMA_VERSION,
    STORAGE_KEY,
    TERMS,
    analyzeConflicts,
    createProfile,
    deriveEffectiveEnrollment,
    deriveRequiredCourses,
    entryVisibility,
    filterCandidateCourses,
    flattenTimetableDays,
    intersectSlots,
    loadProfile,
    matchAudience,
    matchGrade,
    matchHomeroom,
    migrateLegacyProfile,
    matchesCategoryFilter,
    matchesCourseGradeFilter,
    matchesGradeFilter,
    parseDateKey,
    periodContextForDate,
    reconcileProfile,
    resolveTermForDate,
    resolveBrowserStorage,
    saveProfile,
    slotFromEntry,
    validateProfile,
    validateTermPeriods,
  });
});
