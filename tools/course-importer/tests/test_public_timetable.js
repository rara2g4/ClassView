"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../../js/timetable.js"),
  "utf8",
);
const context = { console };
context.globalThis = context;
vm.runInNewContext(source, context);

const api = context.ClassViewTimetable;
assert.ok(api);
assert.equal(
  JSON.stringify(api.parseCalendarDate("2025-04-21")),
  JSON.stringify({ year: 2025, month: 4, day: 21 }),
);
assert.equal(api.parseCalendarDate("abc"), null);
assert.equal(api.parseCalendarDate("2025-99-99"), null);
assert.equal(api.parseCalendarDate(""), null);
assert.equal(api.parseCalendarDate("2025-02-29"), null);
assert.equal(
  JSON.stringify(api.parseCalendarDate("2024-02-29")),
  JSON.stringify({ year: 2024, month: 2, day: 29 }),
);
assert.equal(api.formatDateKey(api.addDays({ year: 2025, month: 4, day: 30 }, 1)), "2025-05-01");
assert.equal(api.formatDateKey(api.addDays({ year: 2025, month: 12, day: 31 }, 1)), "2026-01-01");
assert.equal(api.formatDateKey(api.startOfWeek({ year: 2025, month: 4, day: 23 })), "2025-04-21");
assert.equal(api.formatGrades([2, 3], "2,3"), "2・3年");
assert.equal(api.formatGrades([1, 2, 3], ""), "全学年");
assert.equal(api.kindLabel("special"), "特別授業");
assert.equal(api.kindLabel("event"), "行事");
assert.equal(api.kindLabel("exam"), "試験");
assert.equal(api.kindLabel("holiday"), "休暇");
assert.equal(api.kindLabel("other"), "その他");
assert.equal(api.kindLabel("class"), "");

const monday = { year: 2025, month: 4, day: 21 };
const weekdays = new Map();
assert.equal(api.weekDayCount(weekdays, monday), 5);
weekdays.set("2025-04-26", [{ period: 1 }]);
assert.equal(api.weekDayCount(weekdays, monday), 7);

assert.equal(source.includes("innerHTML"), false);
assert.equal(source.includes("localStorage"), false);
assert.match(source, /\.\/data\/timetable\//);
assert.match(source, /course\.html\?id=/);
console.log("Public timetable tests passed.");
