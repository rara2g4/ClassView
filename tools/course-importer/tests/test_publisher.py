from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


TOOL_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = TOOL_ROOT.parents[1]
sys.path.insert(0, str(TOOL_ROOT))

from importer import CourseImporter  # noqa: E402
from publisher import (  # noqa: E402
    ClassViewPublisher,
    PublicationError,
    run_git,
    run_hidden_process,
)


class ClassViewPublisherTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory()
        base = Path(self.temp_directory.name)
        self.repo = base / "repo"
        self.remote = base / "remote.git"
        self.work = self.repo / "tools" / "course-importer"
        (self.repo / "data").mkdir(parents=True)
        (self.repo / "docs").mkdir(parents=True)
        self.work.mkdir(parents=True)
        for name in ("course.schema.json", "course.template.json"):
            shutil.copy2(REPO_ROOT / "data" / name, self.repo / "data" / name)
        shutil.copy2(
            REPO_ROOT / "docs" / "syllabus-conversion-prompt.md",
            self.repo / "docs" / "syllabus-conversion-prompt.md",
        )
        self.course = self.make_course("existing", "既存授業")
        self.write_courses([self.course])
        self.write_archived([])
        (self.work / "classview-admin.json").write_text(
            json.dumps(
                {
                    "remoteName": "origin",
                    "expectedBranch": "main",
                    "expectedRemoteUrl": str(self.remote),
                    "publicUrl": "https://example.invalid/ClassView/",
                }
            ),
            encoding="utf-8",
        )
        (self.repo / ".gitignore").write_text(
            "tools/course-importer/logs/\n", encoding="utf-8"
        )
        self.git("init")
        self.git("branch", "-M", "main")
        self.git("config", "user.name", "ClassView Test")
        self.git("config", "user.email", "classview@example.invalid")
        subprocess.run(
            ["git", "init", "--bare", str(self.remote)],
            check=True,
            capture_output=True,
        )
        self.git("remote", "add", "origin", str(self.remote))
        self.git(
            "add",
            "--",
            "data/courses.json",
            "data/archived-courses.json",
            "data/course.schema.json",
            "data/course.template.json",
            "docs/syllabus-conversion-prompt.md",
            "tools/course-importer/classview-admin.json",
            ".gitignore",
        )
        self.git("commit", "-m", "initial")
        self.git("push", "-u", "origin", "main")
        self.importer = CourseImporter(self.repo, self.work)
        self.publisher = ClassViewPublisher(self.repo, self.work, self.importer)

    def tearDown(self):
        for handler in list(self.publisher.logger.handlers):
            handler.close()
            self.publisher.logger.removeHandler(handler)
        self.temp_directory.cleanup()

    @staticmethod
    def make_course(course_id: str, title: str) -> dict:
        return {
            "id": course_id,
            "title": title,
            "summary": "概要です。",
            "category": "情報",
            "grade": "1",
            "academicYear": "2026",
            "instructor": "担当者",
            "courseType": "選択",
            "classStyle": "講義",
            "prerequisites": None,
            "learningGoals": "基礎を学びます。",
            "classFlow": None,
            "outcomes": None,
            "topics": [],
            "tools": [],
            "assignments": [],
            "schedule": [],
            "suitableFor": None,
            "images": [],
        }

    def git(self, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", *args],
            cwd=cwd or self.repo,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )

    def write_courses(self, courses: list[dict]) -> None:
        (self.repo / "data" / "courses.json").write_text(
            json.dumps({"courses": courses}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def write_archived(self, courses: list[dict]) -> None:
        (self.repo / "data" / "archived-courses.json").write_text(
            json.dumps({"courses": courses}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def clone_for_other_editor(self) -> Path:
        other = Path(self.temp_directory.name) / "other"
        subprocess.run(
            ["git", "clone", str(self.remote), str(other)],
            check=True,
            capture_output=True,
        )
        subprocess.run(["git", "checkout", "main"], cwd=other, check=True, capture_output=True)
        subprocess.run(
            ["git", "config", "user.name", "Other Editor"],
            cwd=other,
            check=True,
        )
        subprocess.run(
            ["git", "config", "user.email", "other@example.invalid"],
            cwd=other,
            check=True,
        )
        return other

    def test_status_reports_unpublished_human_readable_change(self):
        changed = dict(self.course)
        changed["instructor"] = "新しい担当者"
        self.write_courses([changed])
        status = self.publisher.status()
        self.assertEqual(status["syncState"], "unpublished")
        self.assertEqual(status["unpublishedCount"], 1)
        self.assertEqual(status["unpublishedChanges"][0]["description"], "講師名を変更")
        self.assertTrue(status["canPublish"])

    def test_feedback_summary_is_the_only_additional_public_feedback_file(self):
        summary_path = self.repo / "data" / "course-feedback-summary.json"
        summary_path.write_text(
            json.dumps(
                {
                    "version": 1,
                    "generatedAt": "2026-08-14T00:00:00+00:00",
                    "courses": [],
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        status = self.publisher.status()
        self.assertEqual(status["unpublishedCount"], 1)
        self.assertEqual(status["unpublishedChanges"][0]["title"], "受講者フィードバック集計")
        self.publisher.publish()
        committed = self.git("show", "--name-only", "--format=", "HEAD").stdout.splitlines()
        self.assertEqual(committed, ["data/course-feedback-summary.json"])

    def test_hidden_process_uses_argument_array_and_windows_console_flags(self):
        completed = subprocess.CompletedProcess(["git", "status"], 0, "ok", "")
        with patch("publisher.subprocess.run", return_value=completed) as mocked_run:
            result = run_hidden_process(
                ["git", "status"], capture_output=True, text=True
            )

        self.assertIs(result, completed)
        command, = mocked_run.call_args.args
        options = mocked_run.call_args.kwargs
        self.assertEqual(command, ["git", "status"])
        self.assertFalse(options["shell"])
        self.assertTrue(options["capture_output"])
        if sys.platform == "win32":
            self.assertTrue(
                options["creationflags"] & subprocess.CREATE_NO_WINDOW
            )
            self.assertIn("startupinfo", options)
            self.assertTrue(
                options["startupinfo"].dwFlags & subprocess.STARTF_USESHOWWINDOW
            )
            self.assertEqual(options["startupinfo"].wShowWindow, subprocess.SW_HIDE)
        else:
            self.assertNotIn("creationflags", options)
            self.assertNotIn("startupinfo", options)

    def test_hidden_process_does_not_pass_windows_flags_on_other_platforms(self):
        completed = subprocess.CompletedProcess(["git", "status"], 0, "", "")
        with (
            patch("publisher.os.name", "posix"),
            patch("publisher.subprocess.run", return_value=completed) as mocked_run,
        ):
            run_hidden_process(["git", "status"])

        options = mocked_run.call_args.kwargs
        self.assertNotIn("creationflags", options)
        self.assertNotIn("startupinfo", options)

    def test_hidden_process_rejects_shell_commands(self):
        with self.assertRaises(TypeError):
            run_hidden_process("git status")
        with self.assertRaises(ValueError):
            run_hidden_process(["git", "status"], shell=True)

    def test_run_git_captures_results_and_disables_interactive_prompts(self):
        completed = subprocess.CompletedProcess(["git", "status"], 0, "ok", "")
        with patch("publisher.run_hidden_process", return_value=completed) as mocked_run:
            result = run_git(self.repo, ["status"], timeout=12)

        self.assertIs(result, completed)
        command, = mocked_run.call_args.args
        options = mocked_run.call_args.kwargs
        self.assertEqual(command, ["git", "status"])
        self.assertTrue(options["capture_output"])
        self.assertTrue(options["text"])
        self.assertEqual(options["timeout"], 12)
        self.assertEqual(options["env"]["GIT_TERMINAL_PROMPT"], "0")
        self.assertEqual(options["env"]["GCM_INTERACTIVE"], "never")

    def test_git_failures_are_returned_as_staff_facing_errors(self):
        authentication = subprocess.CompletedProcess(
            ["git", "push"],
            128,
            "",
            "fatal: Cannot prompt because user interactivity has been disabled.",
        )
        network = subprocess.CompletedProcess(
            ["git", "fetch"],
            128,
            "",
            "fatal: unable to access repository: Could not resolve host",
        )

        authentication_error = self.publisher._friendly_git_error(
            "ClassViewへの公開", authentication
        )
        network_error = self.publisher._friendly_git_error(
            "最新状態の確認", network
        )

        self.assertEqual(authentication_error.code, "authentication_required")
        self.assertIn("ログイン", authentication_error.message)
        self.assertEqual(network_error.code, "network_unavailable")
        self.assertIn("インターネット", network_error.message)
        self.assertIn("終了コード", authentication_error.technical)

    def test_reconnect_starts_credential_manager_through_hidden_helper(self):
        process = unittest.mock.MagicMock()
        with (
            patch("publisher.shutil.which", return_value="git"),
            patch("publisher.start_hidden_process", return_value=process) as mocked_start,
            patch("publisher.threading.Thread") as mocked_thread,
        ):
            result = self.publisher.reconnect()

        command, = mocked_start.call_args.args
        options = mocked_start.call_args.kwargs
        self.assertEqual(
            command, ["git", "credential-manager", "github", "login"]
        )
        self.assertIs(options["stdout"], subprocess.PIPE)
        self.assertIs(options["stderr"], subprocess.PIPE)
        mocked_thread.return_value.start.assert_called_once_with()
        self.assertIn("再接続", result["message"])

    def test_publish_stages_only_allowed_files_and_keeps_other_working_changes(self):
        new_course = self.make_course("new-course", "新しい授業")
        self.write_courses([self.course, new_course])
        (self.repo / "developer-note.txt").write_text("do not publish", encoding="utf-8")
        original_run = subprocess.run
        calls: list[tuple[list[str], bool]] = []

        def recording_run(command, *args, **kwargs):
            calls.append((list(command), kwargs.get("shell", False)))
            return original_run(command, *args, **kwargs)

        with patch("publisher.subprocess.run", side_effect=recording_run):
            result = self.publisher.publish()

        self.assertTrue(result["success"])
        add_calls = [command for command, _shell in calls if command[:2] == ["git", "add"]]
        self.assertEqual(
            add_calls,
            [["git", "add", "--", "data/courses.json"]],
        )
        self.assertTrue(all(not shell for _command, shell in calls))
        committed = self.git("show", "--name-only", "--pretty=format:", "HEAD").stdout.splitlines()
        self.assertEqual(committed, ["data/courses.json"])
        self.assertTrue((self.repo / "developer-note.txt").exists())
        self.assertIn("developer-note.txt", self.git("status", "--porcelain").stdout)

    def test_publish_handles_special_characters_without_shell_execution(self):
        unsafe_title = '授業" & echo dangerous'
        self.write_courses([self.course, self.make_course("special", unsafe_title)])
        result = self.publisher.publish()
        self.assertTrue(result["success"])
        self.assertIn(unsafe_title, self.git("log", "-1", "--pretty=%s").stdout)

    def test_publish_busy_state_is_released_after_failure(self):
        with patch.object(
            self.publisher,
            "_publish_once",
            side_effect=PublicationError("失敗"),
        ):
            with self.assertRaises(PublicationError):
                self.publisher.publish()
        self.assertFalse(self.publisher.is_busy())

    def test_clean_repository_fast_forwards_when_remote_only_is_newer(self):
        other = self.clone_for_other_editor()
        document = json.loads((other / "data" / "courses.json").read_text(encoding="utf-8"))
        document["courses"].append(self.make_course("remote-course", "別PCの授業"))
        (other / "data" / "courses.json").write_text(
            json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        subprocess.run(["git", "add", "--", "data/courses.json"], cwd=other, check=True)
        subprocess.run(["git", "commit", "-m", "remote update"], cwd=other, check=True)
        subprocess.run(["git", "push", "origin", "main"], cwd=other, check=True)

        status = self.publisher.status(refresh=True, auto_update=True)
        self.assertEqual(
            status["syncState"],
            "current",
            f"status={status!r}, paths={self.publisher._working_paths()!r}",
        )
        current = json.loads((self.repo / "data" / "courses.json").read_text(encoding="utf-8"))
        self.assertIn("remote-course", [course["id"] for course in current["courses"]])

    def test_local_and_remote_changes_stop_publication_without_data_loss(self):
        other = self.clone_for_other_editor()
        remote_document = json.loads(
            (other / "data" / "courses.json").read_text(encoding="utf-8")
        )
        remote_document["courses"][0]["summary"] = "別PCで変更"
        (other / "data" / "courses.json").write_text(
            json.dumps(remote_document, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        subprocess.run(["git", "add", "--", "data/courses.json"], cwd=other, check=True)
        subprocess.run(["git", "commit", "-m", "remote update"], cwd=other, check=True)
        subprocess.run(["git", "push", "origin", "main"], cwd=other, check=True)

        local_document = json.loads(
            (self.repo / "data" / "courses.json").read_text(encoding="utf-8")
        )
        local_document["courses"][0]["instructor"] = "このPCで変更"
        self.write_courses(local_document["courses"])
        before = (self.repo / "data" / "courses.json").read_bytes()

        status = self.publisher.status(refresh=True)
        self.assertEqual(status["syncState"], "conflict")
        with self.assertRaises(PublicationError) as context:
            self.publisher.publish()
        self.assertEqual(context.exception.code, "remote_changed")
        self.assertEqual(before, (self.repo / "data" / "courses.json").read_bytes())

    def test_missing_git_remote_branch_and_invalid_json_are_detected(self):
        with patch("publisher.shutil.which", return_value=None):
            status = self.publisher.status()
        self.assertEqual(status["syncState"], "error")
        self.assertTrue(any(check["state"] == "error" for check in status["checks"]))

        self.git("remote", "remove", "origin")
        remote_status = self.publisher.status()
        self.assertEqual(remote_status["syncState"], "error")

        self.write_courses([])
        (self.repo / "data" / "courses.json").write_text("{", encoding="utf-8")
        invalid_status = self.publisher.status()
        self.assertTrue(any(check["label"] == "授業データ" and check["state"] == "error" for check in invalid_status["checks"]))

    def test_sensitive_values_are_removed_from_diagnostics(self):
        value = "https://name:secret@example.com/repo.git token=ghp_abcdefghijklmnopqrstuvwxyz"
        sanitized = self.publisher._sanitize(value)
        self.assertNotIn("secret", sanitized)
        self.assertNotIn("ghp_", sanitized)

    def test_invalid_configuration_is_reported_without_crashing_startup(self):
        for handler in list(self.publisher.logger.handlers):
            handler.close()
            self.publisher.logger.removeHandler(handler)
        (self.work / "classview-admin.json").write_text("{", encoding="utf-8")
        publisher = ClassViewPublisher(self.repo, self.work, self.importer)
        self.publisher = publisher
        status = publisher.status()
        self.assertEqual(status["syncState"], "error")
        self.assertEqual(status["supportCode"], "invalid_configuration")


if __name__ == "__main__":
    unittest.main()
