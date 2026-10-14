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

    def test_credits_and_total_hours_are_optional_nonnegative_numbers(self):
        self.assertFalse(self.schema["additionalProperties"])
        template = json.loads(
            (REPO_ROOT / "data" / "course.template.json").read_text(encoding="utf-8")
        )
        for field, unit, interpretation in (
            ("credits", "単位", None),
            ("totalHours", "時間", "actualElapsedHours"),
        ):
            with self.subTest(field=field):
                definition = self.schema["properties"][field]
                self.assertNotIn(field, self.schema["required"])
                self.assertEqual(definition["type"], ["number", "null"])
                self.assertEqual(definition["minimum"], 0)
                self.assertEqual(definition["x-classview"]["unit"], unit)
                self.assertIsNone(template[field])
                if interpretation:
                    self.assertEqual(
                        definition["x-classview"]["interpretation"], interpretation
                    )
                    self.assertTrue(definition["x-classview"]["provisional"])

        base = dict(template)
        base.update(
            id="measurement-test",
            title="測定値テスト",
            credits=1.5,
            totalHours=22.5,
        )
        self.assertEqual(list(self.validator.iter_errors(base)), [])
        for field in ("credits", "totalHours"):
            omitted = dict(base)
            omitted.pop(field)
            self.assertEqual(list(self.validator.iter_errors(omitted)), [])
            for invalid in ("2", -1):
                invalid_course = dict(base)
                invalid_course[field] = invalid
                self.assertTrue(list(self.validator.iter_errors(invalid_course)))

    def test_course_and_works_academic_years_use_nullable_ascii_yyyy(self):
        template = json.loads(
            (REPO_ROOT / "data" / "course.template.json").read_text(encoding="utf-8")
        )
        works_schema = json.loads(
            (REPO_ROOT / "data" / "course-works.schema.json").read_text(
                encoding="utf-8"
            )
        )
        works_validator = Draft202012Validator(works_schema)
        work = json.loads(
            (REPO_ROOT / "data" / "course-works.json").read_text(encoding="utf-8")
        )["works"][0]

        for value in ("2025", "0000", None):
            with self.subTest(contract="course", value=value):
                course = dict(template)
                course["academicYear"] = value
                self.assertEqual(list(self.validator.iter_errors(course)), [])
            with self.subTest(contract="work", value=value):
                document = {"works": [{**work, "academicYear": value}]}
                self.assertEqual(list(works_validator.iter_errors(document)), [])

        for value in (
            "2025\n",
            "2025 ",
            " 2025",
            "2025-2026",
            "25",
            "2025年度",
            "２０２５",
        ):
            with self.subTest(contract="course", value=value):
                course = dict(template)
                course["academicYear"] = value
                self.assertTrue(list(self.validator.iter_errors(course)))
            with self.subTest(contract="work", value=value):
                document = {"works": [{**work, "academicYear": value}]}
                self.assertTrue(list(works_validator.iter_errors(document)))

    def test_timetable_manifest_keeps_its_separate_academic_year_contract(self):
        schema = json.loads(
            (REPO_ROOT / "data" / "timetable-manifest.schema.json").read_text(
                encoding="utf-8"
            )
        )
        validator = Draft202012Validator(schema)
        manifest = json.loads(
            (REPO_ROOT / "data" / "timetable" / "manifest.json").read_text(
                encoding="utf-8"
            )
        )
        for value in ("2025", "2025-2026"):
            with self.subTest(value=value):
                self.assertEqual(
                    list(validator.iter_errors({**manifest, "academicYear": value})),
                    [],
                )
        self.assertTrue(
            list(validator.iter_errors({**manifest, "academicYear": "0000"}))
        )
        self.assertEqual(manifest["termPeriods"], [])
        self.assertTrue(list(validator.iter_errors({**manifest, "term": "first"})))

    def test_public_timetable_homeroom_contract_and_migration_counts(self):
        manifest = json.loads(
            (REPO_ROOT / "data" / "timetable" / "manifest.json").read_text(
                encoding="utf-8"
            )
        )
        month = json.loads(
            (REPO_ROOT / "data" / "timetable" / "2025-04.json").read_text(
                encoding="utf-8"
            )
        )
        manifest_schema = json.loads(
            (REPO_ROOT / "data" / "timetable-manifest.schema.json").read_text(
                encoding="utf-8"
            )
        )
        month_schema = json.loads(
            (REPO_ROOT / "data" / "timetable-month.schema.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(list(Draft202012Validator(manifest_schema).iter_errors(manifest)), [])
        self.assertEqual(list(Draft202012Validator(month_schema).iter_errors(month)), [])
        entries = [entry for day in month["days"].values() for entry in day]
        counts = {
            "all": sum(entry["homeroomIds"] == [] for entry in entries),
            "explicit": sum(isinstance(entry["homeroomIds"], list) and bool(entry["homeroomIds"]) for entry in entries),
            "unresolved": sum(entry["homeroomIds"] is None for entry in entries),
        }
        self.assertEqual(counts, {"all": 66, "explicit": 14, "unresolved": 4})

    def test_clone_handoff_contains_valid_timetable_state(self):
        courses = json.loads(
            (REPO_ROOT / "data" / "courses.json").read_text(encoding="utf-8")
        )
        course_ids = {course["id"] for course in courses["courses"]}
        config = json.loads(
            (
                REPO_ROOT
                / "tools"
                / "course-importer"
                / "defaults"
                / "timetable-config.json"
            ).read_text(encoding="utf-8")
        )
        self.assertTrue(config["subjectMappings"])
        self.assertLessEqual(set(config["subjectMappings"].values()), course_ids)

        timetable_root = REPO_ROOT / "data" / "timetable"
        manifest = json.loads(
            (timetable_root / "manifest.json").read_text(encoding="utf-8")
        )
        self.assertTrue(manifest["months"])
        for month in manifest["months"]:
            with self.subTest(month=month):
                self.assertTrue((timetable_root / f"{month}.json").is_file())

        self.assertTrue(
            (
                REPO_ROOT
                / "tools"
                / "course-importer"
                / "dist"
                / "ClassView管理ツール.exe"
            ).is_file()
        )

    def test_archived_courses_use_the_same_schema_and_stay_out_of_public_scripts(self):
        archived = json.loads(
            (REPO_ROOT / "data" / "archived-courses.json").read_text(encoding="utf-8")
        )
        self.assertEqual(set(archived), {"courses"})
        for course in archived["courses"]:
            with self.subTest(course_id=course["id"]):
                self.assertEqual(list(self.validator.iter_errors(course)), [])
        public_scripts = "\n".join(
            (REPO_ROOT / path).read_text(encoding="utf-8")
            for path in ("js/course-list.js", "js/course-detail.js")
        )
        self.assertNotIn("archived-courses.json", public_scripts)

    def test_public_course_page_uses_one_shared_prefilled_feedback_form(self):
        course_page = (REPO_ROOT / "course.html").read_text(encoding="utf-8")
        detail_script = (REPO_ROOT / "js" / "course-detail.js").read_text(
            encoding="utf-8"
        )
        feedback_script = (REPO_ROOT / "js" / "feedback-form.js").read_text(
            encoding="utf-8"
        )
        courses = (REPO_ROOT / "data" / "courses.json").read_text(encoding="utf-8")

        self.assertLess(
            course_page.index("js/feedback-form.js"),
            course_page.index("js/course-detail.js"),
        )
        for value in (
            "1FAIpQLSeEjSeDZo3s8NgfSNeBCyKaSRrK5cQbooYaQuCKb3g_BRbfZQ",
            "entry.1710189700",
            "entry.1032820196",
            "entry.681559836",
            "URLSearchParams",
        ):
            with self.subTest(value=value):
                if value == "URLSearchParams":
                    self.assertIn("searchParams", feedback_script)
                else:
                    self.assertIn(value, feedback_script)
        self.assertIn('link.target = "_blank"', detail_script)
        self.assertIn('link.rel = "noopener noreferrer"', detail_script)
        self.assertIn("この授業を受講した方へ", detail_script)
        self.assertNotIn('"feedbackUrl"', courses)

    def test_management_ui_exposes_required_course_operations(self):
        template = (
            REPO_ROOT / "tools" / "course-importer" / "templates" / "manage.html"
        ).read_text(encoding="utf-8")
        script = (
            REPO_ROOT / "tools" / "course-importer" / "static" / "course-management.js"
        ).read_text(encoding="utf-8")
        for phrase in (
            "授業を検索",
            "次年度へ引き継ぐ",
            "アーカイブ済み授業",
            "公開授業へ戻す",
            "完全に削除",
            "前年度版は変更されません",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, template + script)

    def test_management_forms_expose_numeric_measurement_fields(self):
        scripts = "\n".join(
            (REPO_ROOT / path).read_text(encoding="utf-8")
            for path in (
                "tools/course-importer/static/app.js",
                "tools/course-importer/static/course-management.js",
            )
        )
        for phrase in (
            '["credits", "単位数", "number"]',
            '["totalHours", "時間数", "number"]',
            'input.type = "number"',
            'input.step = "any"',
            'input.placeholder = "未入力"',
            "Editor.updateNumber",
        ):
            with self.subTest(phrase=phrase):
                self.assertEqual(scripts.count(phrase), 2)

    def test_management_forms_expose_academic_year_format(self):
        scripts = "\n".join(
            (REPO_ROOT / path).read_text(encoding="utf-8")
            for path in (
                "tools/course-importer/static/app.js",
                "tools/course-importer/static/course-management.js",
            )
        )
        for phrase in (
            'input.pattern = "[0-9]{4}"',
            "input.maxLength = 4",
            'input.inputMode = "numeric"',
            'input.placeholder = "2026"',
        ):
            with self.subTest(phrase=phrase):
                self.assertEqual(scripts.count(phrase), 2)

    def test_public_detail_loads_measurement_formatter_before_renderer(self):
        page = (REPO_ROOT / "course.html").read_text(encoding="utf-8")
        detail = (REPO_ROOT / "js" / "course-detail.js").read_text(encoding="utf-8")
        self.assertLess(
            page.index("js/course-measurements.js"),
            page.index("js/course-detail.js"),
        )
        self.assertIn("ClassViewCourseMeasurements", detail)

    def test_staff_dashboard_hides_git_terms_and_publication_is_file_limited(self):
        dashboard = (
            REPO_ROOT / "tools" / "course-importer" / "templates" / "dashboard.html"
        ).read_text(encoding="utf-8")
        dashboard_script = (
            REPO_ROOT / "tools" / "course-importer" / "static" / "dashboard.js"
        ).read_text(encoding="utf-8")
        publisher = (
            REPO_ROOT / "tools" / "course-importer" / "publisher.py"
        ).read_text(encoding="utf-8")
        for phrase in (
            "現在の状態",
            "新しい授業を登録",
            "授業を管理",
            "未公開の変更",
            "ClassViewへ公開",
            "公開履歴",
            "診断情報をコピー",
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, dashboard + dashboard_script)
        for technical_term in ("git push", "git pull", "working tree", "remote origin"):
            with self.subTest(technical_term=technical_term):
                self.assertNotIn(technical_term, dashboard.casefold())
        self.assertIn('"data/courses.json"', publisher)
        self.assertIn('"data/archived-courses.json"', publisher)
        self.assertNotIn('"add", "."', publisher)
        self.assertNotIn("shell=True", publisher)
        self.assertIn('kwargs["shell"] = False', publisher)

        build_root = REPO_ROOT / "tools" / "course-importer"
        build_script = (build_root / "build_windows.bat").read_text(
            encoding="utf-8"
        ) + (build_root / "build_windows.ps1").read_text(encoding="utf-8")
        self.assertIn("--noconsole", build_script)
        self.assertIn("CREATE_NO_WINDOW", publisher)
        self.assertNotIn("os.system(", publisher)
        self.assertNotIn('subprocess.run(["cmd", "/c"', publisher)

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

    def test_instructor_keeps_the_nullable_string_contract(self):
        template = json.loads(
            (REPO_ROOT / "data" / "course.template.json").read_text(encoding="utf-8")
        )
        self.assertNotIn("instructor", self.schema["required"])
        self.assertEqual(
            self.schema["properties"]["instructor"]["$ref"],
            "#/$defs/nullableString",
        )
        self.assertIsNone(template["instructor"])

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
