"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../../..");
const read = (filePath) => fs.readFileSync(path.join(repoRoot, filePath), "utf8");

const indexHtml = read("index.html");
const coursesHtml = read("courses.html");
const timetableHtml = read("timetable.html");
const courseHtml = read("course.html");
const courseListSource = read("js/course-list.js");
const courseDetailSource = read("js/course-detail.js");

// ルートは同じ時間割ロジックを使う日表示で、一覧ロジックを読み込まない。
assert.match(indexHtml, /class="page-shell timetable-page"/);
assert.match(indexHtml, /id="day-view-button"[^>]+aria-pressed="true"/);
assert.match(indexHtml, /data-site-src="js\/timetable\.js"/);
assert.doesNotMatch(indexHtml, /data-site-src="js\/course-list\.js"/);

// 授業一覧は専用URLに残り、ナビゲーションから相対パスで到達できる。
assert.match(coursesHtml, /class="page-shell catalog-page"/);
assert.match(coursesHtml, /id="course-list"/);
assert.match(coursesHtml, /data-site-src="js\/course-list\.js"/);
for (const html of [indexHtml, timetableHtml, courseHtml]) {
  assert.match(html, /href="courses\.html">授業を探す<\/a>/);
}
assert.match(coursesHtml, /href="courses\.html" aria-current="page">授業を探す<\/a>/);
for (const html of [indexHtml, coursesHtml, timetableHtml, courseHtml]) {
  assert.match(html, /href="index\.html"[^>]*>時間割<\/a>/);
  assert.doesNotMatch(html, /href="\/courses\.html"/);
}

// timetable.htmlと日付queryを処理する共通スクリプトは維持する。
assert.match(timetableHtml, /data-site-src="js\/timetable\.js"/);
assert.match(read("js/timetable.js"), /new URLSearchParams\(window\.location\.search\)/);

// 一覧カードは授業名そのものを正式なリンクにし、冗長な詳細リンクを置かない。
assert.match(courseListSource, /element\("a", "course-card__title-link", titleText\)/);
assert.match(courseListSource, /titleLink\.href = courseDetailUrl\(course\.id\)/);
assert.match(courseListSource, /course\.html\?id=\$\{encodeURIComponent\(courseId\)\}/);
assert.doesNotMatch(courseListSource, /element\("a", "course-card__link"/);
assert.doesNotMatch(courseListSource, /"詳細を見る"\)/);

// 詳細ページの「授業一覧へ戻る」も移行先を参照する。
assert.match(courseDetailSource, /\|\| "courses\.html"/);

console.log("Public navigation tests passed.");
