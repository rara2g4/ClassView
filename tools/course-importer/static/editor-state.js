(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CourseEditor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const hasValue = (value) => {
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.some(hasValue);
    if (value && typeof value === "object") return Object.values(value).some(hasValue);
    return value !== null && value !== undefined;
  };

  const normalizeCourse = (source, template) => {
    const course = {};
    Object.keys(template).forEach((field) => {
      const supplied = Object.prototype.hasOwnProperty.call(source, field)
        ? source[field]
        : undefined;
      course[field] = Array.isArray(template[field]) && !Array.isArray(supplied)
        ? clone(template[field])
        : supplied === undefined
          ? clone(template[field])
          : clone(supplied);
    });
    return course;
  };

  const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);

  const fieldStatus = (field, course, initialCourse, fieldMeta = {}, proposalReviews = {}) => {
    const sourceType = fieldMeta?.[field]?.sourceType;
    const reviewStatus = proposalReviews?.[field];
    if (sourceType === "proposed") {
      if (reviewStatus === "rejected") return "proposedRejected";
      if (!sameValue(course[field], initialCourse[field]) || reviewStatus === "edited") {
        return "manual";
      }
      if (reviewStatus === "accepted") return "proposedAccepted";
      return "proposed";
    }
    if (
      !sameValue(course[field], initialCourse[field]) &&
      !hasValue(course[field]) &&
      !hasValue(initialCourse[field])
    ) {
      return "missing";
    }
    if (!sameValue(course[field], initialCourse[field])) return "manual";
    if (["explicit", "inferred", "missing"].includes(sourceType)) return sourceType;
    return hasValue(initialCourse[field]) ? "explicit" : "missing";
  };

  const updateScalar = (course, field, value, template) => {
    const next = clone(course);
    const text = String(value ?? "").trim();
    next[field] = text || (template[field] === null ? null : "");
    return next;
  };

  const updateArrayItem = (course, field, index, value) => {
    const next = clone(course);
    next[field][index] = value;
    return next;
  };

  const addArrayItem = (course, field, emptyValue) => {
    const next = clone(course);
    if (!Array.isArray(next[field])) next[field] = [];
    next[field].push(clone(emptyValue));
    return next;
  };

  const removeArrayItem = (course, field, index) => {
    const next = clone(course);
    if (Array.isArray(next[field])) next[field].splice(index, 1);
    return next;
  };

  const cleanArray = (items) => {
    if (!Array.isArray(items)) return [];
    return items.flatMap((item) => {
      if (typeof item === "string") {
        const text = item.trim();
        return text ? [text] : [];
      }
      if (!item || typeof item !== "object") return [];
      const cleaned = {};
      Object.entries(item).forEach(([key, value]) => {
        if (typeof value === "string" && value.trim()) cleaned[key] = value.trim();
        else if (value !== null && value !== undefined && typeof value !== "string") {
          cleaned[key] = clone(value);
        }
      });
      return Object.keys(cleaned).length ? [cleaned] : [];
    });
  };

  const toCourseJson = (course, template) => {
    const result = {};
    Object.keys(template).forEach((field) => {
      const value = course[field];
      if (Array.isArray(template[field])) {
        result[field] = cleanArray(value);
      } else if (typeof value === "string") {
        const text = value.trim();
        result[field] = text || (template[field] === null ? null : "");
      } else if (value === undefined) {
        result[field] = clone(template[field]);
      } else {
        result[field] = clone(value);
      }
    });
    return result;
  };

  return {
    addArrayItem,
    clone,
    fieldStatus,
    hasValue,
    normalizeCourse,
    removeArrayItem,
    toCourseJson,
    updateArrayItem,
    updateScalar,
  };
});
