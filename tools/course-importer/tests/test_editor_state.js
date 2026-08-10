"use strict";

const assert = require("assert");
const Editor = require("../static/editor-state.js");

const template = {
  id: "course-id",
  title: "授業名",
  summary: "",
  category: "",
  grade: "",
  academicYear: null,
  instructor: null,
  courseType: null,
  classStyle: "",
  prerequisites: null,
  learningGoals: null,
  classFlow: null,
  outcomes: null,
  topics: [],
  tools: [],
  assignments: [],
  schedule: [],
  suitableFor: null,
  images: [],
};

const source = {
  id: "statistics-basics",
  title: "統計基礎",
  summary: "統計の知識を学びます。",
  category: "",
  grade: "2",
  academicYear: "2026",
  instructor: "本多 利恵",
  classStyle: "",
  outcomes: "Pythonの基本機能を用いて簡単なプログラムを作成できる。",
  topics: ["平均値"],
  tools: ["統計検定の教材"],
  schedule: [{ session: "1〜2", title: "記述統計" }],
};

let course = Editor.normalizeCourse(source, template);
const initial = Editor.clone(course);
const fieldMeta = {
  title: { sourceType: "explicit", reason: "科目名として記載" },
  outcomes: {
    sourceType: "inferred",
    reason: "授業概要と授業計画から導出",
  },
  classFlow: {
    sourceType: "proposed",
    reason: "初学者向けの授業設計として提案",
  },
  category: { sourceType: "missing", reason: "記載なし" },
};

assert.strictEqual(course.title, "統計基礎");
assert.strictEqual(course.courseType, null);
assert.deepStrictEqual(course.assignments, []);
assert.strictEqual(Editor.fieldStatus("title", course, initial, fieldMeta), "explicit");
assert.strictEqual(Editor.fieldStatus("outcomes", course, initial, fieldMeta), "inferred");
assert.strictEqual(Editor.fieldStatus("academicYear", course, initial), "explicit");
assert.strictEqual(Editor.fieldStatus("instructor", course, initial), "explicit");
assert.strictEqual(Editor.fieldStatus("category", course, initial, fieldMeta), "missing");
assert.strictEqual(
  Editor.fieldStatus("classFlow", course, initial, fieldMeta, { classFlow: "pending" }),
  "proposed",
);
assert.strictEqual(
  Editor.fieldStatus("classFlow", course, initial, fieldMeta, { classFlow: "accepted" }),
  "proposedAccepted",
);

const proposedCourse = Editor.clone(course);
proposedCourse.classFlow = "説明と演習を組み合わせます。";
const proposedInitial = Editor.clone(proposedCourse);
proposedCourse.classFlow = "説明と個人演習を組み合わせます。";
assert.strictEqual(
  Editor.fieldStatus("classFlow", proposedCourse, proposedInitial, fieldMeta, { classFlow: "edited" }),
  "manual",
);
proposedCourse.classFlow = null;
assert.strictEqual(
  Editor.fieldStatus("classFlow", proposedCourse, proposedInitial, fieldMeta, { classFlow: "rejected" }),
  "proposedRejected",
);

course = Editor.updateScalar(course, "category", "情報・デザイン", template);
assert.strictEqual(course.category, "情報・デザイン");
assert.strictEqual(Editor.fieldStatus("category", course, initial), "manual");

course = Editor.updateScalar(course, "title", "統計学基礎", template);
assert.strictEqual(course.title, "統計学基礎");
assert.strictEqual(Editor.fieldStatus("title", course, initial), "manual");

course = Editor.updateScalar(course, "title", "", template);
assert.strictEqual(course.title, "");
course = Editor.updateScalar(course, "prerequisites", "", template);
assert.strictEqual(course.prerequisites, null);
course = Editor.updateScalar(course, "academicYear", "2027", template);
course = Editor.updateScalar(course, "instructor", "専任教員", template);
assert.strictEqual(course.academicYear, "2027");
assert.strictEqual(course.instructor, "専任教員");
assert.strictEqual(Editor.fieldStatus("academicYear", course, initial), "manual");

course = Editor.updateScalar(course, "outcomes", "管理者が修正した到達像", template);
assert.strictEqual(Editor.fieldStatus("outcomes", course, initial, fieldMeta), "manual");
course = Editor.updateScalar(course, "outcomes", "", template);
assert.strictEqual(course.outcomes, null);
assert.strictEqual(Editor.fieldStatus("outcomes", course, initial, fieldMeta), "manual");

course = Editor.addArrayItem(course, "topics", "回帰分析");
course = Editor.updateArrayItem(course, "topics", 0, "中央値");
course = Editor.removeArrayItem(course, "topics", 1);
assert.deepStrictEqual(course.topics, ["中央値"]);

course = Editor.addArrayItem(course, "tools", "表計算ソフト");
course = Editor.removeArrayItem(course, "tools", 0);
assert.deepStrictEqual(course.tools, ["表計算ソフト"]);

course = Editor.addArrayItem(course, "assignments", "確認問題");
assert.deepStrictEqual(course.assignments, ["確認問題"]);

course = Editor.addArrayItem(course, "schedule", {
  session: "3〜4",
  title: "信頼区間",
  description: "演習を行います。",
});
course = Editor.removeArrayItem(course, "schedule", 0);
assert.deepStrictEqual(course.schedule, [
  { session: "3〜4", title: "信頼区間", description: "演習を行います。" },
]);

course.topics.push("   ");
course.images = [{ src: "", alt: "", caption: "" }];
const serialized = Editor.toCourseJson(course, template);
assert.deepStrictEqual(serialized.topics, ["中央値"]);
assert.deepStrictEqual(serialized.images, []);
assert.strictEqual(serialized.prerequisites, null);
assert.deepStrictEqual(Object.keys(serialized), Object.keys(template));

console.log("editor-state: all assertions passed");
