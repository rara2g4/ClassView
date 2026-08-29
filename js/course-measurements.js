(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ClassViewCourseMeasurements = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFINITIONS = Object.freeze({
    credits: Object.freeze({ label: "単位数", unit: "単位" }),
    totalHours: Object.freeze({ label: "時間数", unit: "時間" }),
  });

  const format = (value, unit) => (
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? `${value}${unit}`
      : ""
  );

  const facts = (course = {}) => Object.entries(DEFINITIONS).flatMap(
    ([field, definition]) => {
      const value = format(course[field], definition.unit);
      return value ? [{ label: definition.label, value }] : [];
    },
  );

  return { DEFINITIONS, facts, format };
});
