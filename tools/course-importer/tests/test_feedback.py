from __future__ import annotations

import csv
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


TOOL_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = TOOL_ROOT.parents[1]
sys.path.insert(0, str(TOOL_ROOT))

from app import create_app  # noqa: E402
from feedback_config import FEEDBACK_COLUMNS  # noqa: E402
from feedback_service import FeedbackError, FeedbackService  # noqa: E402
from importer import CourseImporter  # noqa: E402


class FeedbackServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        base = Path(self.temp.name)
        self.repo = base / "repo"
        self.work = base / "work"
        (self.repo / "data").mkdir(parents=True)
        (self.repo / "docs").mkdir(parents=True)
        for name in ("course.schema.json", "course.template.json"):
            shutil.copy2(REPO_ROOT / "data" / name, self.repo / "data" / name)
        shutil.copy2(REPO_ROOT / "docs" / "syllabus-conversion-prompt.md", self.repo / "docs")
        self.course = {
            "id": "web-programming",
            "title": "Webプログラミング",
            "academicYear": "2026",
        }
        (self.repo / "data" / "courses.json").write_text(
            json.dumps({"courses": [self.course]}, ensure_ascii=False), encoding="utf-8"
        )
        (self.repo / "data" / "archived-courses.json").write_text(
            json.dumps({"courses": []}), encoding="utf-8"
        )
        self.importer = CourseImporter(self.repo, self.work)
        self.service = FeedbackService(self.repo, self.work, self.importer)
        self.application = None

    def tearDown(self):
        if self.application is not None:
            publisher = self.application.config["PUBLISHER_SERVICE"]
            for handler in list(publisher.logger.handlers):
                handler.close()
                publisher.logger.removeHandler(handler)
        self.temp.cleanup()

    @staticmethod
    def base_row(**updates):
        row = {
            "timestamp": "2026/08/14 10:32:00",
            "course_id": "web-programming",
            "course_title": "Webプログラミング",
            "academic_year": "2026",
            "attended": "はい",
            "prior_experience": "2",
            "content_understanding": "4",
            "independent_application": "4",
            "skill_growth": "5",
            "goal_achievement": "4",
            "explanation_clarity": "4",
            "practice_usefulness": "役立った",
            "question_support": "質問していない",
            "material_usefulness": "どちらともいえない",
            "assignment_usefulness": "つながっていた",
            "syllabus_alignment": "3",
            "pace": "ちょうどよかった",
            "difficulty": "やや難しい",
            "workload": "ちょうどよい",
            "class_style": "個人演習中心, 制作中心",
            "gained_skills_text": "JavaScriptでDOM操作ができるようになった。",
            "helpful_points_text": "実演が役立った。",
            "improvement_text": "",
            "content_concern_text": "",
            "other_text": "",
        }
        row.update(updates)
        return row

    @staticmethod
    def csv_bytes(rows, *, omit=(), extra=False, header_overrides=None):
        header_overrides = header_overrides or {}
        keys = [key for key in FEEDBACK_COLUMNS if key not in omit]
        output = io.StringIO(newline="")
        headers = [
            header_overrides.get(key, str(FEEDBACK_COLUMNS[key]["canonical"]))
            for key in keys
        ]
        if extra:
            headers.append("メールアドレス")
        writer = csv.DictWriter(output, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            value = {
                header_overrides.get(key, str(FEEDBACK_COLUMNS[key]["canonical"])): row.get(key, "")
                for key in keys
            }
            if extra:
                value["メールアドレス"] = "student@example.invalid"
            writer.writerow(value)
        return output.getvalue().encode("utf-8-sig")

    def import_rows(self, rows, **kwargs):
        payload = self.csv_bytes(rows, **kwargs)
        return self.service.import_csv(io.BytesIO(payload), "回答.csv", len(payload))

    def test_normal_japanese_csv_is_normalized_and_extra_columns_are_ignored(self):
        payload = self.csv_bytes([self.base_row()], extra=True)
        result = self.service.import_csv(io.BytesIO(payload), "回答.csv", len(payload))
        self.assertEqual(result["added"], 1)
        record = self.service.response_detail(
            self.service._load_store()["records"][0]["response_id"]
        )["record"]
        self.assertEqual(record["course_id"], "web-programming")
        self.assertEqual(record["gained_skills_text"], "JavaScriptでDOM操作ができるようになった。")
        self.assertNotIn("メールアドレス", json.dumps(record, ensure_ascii=False))

    def test_missing_column_has_staff_friendly_error(self):
        with self.assertRaises(FeedbackError) as caught:
            self.import_rows([self.base_row()], omit=("course_id",))
        self.assertEqual(caught.exception.code, "missing_feedback_columns")
        self.assertIn("不足している項目", caught.exception.message)
        self.assertIn("・授業ID", caught.exception.message)
        self.assertNotIn("教えてください。。", caught.exception.message)
        self.assertIn("CSVで検出した項目", caught.exception.diagnostic)

    def test_content_concern_header_maps_by_exact_canonical_text(self):
        result = self.import_rows([self.base_row(content_concern_text="確認したい内容")])
        mapped = {
            item["internalField"]: item["csvHeader"]
            for item in result["headerMapping"]
        }
        self.assertEqual(
            mapped["content_concern_text"],
            FEEDBACK_COLUMNS["content_concern_text"]["canonical"],
        )

    def test_final_japanese_period_variants_map_to_content_concern(self):
        canonical = str(FEEDBACK_COLUMNS["content_concern_text"]["canonical"])
        stem = canonical.rstrip("。")
        for index, suffix in enumerate(("", "。", "。。"), start=1):
            with self.subTest(suffix=suffix):
                payload = self.csv_bytes(
                    [self.base_row(timestamp=f"period-{index}")],
                    header_overrides={"content_concern_text": stem + suffix},
                )
                result = self.service.import_csv(io.BytesIO(payload), "回答.csv", len(payload))
                mapping = {item["internalField"] for item in result["headerMapping"]}
                self.assertIn("content_concern_text", mapping)
                self.assertNotIn("専門内容について気になった点", result["missingOptionalColumns"])

    def test_header_whitespace_newline_full_width_space_and_bom_are_ignored(self):
        concern = str(FEEDBACK_COLUMNS["content_concern_text"]["canonical"])
        attended = str(FEEDBACK_COLUMNS["attended"]["canonical"])
        overrides = {
            "timestamp": "\ufeff　タイムスタンプ ",
            "attended": attended.replace("実際に", "実際に\r\n　"),
            "content_concern_text": "　" + concern.replace("など、", "など、\n　") + " ",
        }
        payload = self.csv_bytes([self.base_row(timestamp="whitespace")], header_overrides=overrides)
        result = self.service.import_csv(io.BytesIO(payload), "回答.csv", len(payload))
        mapped = {item["internalField"] for item in result["headerMapping"]}
        self.assertIn("timestamp", mapped)
        self.assertIn("attended", mapped)
        self.assertIn("content_concern_text", mapped)

    def test_optional_free_text_column_can_be_absent_with_warning(self):
        result = self.import_rows(
            [self.base_row(timestamp="optional-missing")],
            omit=("content_concern_text",),
        )
        self.assertEqual(result["added"], 1)
        self.assertEqual(
            result["missingOptionalColumns"], ["専門内容について気になった点"]
        )
        self.assertIn("該当項目を除いて読み込みました", result["warnings"][0])
        self.assertEqual(self.service._load_store()["records"][0]["content_concern_text"], "")

    def test_optional_free_text_column_present_but_all_cells_empty_is_normal(self):
        result = self.import_rows([self.base_row(content_concern_text="")])
        self.assertEqual(result["missingOptionalColumns"], [])
        self.assertEqual(result["warnings"], [])

    def test_configured_alias_is_used_without_fuzzy_matching(self):
        alias = FEEDBACK_COLUMNS["content_concern_text"]["aliases"][0]
        payload = self.csv_bytes(
            [self.base_row(timestamp="alias")],
            header_overrides={"content_concern_text": alias},
        )
        result = self.service.import_csv(io.BytesIO(payload), "回答.csv", len(payload))
        item = next(
            item for item in result["headerMapping"]
            if item["internalField"] == "content_concern_text"
        )
        self.assertEqual(item["matchedBy"], "alias")

        unrelated = "教材は理解しやすかったですか？"
        payload = self.csv_bytes(
            [self.base_row(timestamp="unrelated")],
            header_overrides={"content_concern_text": unrelated},
        )
        result = self.service.import_csv(io.BytesIO(payload), "回答.csv", len(payload))
        self.assertIn("専門内容について気になった点", result["missingOptionalColumns"])
        self.assertNotIn(
            "content_concern_text",
            {item["internalField"] for item in result["headerMapping"]},
        )

    def test_free_text_body_keeps_internal_newlines_and_spaces(self):
        original = "一行目。\n  二行目は字下げする。"
        self.import_rows([self.base_row(improvement_text=original)])
        self.assertEqual(self.service._load_store()["records"][0]["improvement_text"], original)
        result = self.import_rows(
            [self.base_row(improvement_text="一行目。 二行目は字下げする。")]
        )
        self.assertEqual(result["added"], 0)
        self.assertEqual(result["duplicates"], 1)

    def test_missing_required_column_api_returns_foldable_diagnostic(self):
        self.application = create_app(self.repo, self.work)
        self.application.config.update(TESTING=True)
        payload = self.csv_bytes([self.base_row()], omit=("course_id",))
        response = self.application.test_client().post(
            "/api/feedback/import",
            data={"csv": (io.BytesIO(payload), "回答.csv")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertEqual(body["code"], "missing_feedback_columns")
        self.assertIn("・授業ID", body["error"])
        self.assertIn("解決した列マッピング", body["diagnostic"])
        page = self.application.test_client().get("/feedback").get_data(as_text=True)
        self.assertIn('id="feedback-import-technical"', page)
        self.assertIn('id="feedback-import-technical-text"', page)

    def test_invalid_course_and_unexpected_year_are_detected(self):
        with self.assertRaises(FeedbackError) as caught:
            self.import_rows([self.base_row(course_id="missing")])
        self.assertEqual(caught.exception.code, "unknown_course_id")
        with self.assertRaises(FeedbackError) as caught:
            self.import_rows([self.base_row(academic_year="2027")])
        self.assertEqual(caught.exception.code, "unexpected_academic_year")

    def test_different_years_are_kept_in_separate_groups(self):
        self.course["academicYear"] = None
        (self.repo / "data" / "courses.json").write_text(
            json.dumps({"courses": [self.course]}, ensure_ascii=False), encoding="utf-8"
        )
        self.import_rows([
            self.base_row(timestamp="2026-response", academic_year="2026"),
            self.base_row(timestamp="2027-response", academic_year="2027"),
        ])
        dashboard = self.service.dashboard()
        self.assertEqual({group["academic_year"] for group in dashboard["groups"]}, {"2026", "2027"})
        self.assertEqual(self.service.aggregate("web-programming", "2026")["total_count"], 1)
        self.assertEqual(self.service.aggregate("web-programming", "2027")["total_count"], 1)

    def test_title_mismatch_is_warning_but_course_id_wins(self):
        result = self.import_rows([self.base_row(course_title="WEBプログラミング")])
        self.assertEqual(result["added"], 1)
        self.assertEqual(len(result["warnings"]), 1)
        self.assertEqual(self.service._load_store()["records"][0]["course_title"], "Webプログラミング")

    def test_duplicate_csv_is_not_registered_twice(self):
        self.import_rows([self.base_row()])
        result = self.import_rows([self.base_row()])
        self.assertEqual(result["added"], 0)
        self.assertEqual(result["duplicates"], 1)
        self.assertEqual(len(self.service._load_store()["records"]), 1)

    def test_non_attendee_is_kept_but_excluded_from_aggregation(self):
        attendee = self.base_row()
        non_attendee = self.base_row(timestamp="2026/08/14 10:33:00", attended="いいえ")
        for key in [
            "content_understanding", "independent_application", "skill_growth", "goal_achievement",
            "explanation_clarity", "practice_usefulness", "question_support", "material_usefulness",
            "assignment_usefulness", "syllabus_alignment", "pace", "difficulty", "workload", "class_style",
        ]:
            non_attendee[key] = ""
        self.import_rows([attendee, non_attendee])
        summary = self.service.aggregate("web-programming", "2026")
        self.assertEqual(summary["total_count"], 2)
        self.assertEqual(summary["eligible_count"], 1)
        self.assertEqual(summary["excluded_count"], 1)

    def test_scale_distributions_and_not_applicable_are_correct(self):
        rows = [
            self.base_row(timestamp="1", content_understanding="1", question_support="質問していない"),
            self.base_row(timestamp="2", content_understanding="3", question_support="十分だった"),
            self.base_row(timestamp="3", content_understanding="5", question_support="とても十分だった"),
        ]
        self.import_rows(rows)
        summary = self.service.aggregate("web-programming", "2026")
        understanding = summary["scale_groups"]["learning"][0]
        support = summary["scale_groups"]["instruction"][2]
        self.assertEqual(understanding["average"], 3.0)
        self.assertEqual(understanding["distribution"], {"1": 1, "2": 0, "3": 1, "4": 0, "5": 1})
        self.assertEqual(support["count"], 2)
        self.assertEqual(support["not_applicable"], {"質問していない": 1})
        self.assertEqual(summary["difficulty"]["distribution"]["やや難しい"], 3)
        self.assertEqual(summary["workload"]["distribution"]["ちょうどよい"], 3)
        self.assertEqual(summary["class_style"]["distribution"]["制作中心"], 3)

    def test_concerns_and_low_syllabus_scores_create_review_items(self):
        self.import_rows([
            self.base_row(
                content_concern_text="他の授業で習った内容と違いました。",
                improvement_text="シラバスと実際の順番が違いました。",
                syllabus_alignment="2",
            )
        ])
        store = self.service._load_store()
        types = {issue["type"] for issue in store["issues"].values()}
        self.assertEqual(types, {"content_concern", "improvement", "syllabus_alignment"})
        summary = self.service.aggregate("web-programming", "2026")
        self.assertEqual(len(summary["issue_groups"]), 1)
        self.assertEqual(
            [issue["type"] for issue in summary["issue_groups"][0]["issues"]],
            ["content_concern", "syllabus_alignment", "improvement"],
        )
        issue = next(iter(store["issues"].values()))
        updated = self.service.update_issue(issue["issue_id"], "reviewed", "専門担当へ確認依頼済み")
        self.assertEqual(updated["issue"]["status"], "reviewed")

    def test_course_page_groups_issue_links_by_response_and_explains_sections(self):
        self.import_rows([
            self.base_row(
                content_concern_text="専門内容を確認したい。",
                improvement_text="説明方法を改善してほしい。",
            )
        ])
        self.application = create_app(self.repo, self.work)
        self.application.config.update(TESTING=True)
        page = self.application.test_client().get(
            "/feedback/course/web-programming/2026"
        )
        html = page.get_data(as_text=True)
        self.assertEqual(page.status_code, 200)
        self.assertEqual(html.count("回答を見る"), 1)
        self.assertIn("専門内容", html)
        self.assertIn("改善意見", html)
        self.assertIn("全回答から", html)
        self.assertIn("読み込んだすべての回答", html)

    def test_public_summary_excludes_free_text_and_personal_data(self):
        rows = [
            self.base_row(timestamp=str(index), content_concern_text="<script>alert(1)</script>")
            for index in range(3)
        ]
        self.import_rows(rows)
        result = self.service.save_public_summary("web-programming", "2026")
        published = self.service.public_path.read_text(encoding="utf-8")
        self.assertEqual(result["path"], "data/course-feedback-summary.json")
        self.assertNotIn("script", published)
        self.assertNotIn("student@example", published)
        self.assertIn("eligibleResponseCount", published)

    def test_empty_optional_text_and_zero_records_do_not_break_dashboard(self):
        self.assertEqual(self.service.dashboard()["total_count"], 0)
        self.import_rows([self.base_row(gained_skills_text="", helpful_points_text="")])
        summary = self.service.aggregate("web-programming", "2026")
        self.assertEqual(summary["text_counts"]["gained_skills_text"], 0)
        self.assertFalse(summary["summary_available"])

    def test_html_in_free_text_is_escaped_in_response_page(self):
        self.import_rows([self.base_row(improvement_text="<script>alert('x')</script>")])
        response_id = self.service._load_store()["records"][0]["response_id"]
        self.application = create_app(self.repo, self.work)
        self.application.config.update(TESTING=True)
        page = self.application.test_client().get(f"/feedback/response/{response_id}")
        html = page.get_data(as_text=True)
        self.assertEqual(page.status_code, 200)
        self.assertNotIn("<script>alert('x')</script>", html)
        self.assertIn("&lt;script&gt;", html)

    def test_summary_below_minimum_is_not_rendered_as_an_average(self):
        self.import_rows([self.base_row()])
        self.application = create_app(self.repo, self.work)
        self.application.config.update(TESTING=True)
        page = self.application.test_client().get("/feedback/course/web-programming/2026")
        html = page.get_data(as_text=True)
        self.assertEqual(page.status_code, 200)
        self.assertIn("平均と分布はまだ表示していません", html)
        self.assertNotIn("平均 4.00 / 5", html)


if __name__ == "__main__":
    unittest.main()
