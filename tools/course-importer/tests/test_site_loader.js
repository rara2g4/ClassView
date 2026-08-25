"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "../../..");
const source = fs.readFileSync(path.join(repoRoot, "js/site-loader.js"), "utf8");
const context = { URL, console };
context.globalThis = context;
vm.runInNewContext(source, context);

const api = context.ClassViewSiteLoader;
assert.ok(api);
assert.equal(api.normalizeVersion("20260825T0549526822442Z"), "20260825T0549526822442Z");
assert.equal(api.normalizeVersion("bad version"), "");

const baseUri = "https://rara2g4.github.io/ClassView/index.html";
const first = api.versionedUrl("css/style.css", "publish-A", baseUri);
const repeated = api.versionedUrl("css/style.css", "publish-A", baseUri);
const changed = api.versionedUrl("css/style.css", "publish-B", baseUri);
assert.equal(first, "https://rara2g4.github.io/ClassView/css/style.css?v=publish-A");
assert.equal(repeated, first);
assert.notEqual(changed, first);
assert.equal(source.includes("Date.now"), false);
assert.match(source, /site-version\.json/);
assert.match(source, /cache: "no-cache"/);

for (const htmlName of ["index.html", "courses.html", "course.html", "timetable.html"]) {
  const html = fs.readFileSync(path.join(repoRoot, htmlName), "utf8");
  assert.match(html, /js\/site-loader\.js\?v=1/);
  assert.match(html, /data-site-stylesheet/);
  assert.match(html, /data-site-src=/);
}

for (const scriptName of ["course-list.js", "course-detail.js", "course-works.js"]) {
  const script = fs.readFileSync(path.join(repoRoot, "js", scriptName), "utf8");
  assert.match(script, /cache: "no-cache"/);
  assert.equal(script.includes('cache: "no-store"'), false);
}

const siteVersion = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "data/site-version.json"), "utf8"),
);
assert.equal(api.normalizeVersion(siteVersion.version), siteVersion.version);
assert.match(siteVersion.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

console.log("Site loader and cache policy tests passed.");
