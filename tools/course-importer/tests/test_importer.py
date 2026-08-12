from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pypdf import PdfReader, PdfWriter


TOOL_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = TOOL_ROOT.parents[1]
sys.path.insert(0, str(TOOL_ROOT))

from importer import CourseImporter, ImporterError  # noqa: E402


class CourseImporterTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory()
        self.fixture_root = Path(self.temp_directory.name) / "repo"
        (self.fixture_root / "data").mkdir(parents=True)
        (self.fixture_root / "docs").mkdir(parents=True)
        shutil.copy2(REPO_ROOT / "data" / "course.schema.json", self.fixture_root / "data")
        shutil.copy2(REPO_ROOT / "data" / "course.template.json", self.fixture_root / "data")
        shutil.copy2(
            REPO_ROOT / "docs" / "syllabus-conversion-prompt.md",
            self.fixture_root / "docs",
        )
        self.existing_course = self.course("existing-course", "既存授業")
        self.courses_path = self.fixture_root / "data" / "courses.json"
        self.courses_path.write_text(
            json.dumps({"courses": [self.existing_course]}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        self.archived_courses_path = self.fixture_root / "data" / "archived-courses.json"
        self.archived_courses_path.write_text(
            json.dumps({"courses": []}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        self.work_root = Path(self.temp_directory.name) / "work"
        self.service = CourseImporter(self.fixture_root, self.work_root)
        self.production_hash = hashlib.sha256(
            (REPO_ROOT / "data" / "courses.json").read_bytes()
        ).hexdigest()
        self.production_archive_hash = hashlib.sha256(
            (REPO_ROOT / "data" / "archived-courses.json").read_bytes()
        ).hexdigest()

    def tearDown(self):
        current_hash = hashlib.sha256(
            (REPO_ROOT / "data" / "courses.json").read_bytes()
        ).hexdigest()
        self.assertEqual(self.production_hash, current_hash, "実運用のcourses.jsonが変更されました")
        current_archive_hash = hashlib.sha256(
            (REPO_ROOT / "data" / "archived-courses.json").read_bytes()
        ).hexdigest()
        self.assertEqual(
            self.production_archive_hash,
            current_archive_hash,
            "実運用のarchived-courses.jsonが変更されました",
        )
        self.temp_directory.cleanup()

    @staticmethod
    def course(course_id: str, title: str = "テスト授業") -> dict:
        return {
            "id": course_id,
            "title": title,
            "summary": "テスト用の概要です。",
            "category": "テスト分野",
            "grade": "1年",
            "academicYear": None,
            "instructor": None,
            "courseType": None,
            "classStyle": "演習",
            "prerequisites": None,
            "learningGoals": "基礎を学びます。",
            "classFlow": None,
            "outcomes": None,
            "topics": ["基礎"],
            "tools": [],
            "assignments": [],
            "schedule": [],
            "suitableFor": None,
            "images": [],
        }

    @staticmethod
    def pdf_stream(page_count: int = 2) -> io.BytesIO:
        writer = PdfWriter()
        for index in range(page_count):
            writer.add_blank_page(width=595 + index, height=842)
        stream = io.BytesIO()
        writer.write(stream)
        stream.seek(0)
        return stream

    def prepare(self, course_id: str = "new-course", mode: str = "support"):
        return self.service.prepare_pdf(
            self.pdf_stream(), "syllabus.pdf", 1, course_id, mode
        )

    def field_meta(self, course: dict, **overrides) -> dict:
        meta = self.service._synthesized_field_meta(course)
        meta.update(overrides)
        return meta

    def test_valid_id_uses_schema_pattern(self):
        self.assertTrue(self.service.is_valid_id("web-programming-2"))
        self.service.validate_new_id("web-programming-2")

    def test_invalid_id_is_rejected(self):
        for invalid in ("Web-Programming", "web_programming", "-course", "course-"):
            with self.subTest(invalid=invalid), self.assertRaises(ImporterError):
                self.service.validate_new_id(invalid)

    def test_duplicate_id_is_rejected(self):
        with self.assertRaises(ImporterError) as context:
            self.service.validate_new_id("existing-course")
        self.assertEqual(context.exception.code, "duplicate_id")

    def test_json_syntax_error_reports_line_and_column(self):
        preparation = self.prepare()
        result = self.service.validate_submission(preparation.token, '{\n  "id":\n}')
        self.assertFalse(result["valid"])
        self.assertFalse(result["checklist"]["jsonSyntax"])
        self.assertIn("行", result["errors"][0])
        self.assertIn("列", result["errors"][0])

    def test_schema_violation_is_rejected(self):
        preparation = self.prepare()
        invalid_course = self.course("new-course")
        invalid_course["unknownField"] = "not allowed"
        result = self.service.validate_submission(
            preparation.token, json.dumps(invalid_course, ensure_ascii=False)
        )
        self.assertFalse(result["valid"])
        self.assertFalse(result["checklist"]["schema"])
        self.assertTrue(any("Schemaにない" in error for error in result["errors"]))

    def test_valid_course_passes_all_checks(self):
        preparation = self.prepare()
        result = self.service.validate_submission(
            preparation.token,
            json.dumps(self.course("new-course"), ensure_ascii=False),
        )
        self.assertTrue(result["valid"])
        self.assertTrue(all(result["checklist"].values()))
        self.assertEqual(result["course"]["id"], "new-course")
        self.assertTrue(result["legacyFormat"])

    def test_intermediate_format_preserves_explicit_inferred_and_missing_sources(self):
        preparation = self.prepare()
        course = self.course("new-course")
        course["grade"] = "1"
        course["classStyle"] = ""
        course["outcomes"] = "Pythonの基本機能を用いて簡単なプログラムを作成できる。"
        meta = self.field_meta(
            course,
            outcomes={
                "sourceType": "inferred",
                "reason": "Pythonの基礎習得という概要と、条件分岐・繰り返し・リスト・関数・辞書の授業計画から導出",
            },
        )
        result = self.service.validate_submission(
            preparation.token,
            json.dumps({"course": course, "fieldMeta": meta}, ensure_ascii=False),
        )
        self.assertTrue(result["valid"])
        self.assertFalse(result["legacyFormat"])
        self.assertEqual(result["fieldMeta"]["grade"]["sourceType"], "explicit")
        self.assertEqual(result["fieldMeta"]["outcomes"]["sourceType"], "inferred")
        self.assertTrue(result["fieldMeta"]["outcomes"]["reason"])
        self.assertEqual(result["fieldMeta"]["classStyle"]["sourceType"], "missing")

    def test_support_mode_accepts_proposed_draft_with_pending_review(self):
        preparation = self.prepare(mode="support")
        course = self.course("new-course")
        course["classFlow"] = "基本事項の説明とプログラミング演習を組み合わせます。"
        meta = self.field_meta(
            course,
            classFlow={
                "sourceType": "proposed",
                "reason": "Pythonの基礎構文とエラー読解を扱う初学者向け授業として提案",
            },
        )
        json_text = json.dumps(
            {"course": course, "fieldMeta": meta}, ensure_ascii=False
        )
        result = self.service.validate_submission(
            preparation.token,
            json_text,
        )

        self.assertTrue(result["valid"])
        self.assertEqual(result["conversionMode"], "support")
        self.assertEqual(result["proposalReviews"]["classFlow"], "pending")
        self.assertEqual(result["pendingProposedFields"], ["classFlow"])
        with self.assertRaises(ImporterError) as context:
            self.service.register(
                preparation.token,
                json_text,
                result["validationToken"],
            )
        self.assertEqual(context.exception.code, "proposal_review_required")

    def test_explicit_instructor_preserves_source_type(self):
        preparation = self.prepare()
        course = self.course("new-course")
        course["instructor"] = "本多 利恵"
        meta = self.field_meta(course)
        result = self.service.validate_submission(
            preparation.token,
            json.dumps({"course": course, "fieldMeta": meta}, ensure_ascii=False),
        )

        self.assertTrue(result["valid"])
        self.assertEqual(result["fieldMeta"]["instructor"]["sourceType"], "explicit")

    def test_strict_mode_rejects_proposed_draft(self):
        preparation = self.prepare(mode="strict")
        course = self.course("new-course")
        course["classFlow"] = "説明と演習を組み合わせます。"
        meta = self.field_meta(
            course,
            classFlow={
                "sourceType": "proposed",
                "reason": "一般的な教育設計を参考に提案",
            },
        )
        result = self.service.validate_submission(
            preparation.token,
            json.dumps({"course": course, "fieldMeta": meta}, ensure_ascii=False),
        )

        self.assertFalse(result["valid"])
        self.assertTrue(any("厳格変換" in error for error in result["errors"]))

    def test_proposed_fact_field_is_rejected(self):
        preparation = self.prepare(mode="support")
        course = self.course("new-course")
        course["instructor"] = "本多 利恵"
        meta = self.field_meta(
            course,
            instructor={
                "sourceType": "proposed",
                "reason": "一般的な担当者を提案",
            },
        )
        result = self.service.validate_submission(
            preparation.token,
            json.dumps({"course": course, "fieldMeta": meta}, ensure_ascii=False),
        )

        self.assertFalse(result["valid"])
        self.assertTrue(any("AI下書き提案で設定できません" in error for error in result["errors"]))

    def test_pending_proposal_blocks_final_validation(self):
        preparation = self.prepare(mode="support")
        course = self.course("new-course")
        course["classFlow"] = "説明と演習を組み合わせます。"
        meta = self.field_meta(
            course,
            classFlow={
                "sourceType": "proposed",
                "reason": "授業内容と一般的な教育設計から提案",
            },
        )
        validation = self.service.validate_course(
            preparation.token,
            course,
            meta,
            [],
            {"classFlow": "pending"},
            True,
        )

        self.assertFalse(validation["valid"])
        self.assertFalse(validation["checklist"]["proposalReview"])
        self.assertTrue(any("1件未確認" in error for error in validation["errors"]))

    def test_changed_proposal_cannot_be_marked_as_accepted_without_edit_review(self):
        preparation = self.prepare(mode="support")
        original = self.course("new-course")
        original["classFlow"] = "基本事項の説明と演習を組み合わせます。"
        meta = self.field_meta(
            original,
            classFlow={
                "sourceType": "proposed",
                "reason": "授業内容と一般的な教育設計から提案",
            },
        )
        imported = self.service.validate_submission(
            preparation.token,
            json.dumps({"course": original, "fieldMeta": meta}, ensure_ascii=False),
        )
        self.assertTrue(imported["valid"])

        changed = dict(original)
        changed["classFlow"] = "要点説明の後に個人演習を行います。"
        accepted = self.service.validate_course(
            preparation.token,
            changed,
            meta,
            [],
            {"classFlow": "accepted"},
            True,
        )
        self.assertFalse(accepted["valid"])
        self.assertTrue(any("修正して採用" in error for error in accepted["errors"]))

        edited = self.service.validate_course(
            preparation.token,
            changed,
            meta,
            ["classFlow"],
            {"classFlow": "edited"},
            True,
        )
        self.assertTrue(edited["valid"])

    def test_proposal_can_be_accepted_edited_or_rejected(self):
        for review_status, value, manual_fields in (
            ("accepted", "説明と演習を組み合わせます。", []),
            ("edited", "短い説明と個人演習を組み合わせます。", ["classFlow"]),
            ("rejected", None, []),
        ):
            with self.subTest(review_status=review_status):
                preparation = self.prepare(f"new-course-{review_status}", "support")
                course = self.course(f"new-course-{review_status}")
                course["classFlow"] = value
                meta_course = dict(course)
                meta_course["classFlow"] = "説明と演習を組み合わせます。"
                meta = self.field_meta(
                    meta_course,
                    classFlow={
                        "sourceType": "proposed",
                        "reason": "授業内容と一般的な教育設計から提案",
                    },
                )
                validation = self.service.validate_course(
                    preparation.token,
                    course,
                    meta,
                    manual_fields,
                    {"classFlow": review_status},
                    True,
                )
                self.assertTrue(validation["valid"])
                self.assertEqual(
                    validation["proposalReviews"]["classFlow"], review_status
                )

    def test_inference_without_reason_is_rejected(self):
        preparation = self.prepare()
        course = self.course("new-course")
        course["outcomes"] = "簡単なプログラムを作成できる。"
        meta = self.field_meta(
            course, outcomes={"sourceType": "inferred", "reason": ""}
        )
        result = self.service.validate_submission(
            preparation.token,
            json.dumps({"course": course, "fieldMeta": meta}, ensure_ascii=False),
        )
        self.assertFalse(result["valid"])
        self.assertFalse(result["checklist"]["metadata"])
        self.assertTrue(any("根拠が必要" in error for error in result["errors"]))

    def test_restricted_fact_field_cannot_be_inferred(self):
        preparation = self.prepare()
        course = self.course("new-course")
        course["classStyle"] = "講義・演習"
        meta = self.field_meta(
            course,
            classStyle={
                "sourceType": "inferred",
                "reason": "Pythonを扱う授業だから",
            },
        )
        result = self.service.validate_submission(
            preparation.token,
            json.dumps({"course": course, "fieldMeta": meta}, ensure_ascii=False),
        )
        self.assertFalse(result["valid"])
        self.assertTrue(any("AI推察で設定できません" in error for error in result["errors"]))

    def test_all_schema_fields_require_metadata_in_new_format(self):
        preparation = self.prepare()
        course = self.course("new-course")
        result = self.service.validate_submission(
            preparation.token,
            json.dumps(
                {"course": course, "fieldMeta": {"title": {"sourceType": "explicit"}}},
                ensure_ascii=False,
            ),
        )
        self.assertFalse(result["valid"])
        self.assertTrue(any("情報源がない項目" in error for error in result["errors"]))

    def test_intermediate_format_requires_field_meta(self):
        preparation = self.prepare()
        course = self.course("new-course")
        result = self.service.validate_submission(
            preparation.token,
            json.dumps({"course": course}, ensure_ascii=False),
        )

        self.assertFalse(result["valid"])
        self.assertFalse(result["checklist"]["metadata"])
        self.assertTrue(any("fieldMeta" in error for error in result["errors"]))

    def test_instructor_and_academic_year_are_optional_nullable_strings(self):
        preparation = self.prepare()
        course = self.course("new-course")
        course["instructor"] = "本多 利恵"
        course["academicYear"] = "2026"
        self.assertTrue(self.service.validate_course(preparation.token, course)["valid"])

        course["instructor"] = None
        course["academicYear"] = None
        self.assertTrue(self.service.validate_course(preparation.token, course)["valid"])

        course.pop("instructor")
        course.pop("academicYear")
        self.assertTrue(self.service.validate_course(preparation.token, course)["valid"])

    def test_instructor_and_academic_year_reject_non_strings(self):
        preparation = self.prepare()
        course = self.course("new-course")
        course["instructor"] = ["講師"]
        course["academicYear"] = 2026
        validation = self.service.validate_course(preparation.token, course)
        self.assertFalse(validation["valid"])
        self.assertTrue(
            {error["field"] for error in validation["fieldErrors"]}
            >= {"instructor", "academicYear"}
        )

    def test_editor_config_comes_from_current_contract_and_courses(self):
        config = self.service.editor_config()

        self.assertIn("properties", config["schema"])
        self.assertEqual(config["template"]["id"], "course-id")
        self.assertIn(self.existing_course["category"], config["suggestions"]["category"])
        self.assertIn(self.existing_course["classStyle"], config["suggestions"]["classStyle"])

    def test_edited_course_can_be_validated_and_registered(self):
        preparation = self.prepare()
        edited_course = self.course("new-course", "フォーム編集後の授業")
        edited_course["category"] = "情報・デザイン"
        edited_course["classStyle"] = "講義・演習"
        edited_course["topics"].append("データの可視化")
        edited_course["schedule"] = [
            {"session": "1〜2", "title": "統計の基礎", "description": None}
        ]

        validation = self.service.validate_course(preparation.token, edited_course)
        self.assertTrue(validation["valid"])
        result = self.service.register_course(
            preparation.token,
            edited_course,
            validation["validationToken"],
        )

        document = json.loads(self.courses_path.read_text(encoding="utf-8"))
        registered = document["courses"][-1]
        self.assertEqual(registered["category"], "情報・デザイン")
        self.assertEqual(registered["topics"][-1], "データの可視化")
        self.assertEqual(result["title"], "フォーム編集後の授業")

    def test_schema_violation_prevents_form_registration(self):
        preparation = self.prepare()
        invalid_course = self.course("new-course")
        invalid_course["title"] = ""

        validation = self.service.validate_course(preparation.token, invalid_course)

        self.assertFalse(validation["valid"])
        self.assertFalse(validation["checklist"]["schema"])
        self.assertTrue(any(error["field"] == "title" for error in validation["fieldErrors"]))
        with self.assertRaises(ImporterError):
            self.service.register_course(preparation.token, invalid_course, "invalid-token")

    def test_edit_after_final_validation_requires_revalidation(self):
        preparation = self.prepare()
        course = self.course("new-course")
        validation = self.service.validate_course(preparation.token, course)
        course["summary"] = "最終検証後に変更された概要です。"

        with self.assertRaises(ImporterError) as context:
            self.service.register_course(
                preparation.token,
                course,
                validation["validationToken"],
            )
        self.assertEqual(context.exception.code, "validation_expired")

    def test_inference_confirmation_is_required_and_metadata_is_not_saved(self):
        preparation = self.prepare()
        course = self.course("new-course", "根拠付き推察テスト")
        course["outcomes"] = "Pythonの基本機能を用いて簡単なプログラムを作成できる。"
        meta = self.field_meta(
            course,
            outcomes={
                "sourceType": "inferred",
                "reason": "授業概要と授業計画から導出",
            },
        )
        validation = self.service.validate_course(preparation.token, course, meta, [])
        self.assertEqual(validation["inferredFields"], ["outcomes"])
        with self.assertRaises(ImporterError) as context:
            self.service.register_course(
                preparation.token, course, validation["validationToken"]
            )
        self.assertEqual(context.exception.code, "inference_confirmation_required")

        result = self.service.register_course(
            preparation.token,
            course,
            validation["validationToken"],
            inference_confirmed=True,
        )
        document = json.loads(self.courses_path.read_text(encoding="utf-8"))
        saved = document["courses"][-1]
        self.assertEqual(result["id"], "new-course")
        self.assertNotIn("fieldMeta", saved)
        self.assertNotIn("sourceType", saved)
        self.assertNotIn("reason", saved)

    def test_manually_changed_inference_no_longer_requires_inference_confirmation(self):
        preparation = self.prepare()
        course = self.course("new-course")
        course["outcomes"] = "管理者が確認して修正した文章"
        meta = self.field_meta(
            course,
            outcomes={
                "sourceType": "inferred",
                "reason": "授業概要と授業計画から導出",
            },
        )
        validation = self.service.validate_course(
            preparation.token, course, meta, ["outcomes"]
        )
        self.assertTrue(validation["valid"])
        self.assertEqual(validation["inferredFields"], [])

    def test_manually_filled_missing_field_passes_metadata_validation(self):
        preparation = self.prepare()
        course = self.course("new-course")
        course["classStyle"] = ""
        meta = self.field_meta(course)

        course["classStyle"] = "講義・演習"
        validation = self.service.validate_course(
            preparation.token, course, meta, ["classStyle"]
        )

        self.assertTrue(validation["valid"])
        self.assertTrue(validation["checklist"]["metadata"])
        self.assertEqual(validation["inferredFields"], [])

    def test_accepted_proposal_saves_only_course_data(self):
        preparation = self.prepare(mode="support")
        course = self.course("new-course", "AI下書き確認テスト")
        course["classFlow"] = "基本事項の説明と演習を組み合わせます。"
        meta = self.field_meta(
            course,
            classFlow={
                "sourceType": "proposed",
                "reason": "科目内容と一般的な教育設計から提案",
            },
        )
        validation = self.service.validate_course(
            preparation.token,
            course,
            meta,
            [],
            {"classFlow": "accepted"},
            True,
        )
        self.assertTrue(validation["valid"])

        self.service.register_course(
            preparation.token,
            course,
            validation["validationToken"],
        )
        saved = json.loads(self.courses_path.read_text(encoding="utf-8"))["courses"][-1]
        self.assertEqual(saved["classFlow"], course["classFlow"])
        self.assertNotIn("fieldMeta", saved)
        self.assertNotIn("sourceType", saved)
        self.assertNotIn("reviewStatus", saved)
        self.assertNotIn("proposalReviews", saved)

    def test_page_number_out_of_range_is_rejected(self):
        with self.assertRaises(ImporterError) as context:
            self.service.prepare_pdf(
                self.pdf_stream(page_count=2), "syllabus.pdf", 3, "new-course"
            )
        self.assertEqual(context.exception.code, "page_out_of_range")

    def test_page_range_parser_accepts_single_and_continuous_ranges(self):
        self.assertEqual(self.service.parse_page_range("42"), (42, 42, "42"))
        self.assertEqual(self.service.parse_page_range("42-43"), (42, 43, "42-43"))
        self.assertEqual(self.service.parse_page_range("42-44"), (42, 44, "42-44"))

    def test_invalid_page_ranges_are_rejected(self):
        for page_range in ("0", "-1", "43-42", "42,43", "abc", "1-100"):
            with self.subTest(page_range=page_range), self.assertRaises(ImporterError):
                self.service.parse_page_range(page_range)

    def test_page_range_is_extracted_in_source_order(self):
        preparation = self.service.prepare_pdf(
            self.pdf_stream(page_count=4), "syllabus.pdf", "2-4", "new-course"
        )
        extracted = PdfReader(str(preparation.extracted_pdf))
        self.assertEqual(len(extracted.pages), 3)
        self.assertEqual([float(page.mediabox.width) for page in extracted.pages], [596, 597, 598])
        self.assertEqual(preparation.page_spec, "2-4")
        self.assertEqual(preparation.extracted_page_count, 3)

    def test_page_range_beyond_pdf_is_rejected(self):
        with self.assertRaises(ImporterError) as context:
            self.service.prepare_pdf(
                self.pdf_stream(page_count=2), "syllabus.pdf", "2-3", "new-course"
            )
        self.assertEqual(context.exception.code, "page_out_of_range")

    def test_multi_page_prompt_explains_same_course_integration(self):
        preparation = self.service.prepare_pdf(
            self.pdf_stream(page_count=3), "syllabus.pdf", "1-3", "new-course"
        )
        self.assertIn("すべて同一授業のシラバス", preparation.prompt)
        self.assertIn("ページをまたいだ情報を統合", preparation.prompt)
        self.assertIn("別授業として扱わず", preparation.prompt)

    def test_prompt_reflects_selected_mode_and_existing_categories(self):
        support = self.prepare("support-course", "support")
        strict = self.prepare("strict-course", "strict")

        self.assertIn("選択モード: シラバス作成支援", support.prompt)
        self.assertIn("外部の一般知識を使った下書きはproposed", support.prompt)
        self.assertIn("現在のClassViewで使用している分野候補", support.prompt)
        self.assertIn(self.existing_course["category"], support.prompt)
        self.assertIn("選択モード: 厳格変換", strict.prompt)
        self.assertIn("sourceTypeにproposedを使用しない", strict.prompt)

    def test_successful_append_creates_backup_and_preserves_order(self):
        preparation = self.prepare()
        json_text = json.dumps(self.course("new-course", "追加授業"), ensure_ascii=False)
        validation = self.service.validate_submission(preparation.token, json_text)
        result = self.service.register(
            preparation.token, json_text, validation["validationToken"]
        )

        document = json.loads(self.courses_path.read_text(encoding="utf-8"))
        self.assertEqual([item["id"] for item in document["courses"]], ["existing-course", "new-course"])
        self.assertFalse(self.courses_path.read_bytes().endswith(b"\n"))
        self.assertEqual(result["title"], "追加授業")
        backups = list((self.work_root / "backups").glob("courses-*.json"))
        self.assertEqual(len(backups), 1)
        backup_document = json.loads(backups[0].read_text(encoding="utf-8"))
        self.assertEqual([item["id"] for item in backup_document["courses"]], ["existing-course"])

    def test_management_catalog_and_existing_course_loading(self):
        self.existing_course["academicYear"] = "2026"
        self.existing_course["instructor"] = "本多 利恵"
        self.courses_path.write_text(
            json.dumps({"courses": [self.existing_course]}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        catalog = self.service.management_catalog()
        loaded = self.service.managed_course("published", "existing-course")

        self.assertEqual(catalog["published"][0]["academicYear"], "2026")
        self.assertEqual(catalog["published"][0]["instructor"], "本多 利恵")
        self.assertEqual(catalog["archived"], [])
        self.assertEqual(loaded["course"], self.existing_course)
        self.assertEqual(loaded["hash"], self.service._course_hash(self.existing_course))

    def test_existing_course_update_keeps_id_and_other_courses(self):
        other = self.course("other-course", "変更しない授業")
        self.courses_path.write_text(
            json.dumps(
                {"courses": [self.existing_course, other]},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        edited = dict(self.existing_course)
        edited["summary"] = "管理画面で更新した概要です。"
        result = self.service.update_managed_course(
            "existing-course",
            edited,
            self.service._course_hash(self.existing_course),
        )

        saved = json.loads(self.courses_path.read_text(encoding="utf-8"))["courses"]
        self.assertEqual(saved[0]["id"], "existing-course")
        self.assertEqual(saved[0]["summary"], edited["summary"])
        self.assertEqual(saved[1], other)
        self.assertEqual(len(result["backupPaths"]), 1)
        self.assertTrue(list((self.work_root / "backups").glob("courses-edit-existing-course-*.json")))

    def test_existing_course_update_rejects_id_change_and_schema_error(self):
        original_hash = self.service._course_hash(self.existing_course)
        changed_id = dict(self.existing_course)
        changed_id["id"] = "different-course"
        with self.assertRaises(ImporterError) as id_context:
            self.service.update_managed_course(
                "existing-course", changed_id, original_hash
            )
        self.assertEqual(id_context.exception.code, "id_change_not_allowed")

        invalid = dict(self.existing_course)
        invalid["title"] = ""
        with self.assertRaises(ImporterError) as schema_context:
            self.service.update_managed_course(
                "existing-course", invalid, original_hash
            )
        self.assertEqual(schema_context.exception.code, "schema_error")
        self.assertEqual(
            json.loads(self.courses_path.read_text(encoding="utf-8"))["courses"],
            [self.existing_course],
        )

    def test_rollover_draft_increments_year_and_replaces_year_suffix(self):
        original = self.course("basic-information-1-2026", "基本情報1")
        original["academicYear"] = "2026"
        original["instructor"] = "本多 利恵"
        self.courses_path.write_text(
            json.dumps({"courses": [original]}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        draft = self.service.rollover_draft("basic-information-1-2026")

        self.assertEqual(draft["course"]["id"], "basic-information-1-2027")
        self.assertEqual(draft["course"]["academicYear"], "2027")
        self.assertEqual(draft["course"]["instructor"], "本多 利恵")
        self.assertTrue(draft["yearSuggested"])
        self.assertEqual(draft["original"], original)

    def test_rollover_without_year_suffix_appends_new_year(self):
        original = self.course("basic-information-1", "基本情報1")
        original["academicYear"] = "2026年度"
        self.courses_path.write_text(
            json.dumps({"courses": [original]}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        draft = self.service.rollover_draft("basic-information-1")
        self.assertEqual(draft["course"]["id"], "basic-information-1-2027")
        self.assertEqual(draft["course"]["academicYear"], "2027")

    def test_rollover_preserves_previous_year_and_allows_partial_change(self):
        original = self.course("basic-information-1-2026", "基本情報1")
        original["academicYear"] = "2026"
        original["instructor"] = "本多 利恵"
        self.courses_path.write_text(
            json.dumps({"courses": [original]}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        draft = self.service.rollover_draft(original["id"])
        next_course = draft["course"]
        next_course["instructor"] = "山田 太郎"

        self.service.create_next_year_course(
            original["id"], next_course, draft["originalHash"]
        )

        saved = json.loads(self.courses_path.read_text(encoding="utf-8"))["courses"]
        self.assertEqual(saved[0], original)
        self.assertEqual(saved[0]["instructor"], "本多 利恵")
        self.assertEqual(saved[1]["id"], "basic-information-1-2027")
        self.assertEqual(saved[1]["academicYear"], "2027")
        self.assertEqual(saved[1]["instructor"], "山田 太郎")
        self.assertTrue(list((self.work_root / "backups").glob("courses-rollover-*.json")))

    def test_rollover_can_add_same_content_with_only_id_and_year_changed(self):
        original = self.course("database-basics-2026", "データベース基礎")
        original["academicYear"] = "2026"
        self.courses_path.write_text(
            json.dumps({"courses": [original]}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        draft = self.service.rollover_draft(original["id"])
        self.service.create_next_year_course(
            original["id"], draft["course"], draft["originalHash"]
        )
        saved = json.loads(self.courses_path.read_text(encoding="utf-8"))["courses"]
        self.assertEqual(saved[0], original)
        comparable = dict(saved[1])
        comparable["id"] = original["id"]
        comparable["academicYear"] = original["academicYear"]
        self.assertEqual(comparable, original)

    def test_rollover_rejects_duplicate_new_id(self):
        original = self.course("basic-information-1-2026", "基本情報1")
        original["academicYear"] = "2026"
        duplicate = self.course("basic-information-1-2027", "基本情報1")
        duplicate["academicYear"] = "2027"
        self.courses_path.write_text(
            json.dumps({"courses": [original, duplicate]}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        attempted = dict(duplicate)
        with self.assertRaises(ImporterError) as context:
            self.service.create_next_year_course(
                original["id"], attempted, self.service._course_hash(original)
            )
        self.assertEqual(context.exception.code, "duplicate_id")

    def test_archive_restore_and_permanent_delete_flow(self):
        course_hash = self.service._course_hash(self.existing_course)
        archived_result = self.service.archive_managed_course(
            "existing-course", course_hash
        )
        self.assertEqual(
            json.loads(self.courses_path.read_text(encoding="utf-8"))["courses"], []
        )
        self.assertEqual(
            json.loads(self.archived_courses_path.read_text(encoding="utf-8"))["courses"],
            [self.existing_course],
        )
        self.assertEqual(len(archived_result["backupPaths"]), 2)

        restored_result = self.service.restore_managed_course(
            "existing-course", course_hash
        )
        self.assertEqual(
            json.loads(self.courses_path.read_text(encoding="utf-8"))["courses"],
            [self.existing_course],
        )
        self.assertEqual(
            json.loads(self.archived_courses_path.read_text(encoding="utf-8"))["courses"], []
        )
        self.assertEqual(len(restored_result["backupPaths"]), 2)

        second_hash = self.service._course_hash(self.existing_course)
        self.service.archive_managed_course("existing-course", second_hash)
        delete_result = self.service.permanently_delete_archived_course(
            "existing-course", second_hash
        )
        self.assertEqual(
            json.loads(self.archived_courses_path.read_text(encoding="utf-8"))["courses"], []
        )
        self.assertEqual(delete_result["course"]["id"], "existing-course")
        self.assertTrue(list((self.work_root / "backups").glob("archived-courses-delete-*.json")))

    def test_restore_rejects_public_id_duplicate(self):
        self.archived_courses_path.write_text(
            json.dumps({"courses": [self.existing_course]}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        with self.assertRaises(ImporterError) as context:
            self.service.restore_managed_course(
                "existing-course", self.service._course_hash(self.existing_course)
            )
        self.assertEqual(context.exception.code, "duplicate_id")
        self.assertEqual(
            json.loads(self.archived_courses_path.read_text(encoding="utf-8"))["courses"],
            [self.existing_course],
        )

    def test_two_file_archive_failure_rolls_back_both_documents(self):
        original_public = self.courses_path.read_text(encoding="utf-8")
        original_archived = self.archived_courses_path.read_text(encoding="utf-8")
        real_replace = os.replace
        call_count = 0

        def fail_second_replace(source, destination):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise OSError("simulated second file failure")
            return real_replace(source, destination)

        with patch("importer.os.replace", side_effect=fail_second_replace):
            with self.assertRaises(ImporterError) as context:
                self.service.archive_managed_course(
                    "existing-course", self.service._course_hash(self.existing_course)
                )

        self.assertEqual(context.exception.code, "write_failed")
        self.assertEqual(
            json.loads(self.courses_path.read_text(encoding="utf-8")),
            json.loads(original_public),
        )
        self.assertEqual(
            json.loads(self.archived_courses_path.read_text(encoding="utf-8")),
            json.loads(original_archived),
        )


if __name__ == "__main__":
    unittest.main()
