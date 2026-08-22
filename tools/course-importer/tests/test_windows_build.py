from __future__ import annotations

import re
import unittest
from pathlib import Path


TOOL_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = TOOL_ROOT.parents[1]


class WindowsBuildContractTests(unittest.TestCase):
    def setUp(self):
        self.script = (TOOL_ROOT / "build_windows.ps1").read_text(encoding="utf-8")
        self.wrapper = (TOOL_ROOT / "build_windows.bat").read_text(encoding="utf-8")
        self.ignore = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
        self.guide = (REPO_ROOT / "docs" / "build-windows.md").read_text(encoding="utf-8")

    def test_build_is_repo_relative_and_reproducible(self):
        self.assertIn("$PSScriptRoot", self.script)
        self.assertIn(".venv", self.script)
        self.assertIn("requirements.txt", self.script)
        self.assertIn("requirements-build.txt", self.script)
        self.assertIn("Get-Command 'py.exe'", self.script)
        self.assertIn("Get-Command 'python.exe'", self.script)
        self.assertNotRegex(self.script, re.compile(r"C:\\Users\\", re.I))

    def test_pyinstaller_contract_preserves_existing_windows_behavior(self):
        for option in ("--onefile", "--noconsole", "--clean", "--noconfirm"):
            self.assertIn(option, self.script)
        self.assertIn(";templates", self.script)
        self.assertIn(";static", self.script)
        self.assertIn("app.py", self.script)
        self.assertIn("ClassView", self.script)
        self.assertNotIn("shell=True", self.script)
        self.assertNotIn("cmd /c", self.script.lower())

    def test_batch_file_is_a_thin_powershell_wrapper(self):
        self.assertIn("build_windows.ps1", self.wrapper)
        self.assertIn("-NoProfile", self.wrapper)
        self.assertIn("-ExecutionPolicy Bypass", self.wrapper)

    def test_generated_and_private_files_remain_ignored(self):
        for pattern in (
            "tools/course-importer/dist/",
            "tools/course-importer/build/",
            "tools/course-importer/*.spec",
            "*.xlsx",
            "*.xlsm",
            "*.xls",
        ):
            self.assertIn(pattern, self.ignore)

    def test_guide_documents_clone_build_output_and_verification(self):
        for text in (
            "clone",
            "build_windows.bat",
            "ClassView管理ツール.exe",
            "dist",
            "起動確認",
            "2回起動",
            "GitHub Releases",
        ):
            self.assertIn(text, self.guide)


if __name__ == "__main__":
    unittest.main()
