"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const home = read("index.html");
const setup = read("onboarding.html");
const controller = read("js/onboarding.js");
const css = read("css/style.css");

assert.match(home, /classview\.personalTimetable\.profile/);
assert.match(home, /location\.replace\(target\.href\)/);
assert.match(home, /new URL\("onboarding\.html", location\.href\)/);
assert.match(setup, /id="onboarding-grade"/);
assert.match(setup, /id="onboarding-homeroom"/);
assert.match(setup, /id="onboarding-term"/);
assert.match(setup, /data-site-src="js\/onboarding\.js"/);
assert.match(setup, /href="timetable\.html">設定せず学校全体の時間割を見る/);
assert.match(controller, /personal\.periodContextForDate/);
assert.match(controller, /personal\.createProfile/);
assert.match(controller, /personal\.saveProfile/);
assert.match(controller, /manualSelectedCourseIds: unchanged/);
assert.match(controller, /global\.location\.assign\(nextTimetableUrl\(\)\)/);
assert.match(css, /\.onboarding-layout/);
assert.match(css, /@media \(max-width: 760px\)/);
assert.match(read("timetable.html"), /data-site-src="js\/timetable\.js"/);
console.log("First-visit onboarding contract checks passed.");
