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
assert.equal(api.courseDetailUrl("after-effects-a"), "course.html?id=after-effects-a");
assert.equal(api.courseDetailUrl("course id"), "course.html?id=course%20id");
assert.equal(api.courseDetailUrl(null), "");

const monday = { year: 2025, month: 4, day: 21 };
const weekdays = new Map();
assert.equal(api.weekDayCount(weekdays, monday), 5);
weekdays.set("2025-04-26", [{ period: 1 }]);
assert.equal(api.weekDayCount(weekdays, monday), 7);

assert.equal(
  JSON.stringify(api.toggleExpandedDateKeys([], "2025-04-23")),
  JSON.stringify(["2025-04-23"]),
);
assert.equal(
  JSON.stringify(api.toggleExpandedDateKeys(["2025-04-23"], "2025-04-23")),
  JSON.stringify([]),
);
assert.equal(
  JSON.stringify(api.toggleExpandedDateKeys(["2025-04-21"], "2025-04-23")),
  JSON.stringify(["2025-04-21", "2025-04-23"]),
);
assert.equal(
  JSON.stringify(api.toggleExpandedDateKeys(["2025-04-21", "2025-04-22"], "2025-04-21")),
  JSON.stringify(["2025-04-22"]),
);
assert.equal(
  JSON.stringify(
    api.expandedDateKeysForWeek(
      "2025-04-21",
      ["2025-04-21", "2025-04-23"],
      "2025-04-21",
      ["2025-04-21", "2025-04-22", "2025-04-23"],
    ),
  ),
  JSON.stringify(["2025-04-21", "2025-04-23"]),
);
assert.equal(
  JSON.stringify(
    api.expandedDateKeysForWeek(
      "2025-04-21",
      ["2025-04-21"],
      "2025-04-28",
      ["2025-04-28", "2025-04-29"],
    ),
  ),
  JSON.stringify([]),
);
assert.equal(
  JSON.stringify(
    api.expandedDateKeysForWeek("", [], "2025-04-21", ["2025-04-21"]),
  ),
  JSON.stringify([]),
);

const classEntry = api.compactEntryData({
  subjectName: "情報デザイン",
  grades: [1, 2],
  gradeRaw: "1,2",
  groupTags: ["A組", "B組"],
  rooms: ["PC室"],
  instructors: ["山田先生"],
  courseId: "information-design",
  kind: "class",
});
assert.equal(classEntry.title, "情報デザイン");
assert.equal(classEntry.audience, "1・2年 / A組・B組");
assert.equal(classEntry.room, "PC室");
assert.equal(classEntry.instructor, "山田先生");
assert.equal(classEntry.meta, "1・2年 / A組・B組 · PC室");
assert.equal(classEntry.courseId, "information-design");
assert.equal(classEntry.kind, "");

const specialEntry = api.compactEntryData({
  subjectName: "全校集会",
  gradeRaw: "全学年",
  kind: "event",
});
assert.equal(specialEntry.title, "全校集会");
assert.equal(specialEntry.audience, "全学年");
assert.equal(specialEntry.kind, "行事");
assert.equal(specialEntry.courseId, null);

const sparseEntry = api.compactEntryData();
assert.equal(sparseEntry.title, "時間割項目");
assert.equal(sparseEntry.meta, "");
assert.equal(sparseEntry.instructor, "");

assert.equal(source.includes("innerHTML"), false);
assert.equal(source.includes("localStorage"), false);
assert.equal(source.includes('cache: "no-store"'), false);
assert.match(source, /cache: "no-cache"/);
assert.match(source, /\.\/data\/timetable\//);
assert.match(source, /course\.html\?id=/);
assert.match(source, /periods\.json\?v=/);
assert.match(source, /\$\{key\}\.json\?v=/);
assert.match(source, /aria-expanded/);
assert.match(source, /aria-controls/);
assert.match(source, /mobileExpandedDateKeys: \[\]/);
assert.match(source, /resetMobileWeekExpansion\(\)/);
assert.match(source, /expandedDateKeysForWeek/);
assert.match(source, /isExpanded \? "折りたたむ" : "開く"/);
assert.match(source, /action\.textContent = nextExpanded \? "折りたたむ" : "開く"/);
assert.equal(source.includes("initialExpandedDateKey"), false);
assert.match(source, /searchParams\.set\("view", "week"\)/);
assert.match(source, /params\.get\("view"\) === "week"/);
assert.match(source, /createMobileWeekEntry/);
assert.match(source, /detailUrl \? "a" : "div"/);
assert.match(source, /timetable-mobile-entry__compact--link/);
assert.match(source, /timetable-mobile-entry__arrow/);
assert.equal(source.includes("timetable-mobile-entry__toggle"), false);
assert.equal(source.includes("timetable-mobile-entry__expanded"), false);
console.log("Public timetable tests passed.");
