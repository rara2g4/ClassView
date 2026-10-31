((root, factory) => {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PersonalTimetableBModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const slotKey = (record) => `${record.day}-${record.period}`;

  const uniqueCourseIds = (records) => [
    ...new Set((records || []).map((record) => record.id)),
  ];

  const recordsForCourse = (records, courseId) => (
    (records || []).filter((record) => record.id === courseId)
  );

  const recordsForSlot = (records, day, period) => (
    (records || []).filter((record) => record.day === day && record.period === Number(period))
  );

  const requiredCourseIds = (records, grade) => new Set(
    uniqueCourseIds((records || []).filter((record) => (
      record.courseType === "必修" && record.grades.includes(grade)
    ))),
  );

  const conflictEntries = (records, selectedIds) => {
    const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
    const grouped = new Map();
    (records || []).forEach((record) => {
      if (!selected.has(record.id)) return;
      const key = slotKey(record);
      if (!grouped.has(key)) grouped.set(key, new Map());
      grouped.get(key).set(record.id, record);
    });
    return [...grouped.entries()]
      .filter(([, courses]) => courses.size > 1)
      .map(([key, courses]) => {
        const courseRecords = [...courses.values()];
        return {
          slotKey: key,
          day: courseRecords[0].day,
          period: courseRecords[0].period,
          courseIds: courseRecords.map((record) => record.id),
          records: courseRecords,
        };
      });
  };

  const conflictsForCourse = (records, courseId, selectedIds) => {
    const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
    const occupied = new Set(recordsForCourse(records, courseId).map(slotKey));
    const grouped = new Map();
    (records || []).forEach((record) => {
      const key = slotKey(record);
      if (!occupied.has(key) || record.id === courseId || !selected.has(record.id)) return;
      if (!grouped.has(key)) grouped.set(key, new Map());
      grouped.get(key).set(record.id, record);
    });
    return [...grouped.entries()].map(([key, courses]) => {
      const courseRecords = [...courses.values()];
      const [day, periodRaw] = key.split("-");
      return {
        slotKey: key,
        day,
        period: Number(periodRaw),
        courseIds: courseRecords.map((record) => record.id),
        records: courseRecords,
      };
    });
  };

  const toggleCourse = ({ records, selectedIds, requiredIds, courseId }) => {
    const selected = new Set(selectedIds || []);
    const required = requiredIds instanceof Set ? requiredIds : new Set(requiredIds || []);
    if (required.has(courseId)) return { changed: false, reason: "required", selectedIds: selected };
    if (selected.has(courseId)) {
      selected.delete(courseId);
      return { changed: true, reason: "deselected", selectedIds: selected };
    }
    const conflicts = conflictsForCourse(records, courseId, selected);
    if (conflicts.length) return { changed: false, reason: "conflict", conflicts, selectedIds: selected };
    selected.add(courseId);
    return { changed: true, reason: "selected", selectedIds: selected };
  };

  return {
    conflictEntries,
    conflictsForCourse,
    recordsForCourse,
    recordsForSlot,
    requiredCourseIds,
    slotKey,
    toggleCourse,
    uniqueCourseIds,
  };
});
