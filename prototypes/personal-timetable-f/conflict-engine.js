(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PersonalTimetableConflict = api;
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const toSlotSet = (course) => new Set(course.slots || []);

  const intersectSlots = (leftCourse, rightCourse, orderedSlotKeys = []) => {
    const rightSlots = toSlotSet(rightCourse);
    const shared = (leftCourse.slots || []).filter((slotKey) => rightSlots.has(slotKey));
    if (!orderedSlotKeys.length) return [...new Set(shared)].sort();

    const order = new Map(orderedSlotKeys.map((slotKey, index) => [slotKey, index]));
    return [...new Set(shared)].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
  };

  const analyze = ({ courses, selectedIds, requiredIds, orderedSlotKeys = [] }) => {
    const selected = new Set(selectedIds);
    const required = new Set(requiredIds);
    const coursesById = new Map(courses.map((course) => [course.id, course]));
    const occupancy = new Map();

    selected.forEach((courseId) => {
      const course = coursesById.get(courseId);
      if (!course) return;
      course.slots.forEach((slotKey) => {
        const occupants = occupancy.get(slotKey) || [];
        occupants.push(courseId);
        occupancy.set(slotKey, occupants);
      });
    });

    const candidateConflicts = new Map();
    courses.forEach((candidate) => {
      if (selected.has(candidate.id)) {
        candidateConflicts.set(candidate.id, []);
        return;
      }

      const conflicts = [];
      selected.forEach((selectedId) => {
        const selectedCourse = coursesById.get(selectedId);
        if (!selectedCourse) return;
        const sharedSlots = intersectSlots(candidate, selectedCourse, orderedSlotKeys);
        if (!sharedSlots.length) return;
        conflicts.push({
          courseId: selectedId,
          title: selectedCourse.title,
          required: required.has(selectedId),
          sharedSlots,
        });
      });
      candidateConflicts.set(candidate.id, conflicts);
    });

    const requiredConflicts = [];
    const requiredCourseIds = [...required].filter((courseId) => selected.has(courseId));
    requiredCourseIds.forEach((leftId, leftIndex) => {
      const leftCourse = coursesById.get(leftId);
      requiredCourseIds.slice(leftIndex + 1).forEach((rightId) => {
        const rightCourse = coursesById.get(rightId);
        if (!leftCourse || !rightCourse) return;
        const sharedSlots = intersectSlots(leftCourse, rightCourse, orderedSlotKeys);
        if (!sharedSlots.length) return;
        requiredConflicts.push({ leftId, rightId, sharedSlots });
      });
    });

    return { candidateConflicts, requiredConflicts, occupancy };
  };

  const formatConflictReason = (conflicts, slotLabel) => conflicts.flatMap((conflict) => {
    const prefix = conflict.required ? "必修授業 " : "";
    return conflict.sharedSlots.map(
      (slotKey) => `${slotLabel(slotKey)}：${prefix}${conflict.title}と重複`,
    );
  });

  return { analyze, formatConflictReason, intersectSlots };
});
