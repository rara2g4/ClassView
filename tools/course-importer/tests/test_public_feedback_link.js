"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const { config, createFeedbackUrl } = require(
  path.resolve(__dirname, "../../../js/feedback-form.js")
);

const normal = new URL(
  createFeedbackUrl({
    id: "web-programming",
    title: "Webプログラミング",
    academicYear: "2026",
  })
);
assert.equal(normal.origin, "https://docs.google.com");
assert.equal(normal.searchParams.get(config.fields.courseId), "web-programming");
assert.equal(
  normal.searchParams.get(config.fields.courseTitle),
  "Webプログラミング"
);
assert.equal(normal.searchParams.get(config.fields.academicYear), "2026");

for (const title of [
  "Web Programming",
  "Design & Programming",
  "C/C++",
]) {
  const generated = new URL(
    createFeedbackUrl({ id: "special-course", title, academicYear: "2026" })
  );
  assert.equal(generated.searchParams.get(config.fields.courseTitle), title);
}

const withoutYear = new URL(
  createFeedbackUrl({ id: "no-year", title: "年度未設定" })
);
assert.equal(withoutYear.searchParams.has(config.fields.academicYear), false);
assert.equal(withoutYear.toString().includes("undefined"), false);
assert.equal(withoutYear.toString().includes("null"), false);

assert.equal(
  createFeedbackUrl(
    { id: "disabled", title: "無効設定" },
    { ...config, enabled: false }
  ),
  null
);
assert.equal(createFeedbackUrl({ id: "", title: "授業名" }), null);
assert.equal(createFeedbackUrl({ id: "course", title: "" }), null);

console.log("Public feedback-link tests passed.");
