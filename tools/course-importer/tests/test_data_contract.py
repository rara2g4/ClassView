from __future__ import annotations

import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator


REPO_ROOT = Path(__file__).resolve().parents[3]


class CourseDataContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.schema = json.loads(
            (REPO_ROOT / "data" / "course.schema.json").read_text(encoding="utf-8")
        )
        cls.validator = Draft202012Validator(cls.schema)

    def test_required_fields_and_template_structure_are_unchanged(self):
        self.assertEqual(
            self.schema["required"],
            ["id", "title", "summary", "category", "grade", "classStyle"],
        )
        template = json.loads(
            (REPO_ROOT / "data" / "course.template.json").read_text(encoding="utf-8")
        )
        self.assertEqual(list(template), list(self.schema["properties"]))

    def test_all_existing_courses_remain_schema_compatible(self):
        document = json.loads(
            (REPO_ROOT / "data" / "courses.json").read_text(encoding="utf-8")
        )
        for course in document["courses"]:
            with self.subTest(course_id=course["id"]):
                self.assertEqual(list(self.validator.iter_errors(course)), [])

    def test_basic_information_example_has_distinct_roles(self):
        example = json.loads(
            (REPO_ROOT / "docs" / "basic-information-1-conversion-example.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(list(self.validator.iter_errors(example)), [])
        self.assertNotEqual(example["summary"], example["learningGoals"])
        self.assertLess(len(example["summary"]), len(example["learningGoals"]))
        self.assertEqual(len(example["topics"]), len(set(example["topics"])))
        self.assertTrue(all("第" not in topic for topic in example["topics"]))
        self.assertEqual(example["schedule"], [])

    def test_conversion_prompt_contains_the_four_role_rules(self):
        prompt = (REPO_ROOT / "docs" / "syllabus-conversion-prompt.md").read_text(
            encoding="utf-8"
        )
        for phrase in (
            "一覧用の一文要約",
            "授業概要・到達目標の保持",
            "授業全体を俯瞰する主要テーマ",
            "授業の進め方・学習活動",
            "授業終了時の学習成果",
            "授業回ごとの時系列情報",
            "topics` と `schedule` が同一内容の繰り返しになっていない",
            "一般知識や授業の慣習を、確認済みの事実として創作していない",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, prompt)

    def test_outcomes_contract_describes_post_course_achievement(self):
        outcomes = self.schema["properties"]["outcomes"]
        self.assertEqual(outcomes["$ref"], "#/$defs/nullableString")
        for phrase in ("授業終了時", "知識・理解・技能・遂行能力", "学んだ結果"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, outcomes["description"])

    def test_conversion_prompt_distinguishes_outcomes_from_course_content(self):
        prompt = (REPO_ROOT / "docs" / "syllabus-conversion-prompt.md").read_text(
            encoding="utf-8"
        )
        for phrase in (
            "`learningGoals`: 何を学ぶ授業なのか",
            "`topics`: 具体的に何を扱うのか",
            "`classFlow`: どのように学ぶのか",
            "`outcomes`: 学んだ結果として何が身につく・何ができるようになるのか",
            "アルゴリズムについて学ぶ",
            "Pythonの基本構文を用いて簡単なプログラムを作成できる",
            "基本情報技術者試験で扱われる主要分野の基礎知識を身につける",
            "空値にして `missing`",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, prompt)

    def test_outcomes_display_label_is_consistent(self):
        public_script = (REPO_ROOT / "js" / "course-detail.js").read_text(
            encoding="utf-8"
        )
        importer_script = (
            REPO_ROOT / "tools" / "course-importer" / "static" / "app.js"
        ).read_text(encoding="utf-8")
        label = "身につく知識・できるようになること"
        self.assertIn(label, public_script)
        self.assertGreaterEqual(importer_script.count(label), 2)
        self.assertNotIn("授業後にできるようになること", public_script)
        self.assertNotIn("授業後にできるようになること", importer_script)

    def test_conversion_prompt_defines_grounded_inference_envelope(self):
        prompt = (REPO_ROOT / "docs" / "syllabus-conversion-prompt.md").read_text(
            encoding="utf-8"
        )
        for phrase in (
            '"course"',
            '"fieldMeta"',
            '"sourceType": "explicit"',
            '"sourceType": "inferred"',
            '"sourceType": "proposed"',
            '"sourceType": "missing"',
            "同じシラバス内から合理的に直接導ける",
            "一般的な専門知識や教育設計",
            "評価割合",
            "inferred` の全項目",
            "proposed` の全項目",
            "原則としてシラバスだけから推察しないフィールド",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, prompt)

    def test_importer_exposes_modes_and_proposal_review_actions(self):
        template = (
            REPO_ROOT / "tools" / "course-importer" / "templates" / "index.html"
        ).read_text(encoding="utf-8")
        script = (
            REPO_ROOT / "tools" / "course-importer" / "static" / "app.js"
        ).read_text(encoding="utf-8")
        for phrase in (
            "シラバス作成支援",
            "厳格変換",
            "AI下書き提案・未確認",
            "未確認のAI提案を含むプレビュー",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, template + script)
        for phrase in ("このまま採用", "修正して採用", "使用しない"):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, script)

    def test_support_prompt_limits_factual_invention(self):
        prompt = (REPO_ROOT / "docs" / "syllabus-conversion-prompt.md").read_text(
            encoding="utf-8"
        )
        for phrase in (
            "厳格変換",
            "シラバス作成支援",
            "VS Codeを使用",
            "毎週課題を提出",
            "期末試験50%",
            "グループワークを3回実施",
            "具体的な事実・制度情報",
            "一般論で文章量を水増しせず",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, prompt)

    def test_new_optional_fields_follow_the_nullable_string_contract(self):
        template = json.loads(
            (REPO_ROOT / "data" / "course.template.json").read_text(encoding="utf-8")
        )
        for field in ("instructor", "academicYear"):
            with self.subTest(field=field):
                self.assertNotIn(field, self.schema["required"])
                self.assertEqual(
                    self.schema["properties"][field]["$ref"],
                    "#/$defs/nullableString",
                )
                self.assertIsNone(template[field])

    def test_conversion_prompt_contains_identity_year_and_schedule_compression_rules(self):
        prompt = (REPO_ROOT / "docs" / "syllabus-conversion-prompt.md").read_text(
            encoding="utf-8"
        )
        for phrase in (
            "講師名は、シラバスに記載がある場合だけ",
            "ファイル名や周辺情報から推測しない",
            '"session": "1〜3", "title": "作品制作"',
            "1〜2 作品制作",
            "4〜5 作品制作",
            "離れた回を1項目へ結合しません",
            "各回の補足や内容が異なる場合はまとめません",
            "シラバスにない上位概念を作ることは禁止",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, prompt)


if __name__ == "__main__":
    unittest.main()
