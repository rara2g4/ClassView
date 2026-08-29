"use strict";

const assert = require("assert");
const Measurements = require("../../../js/course-measurements.js");

assert.strictEqual(Measurements.format(2, "単位"), "2単位");
assert.strictEqual(Measurements.format(1.5, "単位"), "1.5単位");
assert.strictEqual(Measurements.format(30, "時間"), "30時間");
assert.strictEqual(Measurements.format(22.5, "時間"), "22.5時間");
for (const invalid of [null, undefined, "2", -1, NaN, Infinity]) {
  assert.strictEqual(Measurements.format(invalid, "単位"), "");
}

assert.deepStrictEqual(Measurements.facts({ credits: 2, totalHours: 30 }), [
  { label: "単位数", value: "2単位" },
  { label: "時間数", value: "30時間" },
]);
assert.deepStrictEqual(Measurements.facts({ credits: null }), []);
assert.deepStrictEqual(Measurements.facts({}), []);

console.log("public-course-measurements: all assertions passed");
