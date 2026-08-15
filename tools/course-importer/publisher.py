"""Safe, staff-facing publication workflow for the local ClassView tool."""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import threading
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Sequence


def _hidden_process_options() -> dict[str, Any]:
    """Return Windows-only flags that prevent CLI console windows."""
    if os.name != "nt":
        return {}

    options: dict[str, Any] = {
        "creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0),
    }
    startup_info_factory = getattr(subprocess, "STARTUPINFO", None)
    if startup_info_factory is not None:
        startup_info = startup_info_factory()
        startup_info.dwFlags |= getattr(subprocess, "STARTF_USESHOWWINDOW", 0)
        startup_info.wShowWindow = getattr(subprocess, "SW_HIDE", 0)
        options["startupinfo"] = startup_info
    return options


def _command_parts(command: Sequence[str]) -> list[str]:
    """Require an argument array so values are never interpreted by a shell."""
    if isinstance(command, (str, bytes)):
        raise TypeError("command must be an argument array")
    parts = [str(part) for part in command]
    if not parts:
        raise ValueError("command must not be empty")
    return parts


def run_hidden_process(
    command: Sequence[str], **kwargs: Any
) -> subprocess.CompletedProcess[str]:
    """Run a CLI process without a console window on Windows."""
    if kwargs.get("shell") not in (None, False):
        raise ValueError("shell execution is not allowed")
    kwargs["shell"] = False
    kwargs.update(_hidden_process_options())
    return subprocess.run(_command_parts(command), **kwargs)


def start_hidden_process(command: Sequence[str], **kwargs: Any) -> subprocess.Popen[str]:
    """Start an asynchronous CLI process without a console window on Windows."""
    if kwargs.get("shell") not in (None, False):
        raise ValueError("shell execution is not allowed")
    kwargs["shell"] = False
    kwargs.update(_hidden_process_options())
    return subprocess.Popen(_command_parts(command), **kwargs)


def run_git(
    repo_root: Path,
    args: Sequence[str],
    *,
    timeout: int = 45,
    allow_prompt: bool = False,
) -> subprocess.CompletedProcess[str]:
    """Run every non-interactive Git command through the hidden CLI helper."""
    environment = dict(os.environ)
    if not allow_prompt:
        environment["GIT_TERMINAL_PROMPT"] = "0"
        environment["GCM_INTERACTIVE"] = "never"
    return run_hidden_process(
        ["git", *args],
        cwd=repo_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        env=environment,
    )


class PublicationError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "publication_error",
        status: int = 400,
        technical: str = "",
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.technical = technical


