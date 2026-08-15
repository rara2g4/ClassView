"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../../../js/course-works.js"),
  "utf8",
);

const records = [
  {
    id: "web-programming-work-111111111111",
    courseId: "web-programming",
    academicYear: "2026",
    title: "2026年度の作品",
    description: null,
    image: "assets/works/web-programming/2026/0123456789abcdef0123456789abcdef.webp",
    url: null,
    linkLabel: null,
    alt: null,
    order: 2,
  },
  {
    id: "web-programming-work-222222222222",
    courseId: "web-programming",
    academicYear: "2027",
    title: "別年度の作品",
    description: null,
    image: null,
    url: "https://example.com/2027",
    linkLabel: "作品を見る",
    alt: null,
    order: 0,
  },
  {
    id: "web-programming-work-333333333333",
    courseId: "web-programming",
    academicYear: "2026",
    title: "外部作品",
    description: null,
    image: null,
    url: "https://example.com/2026",
    linkLabel: "Webサイトを見る",
    alt: null,
    order: 1,
  },
  {
    id: "web-programming-work-444444444444",
    courseId: "web-programming",
    academicYear: "2026",
    title: "危険なURL",
    description: null,
    image: null,
    url: "javascript:alert(1)",
    linkLabel: "開く",
    alt: null,
    order: 0,
  },
];

const context = {
  URL,
  console,
  document: {
    baseURI: "https://rara2g4.github.io/ClassView/course.html?id=web-programming",
  },
  fetch: async () => ({
    ok: true,
    json: async () => ({ works: records }),
  }),
};
context.globalThis = context;
vm.runInNewContext(source, context);

const api = context.ClassViewWorks;
assert.ok(api);
assert.equal(api.safeExternalUrl("javascript:alert(1)"), "");
assert.equal(api.safeExternalUrl("data:text/html,test"), "");
assert.equal(api.safeExternalUrl("file:///tmp/work"), "");
assert.equal(api.safeExternalUrl("https://example.com/work"), "https://example.com/work");

assert.equal(
  api.safeImageUrl("assets/works/web-programming/2026/0123456789abcdef0123456789abcdef.webp"),
  "https://rara2g4.github.io/ClassView/assets/works/web-programming/2026/0123456789abcdef0123456789abcdef.webp",
);
assert.equal(api.safeImageUrl("../../../secret.png"), "");
assert.equal(api.safeImageUrl("/assets/works/file.png"), "");

(async () => {
  const works = await api.loadForCourse({
    id: "web-programming",
    academicYear: "2026",
  });
  assert.deepEqual(
    Array.from(works, (work) => work.title),
    ["外部作品", "2026年度の作品"],
  );
  assert.equal(source.includes("innerHTML"), false);
  assert.match(source, /target = "_blank"/);
  assert.match(source, /noopener noreferrer/);
  assert.match(source, /showModal/);
  assert.match(source, /lightboxTrigger\?\.focus/);
  console.log("Public course-works tests passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
