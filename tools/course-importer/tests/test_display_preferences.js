"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../../..");
const source = fs.readFileSync(path.join(root, "js/display-preferences.js"), "utf8");

// The document is still parsing. Restoration must work before there is a header.
function boot(stored, systemDark) {
  const dataset = {};
  const media = {
    matches: systemDark,
    addEventListener(type, fn) { assert.equal(type, "change"); this.notify = fn; },
  };
  vm.runInNewContext(source, {
    document: { documentElement: { dataset }, addEventListener() {} },
    window: { matchMedia: () => media },
    localStorage: {
      getItem(key) {
        assert.equal(key, "classview.displayPreferences");
        if (stored instanceof Error) throw stored;
        return stored;
      },
    },
  });
  return { dataset, media };
}

for (const stored of [null, "{", "null", "[]", new Error("access denied"),
  '{"theme":"__proto__","density":"constructor","textSize":42}']) {
  const { dataset, media } = boot(stored, true);
  assert.deepEqual(dataset, { theme: "dark", density: "standard", textSize: "standard" });
  media.matches = false;
  media.notify();
  assert.equal(dataset.theme, "light");
}
const { dataset, media } = boot('{"theme":"dark","density":"bad","textSize":"large"}', false);
media.notify();
assert.deepEqual(dataset, { theme: "dark", density: "standard", textSize: "large" });

for (const page of ["index.html", "timetable.html", "courses.html", "course.html"]) {
  const html = fs.readFileSync(path.join(root, page), "utf8");
  const bootstrap = html.indexOf('<script src="js/display-preferences.js?v=1"></script>');
  assert.ok(bootstrap >= 0 && bootstrap < html.indexOf('rel="stylesheet"'));
  assert.match(html, /id="display-preferences-button"/);
}
console.log("Display preference bootstrap and storage fallback tests passed.");
