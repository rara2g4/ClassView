"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../static/timetable.js"),
  "utf8",
);
const context = { console };
context.globalThis = context;
vm.runInNewContext(source, context);

const { saveControlState } = context.ClassViewTimetableAdmin;

const state = (preview) => JSON.stringify(saveControlState(preview));
assert.equal(
  state({ blockingCount: 14, rangeBlockingCount: 0, rangeWarningCount: 0 }),
  JSON.stringify({ saveDisabled: false, warningConfirmationRequired: false }),
);
assert.equal(
  state({ blockingCount: 14, rangeBlockingCount: 1, rangeWarningCount: 0 }),
  JSON.stringify({ saveDisabled: true, warningConfirmationRequired: false }),
);
assert.equal(
  state({ blockingCount: 14, rangeBlockingCount: 0, rangeWarningCount: 2 }),
  JSON.stringify({ saveDisabled: false, warningConfirmationRequired: true }),
);

console.log("Timetable admin range-control tests passed.");
