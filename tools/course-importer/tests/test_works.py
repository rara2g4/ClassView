from __future__ import annotations

import base64
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator
from werkzeug.datastructures import FileStorage, MultiDict


TOOL_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = TOOL_ROOT.parents[1]
sys.path.insert(0, str(TOOL_ROOT))

from importer import CourseImporter  # noqa: E402
from app import create_app  # noqa: E402
from works_service import CourseWorksService, WorksError  # noqa: E402


PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl8sAAAAASUVORK5CYII="
)


class CourseWorksServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory()
        base = Path(self.temp_directory.name)
        self.repo = base / "repo"
        self.work_root = base / "tool"
        (self.repo / "data").mkdir(parents=True)
        (self.repo / "docs").mkdir(parents=True)
        self.work_root.mkdir(parents=True)
        for name in (
            "course.schema.json",
            "course.template.json",
            "course-works.schema.json",
        ):
            shutil.copy2(REPO_ROOT / "data" / name, self.repo / "data" / name)
        shutil.copy2(
            REPO_ROOT / "docs" / "syllabus-conversion-prompt.md",
            self.repo / "docs" / "syllabus-conversion-prompt.md",
        )
        self.course = self.make_course("web-programming", "2026")
        self.next_course = self.make_course("web-programming-2027", "2027")
        self.write_json("courses.json", {"courses": [self.course, self.next_course]})
        self.write_json("archived-courses.json", {"courses": []})
        self.write_json("course-works.json", {"works": []})
        self.importer = CourseImporter(self.repo, self.work_root)
        self.service = CourseWorksService(self.repo, self.work_root, self.importer)
        self.publishers = []

    def tearDown(self):
        for publisher in self.publishers:
            for handler in list(publisher.logger.handlers):
                handler.close()
                publisher.logger.removeHandler(handler)
        self.temp_directory.cleanup()

    @staticmethod
    def make_course(course_id: str, year: str) -> dict:
        return {
            "id": course_id,
            "title": "Webプログラミング",
            "summary": "概要",
            "category": "情報",
            "grade": "2",
            "academicYear": year,
            "instructor": None,
            "courseType": "選択",
            "classStyle": "演習",
            "prerequisites": None,
            "learningGoals": "学びます。",
            "classFlow": None,
            "outcomes": None,
            "topics": [],
            "tools": [],
            "assignments": [],
            "schedule": [],
            "suitableFor": None,
            "images": [],
        }

    def write_json(self, name: str, value: dict) -> None:
        (self.repo / "data" / name).write_text(
            json.dumps(value, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    @staticmethod
    def form(mode: str, **overrides: str) -> MultiDict:
        values = {
            "displayMode": mode,
            "title": "学校紹介Webサイト",
            "description": "授業内で制作した作品です。",
            "url": "https://example.com/work",
            "linkLabel": "Webサイトを見る",
            "alt": "学校紹介Webサイトのトップページ",
            "permissionConfirmed": "on",
        }
        values.update(overrides)
        return MultiDict(values)

    @staticmethod
    def image(
        data: bytes = PNG_1X1,
        filename: str = "screenshot.png",
        content_type: str = "image/png",
    ) -> FileStorage:
        return FileStorage(
            stream=io.BytesIO(data),
            filename=filename,
            content_type=content_type,
        )

    def test_image_link_and_combined_works_are_saved_in_independent_document(self):
        image_only = self.service.add(
            self.course["id"],
            self.form("image", url="", linkLabel=""),
            self.image(filename="../../student-name.png"),
        )["work"]
        link_only = self.service.add(
            self.course["id"], self.form("link"), None
        )["work"]
        combined = self.service.add(
            self.course["id"], self.form("both", title="動画作品"), self.image()
        )["work"]

        self.assertIsNone(image_only["url"])
        self.assertIsNone(link_only["image"])
        self.assertTrue(combined["image"])
        self.assertTrue(combined["url"].startswith("https://"))
        self.assertNotIn("student-name", image_only["image"])
        self.assertNotIn("..", image_only["image"])
        self.assertTrue((self.repo / image_only["image"]).is_file())
        self.assertEqual([work["order"] for work in self.service.works_for(self.course["id"], "2026")], [0, 1, 2])
        Draft202012Validator(
            json.loads((self.repo / "data" / "course-works.schema.json").read_text(encoding="utf-8"))
        ).validate(self.service.load_document())

    def test_permission_and_safe_http_url_are_required(self):
        with self.assertRaisesRegex(WorksError, "掲載許可"):
            self.service.add(
                self.course["id"],
                self.form("link", permissionConfirmed=""),
            )
        with self.assertRaisesRegex(WorksError, "http://"):
            self.service.add(
                self.course["id"],
                self.form("link", url="javascript:alert(1)"),
            )

    def test_image_mime_signature_size_and_dimensions_are_checked(self):
        with self.assertRaisesRegex(WorksError, "内容と画像形式"):
            self.service.add(
                self.course["id"],
                self.form("image", url=""),
                self.image(content_type="image/jpeg"),
            )
        oversized = b"\x89PNG\r\n\x1a\n" + b"0" * self.service.MAX_IMAGE_BYTES
        with self.assertRaisesRegex(WorksError, "5MB"):
            self.service.add(
                self.course["id"], self.form("image", url=""), self.image(oversized)
            )
        huge_png = bytearray(PNG_1X1)
        huge_png[16:20] = (20_000).to_bytes(4, "big")
        huge_png[20:24] = (20_000).to_bytes(4, "big")
        with self.assertRaisesRegex(WorksError, "縦横サイズ"):
            self.service.add(
                self.course["id"], self.form("image", url=""), self.image(bytes(huge_png))
            )

    def test_edit_move_delete_and_backups_keep_data_recoverable(self):
        first = self.service.add(
            self.course["id"], self.form("both", title="作品A"), self.image()
        )["work"]
        second = self.service.add(
            self.course["id"], self.form("link", title="作品B"), None
        )["work"]
        moved = self.service.move(second["id"], "up")
        self.assertTrue(moved["moved"])
        self.assertEqual(self.service.works_for(self.course["id"], "2026")[0]["id"], second["id"])

        updated = self.service.update(
            first["id"], self.form("link", title="作品A 更新", alt=""), None
        )["work"]
        self.assertEqual(updated["title"], "作品A 更新")
        self.assertTrue(updated["image"])
        deleted = self.service.delete(first["id"])
        self.assertEqual(deleted["work"]["id"], first["id"])
        self.assertEqual(len(self.service.works_for(self.course["id"], "2026")), 1)
        self.assertTrue(any(self.importer.backups_root.glob("course-works-*.json")))
        self.assertTrue(any((self.importer.backups_root / "course-works-assets").iterdir()))

    def test_years_are_not_mixed_and_rollover_does_not_copy_works(self):
        self.service.add(
            self.course["id"], self.form("link", title="2026作品"), None
        )
        self.assertEqual(len(self.service.works_for(self.course["id"], "2026")), 1)
        self.assertEqual(self.service.works_for(self.course["id"], "2027"), [])
        self.assertEqual(self.service.works_for(self.next_course["id"], "2027"), [])

    def test_archive_keeps_works_and_permanent_delete_does_not_remove_them(self):
        work = self.service.add(
            self.course["id"], self.form("link"), None
        )["work"]
        current = self.importer.managed_course("published", self.course["id"])
        self.importer.archive_managed_course(self.course["id"], current["hash"])
        self.assertEqual(self.service.work_count(self.course["id"]), 1)
        archived = self.importer.managed_course("archived", self.course["id"])
        self.importer.permanently_delete_archived_course(self.course["id"], archived["hash"])
        self.assertEqual(self.service.load_document()["works"][0]["id"], work["id"])

    def test_management_page_and_api_do_not_require_json_or_path_input(self):
        app = create_app(self.repo, self.work_root)
        app.config.update(TESTING=True)
        publisher = app.config["PUBLISHER_SERVICE"]
        self.publishers.append(publisher)
        client = app.test_client()
        page = client.get(f"/works/course/{self.course['id']}")
        self.assertEqual(page.status_code, 200)
        self.assertIn("制作物を追加".encode("utf-8"), page.data)
        self.assertNotIn("画像パス".encode("utf-8"), page.data)

        response = client.post(
            f"/api/works/course/{self.course['id']}",
            data={
                "displayMode": "link",
                "title": "公開アプリ",
                "description": "外部で公開しています。",
                "url": "https://example.com/app",
                "linkLabel": "実際に動かす",
                "alt": "",
                "permissionConfirmed": "on",
            },
        )
        self.assertEqual(response.status_code, 200)
        catalog = client.get("/api/manage/courses").get_json()
        summary = next(
            item for item in catalog["published"] if item["id"] == self.course["id"]
        )
        self.assertEqual(summary["workCount"], 1)


if __name__ == "__main__":
    unittest.main()