class ClassViewPublisher:
    """Inspect, synchronize and publish only ClassView course data files."""

    allowed_paths = (
        "data/courses.json",
        "data/archived-courses.json",
        "data/course-feedback-summary.json",
    )
    field_labels = {
        "title": "授業名",
        "summary": "授業概要",
        "category": "分野",
        "grade": "対象学年",
        "academicYear": "年度",
        "instructor": "講師名",
        "courseType": "区分",
        "classStyle": "授業形式",
        "prerequisites": "前提知識",
        "learningGoals": "授業概要・到達目標",
        "classFlow": "授業の進め方",
        "outcomes": "身につく知識・技能",
        "topics": "主な学習内容",
        "tools": "教材・ソフトウェア",
        "assignments": "課題・制作物",
        "schedule": "授業回",
        "suitableFor": "向いている学生",
        "images": "画像",
    }

    def __init__(self, repo_root: Path, tool_root: Path, importer: Any) -> None:
        self.repo_root = Path(repo_root).resolve()
        self.tool_root = Path(tool_root).resolve()
        self.importer = importer
        self.config_path = self.tool_root / "classview-admin.json"
        self.logs_root = self.tool_root / "logs"
        self.logs_root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self._activity_lock = threading.Lock()
        self._active_operations = 0
        self.last_diagnostic = ""
        self.logger = self._create_logger()
        try:
            self.config = self._load_config()
        except PublicationError as error:
            self.config = self._default_config()
            self.last_diagnostic = error.technical

    def _create_logger(self) -> logging.Logger:
        logger = logging.getLogger(f"classview-admin-{self.tool_root}")
        logger.setLevel(logging.INFO)
        logger.propagate = False
        if not logger.handlers:
            handler = RotatingFileHandler(
                self.logs_root / "admin.log",
                maxBytes=1024 * 1024,
                backupCount=3,
                encoding="utf-8",
            )
            handler.setFormatter(
                logging.Formatter("%(asctime)s\t%(levelname)s\t%(message)s")
            )
            logger.addHandler(handler)
        return logger

    @staticmethod
    def _default_config() -> dict[str, str]:
        return {
            "remoteName": "origin",
            "expectedBranch": "main",
            "expectedRemoteUrl": "",
            "publicUrl": "",
        }

    def _load_config(self) -> dict[str, Any]:
        defaults = self._default_config()
        try:
            loaded = json.loads(self.config_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            loaded = {}
        except (OSError, json.JSONDecodeError) as error:
            raise PublicationError(
                "ClassViewの公開設定を読み込めません。管理担当者へ確認してください。",
                code="invalid_configuration",
                status=500,
                technical=str(error),
            ) from error
        if not isinstance(loaded, dict):
            raise PublicationError(
                "ClassViewの公開設定を確認できません。管理担当者へ確認してください。",
                code="invalid_configuration",
                status=500,
            )
        config = {**defaults, **loaded}
        for key in defaults:
            if not isinstance(config[key], str):
                raise PublicationError(
                    "ClassViewの公開設定に問題があります。管理担当者へ確認してください。",
                    code="invalid_configuration",
                    status=500,
                )
        return config

    @staticmethod
    def _sanitize(value: str) -> str:
        text = value or ""
        text = re.sub(r"https://[^\s/@]+:[^\s/@]+@", "https://***@", text)
        text = re.sub(
            r"(?i)(authorization|token|password|secret)\s*[:=]\s*\S+",
            r"\1=<非表示>",
            text,
        )
        text = re.sub(r"\b(?:ghp|github_pat)_[A-Za-z0-9_]+\b", "<非表示>", text)
        return text.strip()

    def _remember_diagnostic(
        self, action: str, result: subprocess.CompletedProcess[str] | None = None, error: str = ""
    ) -> str:
        branch = self._run_git_quiet(["branch", "--show-current"])
        remote = self._run_git_quiet(
            ["remote", "get-url", self.config.get("remoteName", "origin")]
        )
        lines = [
            f"日時: {datetime.now().astimezone().isoformat(timespec='seconds')}",
            f"処理: {action}",
            f"ブランチ: {branch or '確認できません'}",
            f"接続先: {self._sanitize(remote) or '確認できません'}",
        ]
        if result is not None:
            lines.extend(
                [
                    f"終了コード: {result.returncode}",
                    f"標準エラー: {self._sanitize(result.stderr) or 'なし'}",
                ]
            )
        elif error:
            lines.append(f"詳細: {self._sanitize(error)}")
        self.last_diagnostic = "\n".join(lines)
        return self.last_diagnostic

    def _run_git_quiet(self, args: list[str]) -> str:
        try:
            result = run_git(self.repo_root, args, timeout=10)
        except (OSError, subprocess.SubprocessError):
            return ""
        return result.stdout.strip() if result.returncode == 0 else ""

    def _friendly_git_error(
        self, action: str, result: subprocess.CompletedProcess[str]
    ) -> PublicationError:
        detail = self._sanitize(f"{result.stdout}\n{result.stderr}")
        lowered = detail.casefold()
        technical = self._remember_diagnostic(action, result)
        if any(
            word in lowered
            for word in (
                "authentication",
                "credential",
                "logon failed",
                "terminal prompts disabled",
                "could not read username",
                "user interactivity has been disabled",
            )
        ):
            return PublicationError(
                "公開サービスへのログインが必要です。再接続を行ってください。",
                code="authentication_required",
                status=409,
                technical=technical,
            )
        if any(
            word in lowered
            for word in (
                "could not resolve host",
                "failed to connect",
                "network is unreachable",
                "unable to access",
                "timed out",
            )
        ):
            return PublicationError(
                "インターネットに接続できません。接続を確認してからもう一度お試しください。",
                code="network_unavailable",
                status=503,
                technical=technical,
            )
        if any(word in lowered for word in ("non-fast-forward", "fetch first", "rejected")):
            return PublicationError(
                "公開サイト側に新しい変更があります。データを守るため公開を停止しました。管理担当者へ確認してください。",
                code="remote_changed",
                status=409,
                technical=technical,
            )
        return PublicationError(
            "公開処理を完了できませんでした。データはこのPCに保存されています。管理担当者へ確認してください。",
            code="publication_failed",
            status=500,
            technical=technical,
        )

    def _git(
        self,
        args: list[str],
        *,
        action: str,
        timeout: int = 45,
        check: bool = True,
        allow_prompt: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        try:
            result = run_git(
                self.repo_root,
                args,
                timeout=timeout,
                allow_prompt=allow_prompt,
            )
        except FileNotFoundError as error:
            technical = self._remember_diagnostic(action, error=str(error))
            raise PublicationError(
                "ClassViewの公開機能に必要な構成が見つかりません。管理担当者による初回設定が必要です。",
                code="git_missing",
                status=503,
                technical=technical,
            ) from error
        except subprocess.TimeoutExpired as error:
            technical = self._remember_diagnostic(action, error=str(error))
            raise PublicationError(
                "公開サービスから時間内に応答がありませんでした。インターネット接続を確認してください。",
                code="network_timeout",
                status=503,
                technical=technical,
            ) from error
        if check and result.returncode != 0:
            raise self._friendly_git_error(action, result)
        return result

    @staticmethod
    def _normalize_remote(value: str) -> str:
        normalized = value.strip().rstrip("/")
        return normalized[:-4] if normalized.casefold().endswith(".git") else normalized

    def _repository_checks(self) -> dict[str, Any]:
        if shutil.which("git") is None:
            raise PublicationError(
                "ClassViewの公開機能に必要な構成が見つかりません。管理担当者による初回設定が必要です。",
                code="git_missing",
                status=503,
            )
        root = self._git(
            ["rev-parse", "--show-toplevel"], action="保存場所の確認"
        ).stdout.strip()
        if Path(root).resolve() != self.repo_root:
            raise PublicationError(
                "ClassViewの保存場所を確認できません。管理担当者へ確認してください。",
                code="repository_invalid",
                status=409,
            )
        remote_name = self.config["remoteName"]
        remote_url = self._git(
            ["remote", "get-url", remote_name], action="公開設定の確認"
        ).stdout.strip()
        expected_remote = self.config["expectedRemoteUrl"]
        if expected_remote and self._normalize_remote(remote_url) != self._normalize_remote(
            expected_remote
        ):
            raise PublicationError(
                "ClassViewの公開設定が想定と異なります。管理担当者へ確認してください。",
                code="remote_mismatch",
                status=409,
            )
        branch = self._git(
            ["branch", "--show-current"], action="作業状態の確認"
        ).stdout.strip()
        if branch != self.config["expectedBranch"]:
            raise PublicationError(
                "ClassViewを更新できる状態ではありません。管理担当者へ確認してください。",
                code="branch_mismatch",
                status=409,
            )
        return {"branch": branch, "remoteName": remote_name, "remoteUrl": remote_url}

    def _load_document(self, path: Path) -> dict[str, Any]:
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise PublicationError(
                "授業データを読み込めません。入力内容を確認してください。",
                code="data_invalid",
                status=409,
                technical=self._remember_diagnostic("授業データの確認", error=str(error)),
            ) from error
        if not isinstance(value, dict) or not isinstance(value.get("courses"), list):
            raise PublicationError(
                "授業データに入力上の問題があります。管理画面で内容を確認してください。",
                code="data_invalid",
                status=409,
            )
        return value

    def _document_at_ref(self, reference: str, relative_path: str) -> dict[str, Any]:
        result = self._git(
            ["show", f"{reference}:{relative_path}"],
            action="未公開変更の確認",
            check=False,
        )
        if result.returncode != 0:
            return {"courses": []}
        try:
            document = json.loads(result.stdout)
        except json.JSONDecodeError:
            return {"courses": []}
        return document if isinstance(document, dict) else {"courses": []}

    @staticmethod
    def _course_map(document: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return {
            course["id"]: course
            for course in document.get("courses", [])
            if isinstance(course, dict) and isinstance(course.get("id"), str)
        }

    def _remote_ref_exists(self) -> bool:
        remote_ref = f"{self.config['remoteName']}/{self.config['expectedBranch']}"
        result = self._git(
            ["rev-parse", "--verify", remote_ref],
            action="公開状態の確認",
            check=False,
        )
        return result.returncode == 0

    def _base_ref(self) -> str:
        if self._remote_ref_exists():
            return f"{self.config['remoteName']}/{self.config['expectedBranch']}"
        return "HEAD"

    def unpublished_changes(self) -> list[dict[str, Any]]:
        base_ref = self._base_ref()
        current_public = self._course_map(
            self._load_document(self.repo_root / "data" / "courses.json")
        )
        current_archive = self._course_map(
            self._load_document(self.repo_root / "data" / "archived-courses.json")
        )
        base_public = self._course_map(
            self._document_at_ref(base_ref, "data/courses.json")
        )
        base_archive = self._course_map(
            self._document_at_ref(base_ref, "data/archived-courses.json")
        )
        changes: list[dict[str, Any]] = []

        archived_ids = (set(base_public) - set(current_public)) & (
            set(current_archive) - set(base_archive)
        )
        restored_ids = (set(base_archive) - set(current_archive)) & (
            set(current_public) - set(base_public)
        )
        for course_id in sorted(archived_ids):
            course = current_archive[course_id]
            changes.append(self._change_item(course, "archive", "アーカイブ"))
        for course_id in sorted(restored_ids):
            course = current_public[course_id]
            changes.append(self._change_item(course, "restore", "公開授業へ復元"))

        for course_id in sorted(set(current_public) - set(base_public) - restored_ids):
            course = current_public[course_id]
            year = self._year_label(course)
            description = f"{year}版を追加" if year else "新しい授業として追加"
            changes.append(self._change_item(course, "add", description))
        for course_id in sorted(set(base_public) & set(current_public)):
            before, after = base_public[course_id], current_public[course_id]
            if before == after:
                continue
            fields = [key for key in after.keys() | before.keys() if before.get(key) != after.get(key)]
            labels = [self.field_labels.get(field, field) for field in fields if field != "id"]
            if len(labels) == 1:
                description = f"{labels[0]}を変更"
            else:
                description = f"{len(labels)}項目を更新"
            item = self._change_item(after, "update", description)
            item["fields"] = labels
            changes.append(item)
        for course_id in sorted(set(base_public) - set(current_public) - archived_ids):
            changes.append(
                self._change_item(base_public[course_id], "remove", "公開対象から削除")
            )
        for course_id in sorted(set(base_archive) - set(current_archive) - restored_ids):
            changes.append(
                self._change_item(base_archive[course_id], "delete", "管理データから完全削除")
            )
        if "data/course-feedback-summary.json" in self._working_paths():
            changes.append(
                {
                    "id": "course-feedback-summary",
                    "title": "受講者フィードバック集計",
                    "academicYear": None,
                    "action": "feedback-summary",
                    "description": "公開用集計を更新",
                }
            )
        return changes

    @staticmethod
    def _year_label(course: dict[str, Any]) -> str:
        year = course.get("academicYear")
        return f"{year}年度" if isinstance(year, str) and year.strip() else ""

    def _change_item(
        self, course: dict[str, Any], action: str, description: str
    ) -> dict[str, Any]:
        return {
            "id": course.get("id", ""),
            "title": course.get("title") or "名称未設定の授業",
            "academicYear": course.get("academicYear"),
            "action": action,
            "description": description,
        }

    def _relation(self) -> tuple[int, int]:
        remote_ref = f"{self.config['remoteName']}/{self.config['expectedBranch']}"
        if not self._remote_ref_exists():
            return 0, 0
        result = self._git(
            ["rev-list", "--left-right", "--count", f"HEAD...{remote_ref}"],
            action="公開状態の比較",
        )
        parts = result.stdout.strip().split()
        return (int(parts[0]), int(parts[1])) if len(parts) == 2 else (0, 0)

    def _working_paths(self) -> list[str]:
        result = self._git(
            ["status", "--porcelain=v1", "--untracked-files=all"],
            action="保存内容の確認",
        )
        paths: list[str] = []
        for line in result.stdout.splitlines():
            if len(line) < 4:
                continue
            path = line[3:]
            if " -> " in path:
                path = path.split(" -> ", 1)[1]
            paths.append(path.replace("\\", "/"))
        return paths

    def _latest_backup(self) -> str | None:
        backups = [path for path in self.importer.backups_root.glob("*.json") if path.is_file()]
        if not backups:
            return None
        latest = max(backups, key=lambda path: path.stat().st_mtime)
        return datetime.fromtimestamp(latest.stat().st_mtime).astimezone().isoformat(
            timespec="minutes"
        )

    def status(self, *, refresh: bool = False, auto_update: bool = False) -> dict[str, Any]:
        with self.lock:
            try:
                self.config = self._load_config()
            except PublicationError as error:
                self.last_diagnostic = error.technical
                return {
                    "checks": [
                        {
                            "label": "公開設定",
                            "state": "error",
                            "message": error.message,
                        }
                    ],
                    "syncState": "error",
                    "syncMessage": error.message,
                    "unpublishedChanges": [],
                    "unpublishedCount": 0,
                    "canPublish": False,
                    "ahead": 0,
                    "behind": 0,
                    "latestBackup": self._latest_backup(),
                    "publicUrl": "",
                    "diagnostic": error.technical,
                    "supportCode": error.code,
                }
            checks: list[dict[str, str]] = []
            diagnostic = ""
            support_code = ""
            connection_message = ""
            fetch_ok = True
            try:
                self.importer.management_catalog()
                checks.extend(
                    [
                        {"label": "授業データ", "state": "ok", "message": "正常"},
                        {"label": "データ形式", "state": "ok", "message": "正常"},
                    ]
                )
            except Exception as error:
                diagnostic = self._remember_diagnostic("授業データの確認", error=str(error))
                checks.append(
                    {"label": "授業データ", "state": "error", "message": "確認が必要"}
                )
            try:
                repository = self._repository_checks()
                checks.append(
                    {"label": "公開設定", "state": "ok", "message": "正常"}
                )
                if refresh:
                    fetch = self._git(
                        ["fetch", "--prune", repository["remoteName"]],
                        action="最新状態の確認",
                        check=False,
                        timeout=60,
                    )
                    if fetch.returncode != 0:
                        error = self._friendly_git_error("最新状態の確認", fetch)
                        diagnostic = error.technical
                        support_code = error.code
                        connection_message = error.message
                        fetch_ok = False
                        checks.append(
                            {
                                "label": "公開サービス接続",
                                "state": "warning",
                                "message": error.message,
                            }
                        )
                    else:
                        checks.append(
                            {"label": "公開サービス接続", "state": "ok", "message": "正常"}
                        )
                ahead, behind = self._relation()
                working_paths = self._working_paths()
                if auto_update and behind > 0 and ahead == 0 and not working_paths:
                    remote_ref = f"{repository['remoteName']}/{repository['branch']}"
                    self._git(
                        ["merge", "--ff-only", remote_ref], action="最新状態の取得"
                    )
                    ahead, behind = self._relation()
                    self.logger.info("最新状態を安全に取得しました")
                changes = self.unpublished_changes()
                can_publish = bool(changes or ahead > 0) and behind == 0 and fetch_ok
                if ahead > 0 and behind > 0:
                    sync_state = "conflict"
                    sync_message = "別の場所でも更新されています。管理担当者へ確認してください。"
                    can_publish = False
                elif behind > 0 and changes:
                    sync_state = "conflict"
                    sync_message = "公開サイト側とこのPCの両方に変更があります。"
                    can_publish = False
                elif behind > 0:
                    sync_state = "behind"
                    sync_message = "公開サイト側に新しい変更があります。"
                elif changes or ahead > 0:
                    sync_state = "unpublished"
                    sync_message = "未公開の変更があります。"
                else:
                    sync_state = "current"
                    sync_message = "最新状態です。"
                if not fetch_ok:
                    sync_state = "connection"
                    sync_message = connection_message
                    can_publish = False
                checks.append(
                    {
                        "label": "最新状態",
                        "state": "ok" if sync_state in {"current", "unpublished"} else "warning",
                        "message": sync_message,
                    }
                )
            except PublicationError as error:
                repository = {}
                ahead = behind = 0
                changes = []
                can_publish = False
                sync_state = "error"
                sync_message = error.message
                support_code = error.code
                diagnostic = error.technical or self.last_diagnostic
                checks.append(
                    {"label": "公開設定", "state": "error", "message": error.message}
                )
            latest_backup = self._latest_backup()
            checks.append(
                {
                    "label": "バックアップ",
                    "state": "ok",
                    "message": "正常" if latest_backup else "初回保存時に作成されます",
                }
            )
            return {
                "checks": checks,
                "syncState": sync_state,
                "syncMessage": sync_message,
                "unpublishedChanges": changes,
                "unpublishedCount": len(changes),
                "canPublish": can_publish,
                "ahead": ahead,
                "behind": behind,
                "latestBackup": latest_backup,
                "publicUrl": self.config.get("publicUrl", ""),
                "diagnostic": diagnostic or self.last_diagnostic,
                "supportCode": support_code,
            }

    def _commit_message(self, changes: list[dict[str, Any]]) -> str:
        if len(changes) == 1:
            item = changes[0]
            return f"ClassView: {item['title']}を更新（{item['description']}）"
        return f"ClassView: 授業{len(changes)}件を更新"

    def publish(self) -> dict[str, Any]:
        self._begin_activity()
        try:
            return self._publish_once()
        finally:
            self._end_activity()

    def _publish_once(self) -> dict[str, Any]:
        with self.lock:
            self.config = self._load_config()
            self.logger.info("公開処理を開始しました")
            self.importer.management_catalog()
            repository = self._repository_checks()
            fetch = self._git(
                ["fetch", "--prune", repository["remoteName"]],
                action="公開前の最新状態確認",
                check=False,
                timeout=60,
            )
            if fetch.returncode != 0:
                error = self._friendly_git_error("公開前の最新状態確認", fetch)
                self.logger.error("公開失敗: %s", error.message)
                raise error
            ahead, behind = self._relation()
            changes = self.unpublished_changes()
            if behind > 0:
                message = (
                    "別の場所でClassViewが更新されたため、このPCの変更をそのまま公開できません。"
                    "データを失わないため公開を停止しました。管理担当者へ確認してください。"
                )
                self.logger.error("公開停止: リモート側に新しい変更があります")
                raise PublicationError(message, code="remote_changed", status=409)
            staged_before = self._git(
                ["diff", "--cached", "--name-only"], action="公開対象の確認"
            ).stdout.splitlines()
            unexpected_staged = [
                path.replace("\\", "/")
                for path in staged_before
                if path.replace("\\", "/") not in self.allowed_paths
            ]
            if unexpected_staged:
                raise PublicationError(
                    "別の作業内容が公開準備中のため、安全のため公開を停止しました。管理担当者へ確認してください。",
                    code="unexpected_staged_files",
                    status=409,
                    technical="公開対象外: " + ", ".join(unexpected_staged),
                )
            changed_allowed = [
                path for path in self.allowed_paths if path in self._working_paths()
            ]
            if changed_allowed:
                self._git(
                    ["add", "--", *changed_allowed], action="変更内容の準備"
                )
                staged_after = [
                    path.replace("\\", "/")
                    for path in self._git(
                        ["diff", "--cached", "--name-only"], action="公開対象の再確認"
                    ).stdout.splitlines()
                ]
                if any(path not in self.allowed_paths for path in staged_after):
                    raise PublicationError(
                        "公開対象を安全に限定できませんでした。管理担当者へ確認してください。",
                        code="unsafe_stage",
                        status=409,
                    )
                if staged_after:
                    message = self._commit_message(changes)
                    self._git(["commit", "-m", message], action="公開履歴の作成")
                    ahead += 1
            if ahead == 0:
                raise PublicationError(
                    "公開する変更はありません。",
                    code="nothing_to_publish",
                    status=409,
                )
            try:
                self._git(
                    ["push", repository["remoteName"], repository["branch"]],
                    action="ClassViewへの公開",
                    timeout=90,
                )
            except PublicationError as error:
                self.logger.error("公開失敗: %s", error.message)
                raise
            self.logger.info("ClassViewへの公開が完了しました")
            return {
                "success": True,
                "message": "ClassViewへ公開しました。",
                "publicUrl": self.config.get("publicUrl", ""),
                "publishedChanges": changes,
            }

    def history(self, limit: int = 10) -> list[dict[str, str]]:
        try:
            self.config = self._load_config()
            self._repository_checks()
            result = self._git(
                [
                    "log",
                    f"-{max(1, min(limit, 30))}",
                    "--date=iso-strict",
                    "--pretty=format:%H%x1f%ad%x1f%s",
                    "--",
                    *self.allowed_paths,
                ],
                action="公開履歴の確認",
            )
        except PublicationError:
            return []
        history = []
        for line in result.stdout.splitlines():
            parts = line.split("\x1f", 2)
            if len(parts) != 3:
                continue
            history.append({"id": parts[0][:10], "publishedAt": parts[1], "summary": parts[2]})
        return history

    def record_operation(self, operation: str, detail: str = "") -> None:
        safe_detail = self._sanitize(detail)
        self.logger.info("%s%s", operation, f": {safe_detail}" if safe_detail else "")

    def _begin_activity(self) -> None:
        with self._activity_lock:
            self._active_operations += 1

    def _end_activity(self) -> None:
        with self._activity_lock:
            self._active_operations = max(0, self._active_operations - 1)

    def is_busy(self) -> bool:
        with self._activity_lock:
            return self._active_operations > 0

    def reconnect(self) -> dict[str, str]:
        if shutil.which("git") is None:
            raise PublicationError(
                "ClassViewの公開機能に必要な構成が見つかりません。管理担当者へ確認してください。",
                code="git_missing",
                status=503,
            )
        self._begin_activity()
        try:
            process = start_hidden_process(
                ["git", "credential-manager", "github", "login"],
                cwd=self.repo_root,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
        except OSError as error:
            self._end_activity()
            raise PublicationError(
                "再接続画面を開けませんでした。管理担当者へ確認してください。",
                code="reconnect_unavailable",
                status=503,
                technical=self._sanitize(str(error)),
            ) from error
        threading.Thread(
            target=self._monitor_reconnect,
            args=(process,),
            daemon=True,
            name="classview-auth-monitor",
        ).start()
        self.logger.info("公開サービスへの再接続を開始しました")
        return {"message": "再接続画面を開きました。画面の案内に従ってください。"}

    def _monitor_reconnect(self, process: subprocess.Popen[str]) -> None:
        """Drain the authentication process and retain sanitized diagnostics."""
        try:
            try:
                stdout, stderr = process.communicate()
            except (OSError, subprocess.SubprocessError) as error:
                self.logger.error("再接続処理の確認に失敗しました: %s", self._sanitize(str(error)))
                return
            if process.returncode == 0:
                self.logger.info("公開サービスへの再接続が完了しました")
                return
            result = subprocess.CompletedProcess(
                ["git", "credential-manager", "github", "login"],
                process.returncode,
                stdout,
                stderr,
            )
            self._remember_diagnostic("公開サービスへの再接続", result)
            self.logger.error(
                "公開サービスへの再接続に失敗しました: %s",
                self._sanitize(stderr) or f"終了コード {process.returncode}",
            )
        finally:
            self._end_activity()
