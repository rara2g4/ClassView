"""Private learner-feedback import, normalization and aggregation services."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import tempfile
import threading
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO

from feedback_config import (
    CHOICE_OPTIONS,
    CONDITIONAL_SCALE_OPTIONS,
    DIRECT_SCALE_KEYS,
    FEEDBACK_COLUMNS,
    FEEDBACK_SETTINGS,
    FIELD_LABELS,
    FREE_TEXT_KEYS,
    ISSUE_STATUSES,
    OPTIONAL_COLUMNS,
    REQUIRED_COLUMNS,
)
from importer import ImporterError


class FeedbackError(ImporterError):
    """A staff-facing feedback workflow error."""

    def __init__(
        self,
        message: str,
        *,
        status: int = 400,
        code: str = "invalid_request",
        diagnostic: str = "",
    ):
        super().__init__(message, status=status, code=code)
        self.diagnostic = diagnostic


class FeedbackService:
    """Keep private responses separate from CSV transport and public output."""

    DATA_VERSION = 1
    PUBLIC_PATH = Path("data/course-feedback-summary.json")

    def __init__(self, repo_root: Path, work_root: Path, course_importer: Any):
        self.repo_root = Path(repo_root).resolve()
        self.work_root = Path(work_root).resolve()
        self.course_importer = course_importer
        self.private_root = self.work_root / "feedback-data"
        self.store_path = self.private_root / "feedback.json"
        self.backups_root = self.work_root / "backups"
        self.public_path = self.repo_root / self.PUBLIC_PATH
        self.private_root.mkdir(parents=True, exist_ok=True)
        self.backups_root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()

    @staticmethod
    def _empty_store() -> dict[str, Any]:
        return {"version": FeedbackService.DATA_VERSION, "records": [], "issues": {}}

    def _load_store(self) -> dict[str, Any]:
        if not self.store_path.exists():
            return self._empty_store()
        try:
            value = json.loads(self.store_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise FeedbackError(
                "保存済みの受講者フィードバックを読み込めません。管理担当者へ確認してください。",
                status=500,
                code="feedback_store_invalid",
            ) from error
        if not isinstance(value, dict) or not isinstance(value.get("records"), list):
            raise FeedbackError(
                "保存済みの受講者フィードバックの形式が正しくありません。",
                status=500,
                code="feedback_store_invalid",
            )
        value.setdefault("issues", {})
        return value

    def _write_json_atomically(self, path: Path, value: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{path.stem}-", suffix=".tmp", dir=path.parent
        )
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                json.dump(value, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            os.replace(temporary_path, path)
        finally:
            temporary_path.unlink(missing_ok=True)

    @staticmethod
    def _clean(value: Any) -> str:
        return unicodedata.normalize("NFKC", str(value or "")).strip()

    @staticmethod
    def _canonical_text(value: Any) -> str:
        return re.sub(r"\s+", " ", str(value or "").strip())

    @staticmethod
    def _feedback_text(value: Any) -> str:
        """Preserve a student's wording and internal whitespace."""

        text = str(value or "")
        return text if text.strip() else ""

    @staticmethod
    def normalize_feedback_header(value: Any) -> str:
        """Normalize only safe, presentation-level differences in CSV headers."""

        header = str(value or "").replace("\ufeff", "")
        header = unicodedata.normalize("NFKC", header)
        header = re.sub(r"[\r\n\t]+", " ", header)
        # Whitespace in a Google Forms question is presentation formatting.  It
        # may be inserted or removed by line wrapping, so ignore it for exact
        # canonical/alias comparison while retaining every non-space character.
        header = re.sub(r"\s+", "", header)
        # Google Forms wording occasionally changes only by a final Japanese
        # full stop.  Internal punctuation is deliberately left untouched.
        return re.sub(r"。+$", "", header).rstrip()

    def _course_index(self) -> dict[str, dict[str, Any]]:
        documents = [
            self.course_importer.load_courses_document(),
            self.course_importer.load_archived_courses_document(),
        ]
        return {
            str(course.get("id")): course
            for document in documents
            for course in document.get("courses", [])
            if isinstance(course, dict) and course.get("id")
        }

    @classmethod
    def _resolve_headers(cls, fieldnames: list[str] | None) -> dict[str, Any]:
        detected = [str(name or "") for name in (fieldnames or [])]
        available: dict[str, list[str]] = defaultdict(list)
        for name in detected:
            available[cls.normalize_feedback_header(name)].append(name)
        mapping: dict[str, str] = {}
        matched_by: dict[str, str] = {}
        for key, specification in FEEDBACK_COLUMNS.items():
            candidates = (
                ("canonical", str(specification["canonical"])),
                *(("alias", str(alias)) for alias in specification["aliases"]),
            )
            for source, candidate in candidates:
                matches = available.get(cls.normalize_feedback_header(candidate), [])
                if matches:
                    mapping[key] = matches[0]
                    matched_by[key] = source
                    break
        missing_required = [key for key in REQUIRED_COLUMNS if key not in mapping]
        missing_optional = [key for key in OPTIONAL_COLUMNS if key not in mapping]
        return {
            "mapping": mapping,
            "matched_by": matched_by,
            "missing_required": missing_required,
            "missing_optional": missing_optional,
            "detected_headers": detected,
        }

    @staticmethod
    def _header_diagnostic(resolution: dict[str, Any]) -> str:
        lines = ["解決した列マッピング:"]
        mapping = resolution["mapping"]
        matched_by = resolution["matched_by"]
        for key in FEEDBACK_COLUMNS:
            if key in mapping:
                lines.append(f"- {mapping[key]!r} -> {key} ({matched_by[key]})")
        if resolution["missing_required"]:
            lines.append("期待していた必須項目:")
            for key in resolution["missing_required"]:
                lines.append(f"- {key}: {FEEDBACK_COLUMNS[key]['canonical']!r}")
        lines.append("CSVで検出した項目:")
        lines.extend(f"- {header!r}" for header in resolution["detected_headers"])
        return "\n".join(lines)

    @staticmethod
    def _scale(value: str, row_number: int, label: str) -> int | None:
        if value == "":
            return None
        if value in {"1", "2", "3", "4", "5"}:
            return int(value)
        raise FeedbackError(
            f"{row_number}行目の「{label}」に想定外の回答があります。",
            code="invalid_feedback_value",
        )

    def _normalize_row(
        self,
        source: dict[str, Any],
        mapping: dict[str, str],
        row_number: int,
        courses: dict[str, dict[str, Any]],
    ) -> tuple[dict[str, Any] | None, list[str]]:
        raw: dict[str, str] = {}
        for key in FEEDBACK_COLUMNS:
            source_value = source.get(mapping[key], "") if key in mapping else ""
            raw[key] = (
                self._feedback_text(source_value)
                if key in FREE_TEXT_KEYS
                else self._canonical_text(source_value)
            )
        if not any(raw.values()):
            return None, []
        warnings: list[str] = []
        if not raw["timestamp"]:
            raise FeedbackError(
                f"{row_number}行目にタイムスタンプがありません。Google Formsの回答CSVか確認してください。",
                code="missing_feedback_timestamp",
            )
        course_id = self._clean(raw["course_id"])
        if not course_id:
            raise FeedbackError(f"{row_number}行目に授業IDがありません。", code="missing_course_id")
        course = courses.get(course_id)
        if course is None:
            raise FeedbackError(
                f"{row_number}行目の授業ID「{course_id}」はClassViewに登録されていません。",
                code="unknown_course_id",
            )
        year_match = re.fullmatch(r"(\d{4})(?:年度)?", self._clean(raw["academic_year"]))
        if year_match is None:
            raise FeedbackError(
                f"{row_number}行目の年度を確認してください。4桁の西暦で入力してください。",
                code="invalid_academic_year",
            )
        academic_year = year_match.group(1)
        registered_year = self._clean(course.get("academicYear"))
        if registered_year and registered_year.removesuffix("年度") != academic_year:
            raise FeedbackError(
                f"{row_number}行目の年度（{academic_year}）は、登録済み授業の年度（{registered_year}）と一致しません。",
                code="unexpected_academic_year",
            )
        csv_title = raw["course_title"]
        registered_title = self._canonical_text(course.get("title"))
        if csv_title and self._clean(csv_title) != self._clean(registered_title):
            warnings.append(
                f"{row_number}行目：授業名が現在の登録内容「{registered_title}」と一致していません。授業IDを基準に登録しました。"
            )
        attended = self._clean(raw["attended"])
        if attended not in CHOICE_OPTIONS["attended"]:
            raise FeedbackError(
                f"{row_number}行目の受講確認に想定外の回答があります。",
                code="invalid_attendance",
            )
        record: dict[str, Any] = {
            "timestamp": raw["timestamp"],
            "course_id": course_id,
            "course_title": registered_title,
            "reported_course_title": csv_title,
            "academic_year": academic_year,
            "attended": attended == "はい",
        }
        for key in DIRECT_SCALE_KEYS:
            record[key] = self._scale(self._clean(raw[key]), row_number, FIELD_LABELS[key])
        for key, options in CONDITIONAL_SCALE_OPTIONS.items():
            answer = self._clean(raw[key])
            if answer == "":
                record[key] = None
                record[f"{key}_not_applicable"] = None
            elif answer not in options:
                raise FeedbackError(
                    f"{row_number}行目の「{FIELD_LABELS[key]}」に想定外の回答があります。",
                    code="invalid_feedback_value",
                )
            else:
                record[key] = options[answer]
                record[f"{key}_not_applicable"] = answer if options[answer] is None else None
        for key in ("pace", "difficulty", "workload"):
            answer = self._clean(raw[key])
            if answer and answer not in CHOICE_OPTIONS[key]:
                raise FeedbackError(
                    f"{row_number}行目の「{FIELD_LABELS[key]}」に想定外の回答があります。",
                    code="invalid_feedback_value",
                )
            record[key] = answer or None
        styles = [self._clean(value) for value in re.split(r"[,、;\n]+", raw["class_style"]) if self._clean(value)]
        invalid_styles = [value for value in styles if value not in CHOICE_OPTIONS["class_style"]]
        if invalid_styles:
            raise FeedbackError(
                f"{row_number}行目の授業形式に想定外の回答があります：{'、'.join(invalid_styles)}",
                code="invalid_feedback_value",
            )
        record["class_style"] = list(dict.fromkeys(styles))
        for key in FREE_TEXT_KEYS:
            record[key] = raw[key]
        if record["attended"]:
            missing_answers = [
                FIELD_LABELS[key]
                for key in (*DIRECT_SCALE_KEYS, *CONDITIONAL_SCALE_OPTIONS, "pace", "difficulty", "workload")
                if record.get(key) is None and not record.get(f"{key}_not_applicable")
            ]
            if missing_answers:
                raise FeedbackError(
                    f"{row_number}行目の必須回答が空です：{'、'.join(missing_answers)}",
                    code="missing_required_answer",
                )
            if not styles:
                raise FeedbackError(
                    f"{row_number}行目の授業形式が空です。",
                    code="missing_required_answer",
                )
        response_basis = {key: record[key] for key in sorted(record) if key != "response_id"}
        # Keep the pre-existing response ID algorithm stable even though newly
        # stored free text now retains the student's original line breaks.
        for key in FREE_TEXT_KEYS:
            response_basis[key] = self._canonical_text(response_basis[key])
        record["response_id"] = hashlib.sha256(
            json.dumps(response_basis, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        return record, warnings

    def import_csv(self, stream: BinaryIO, filename: str, content_length: int | None = None) -> dict[str, Any]:
        if content_length is not None and content_length > FEEDBACK_SETTINGS["max_file_bytes"]:
            raise FeedbackError("回答CSVが大きすぎます（上限10MB）。", status=413, code="feedback_file_too_large")
        payload = stream.read(FEEDBACK_SETTINGS["max_file_bytes"] + 1)
        if len(payload) > FEEDBACK_SETTINGS["max_file_bytes"]:
            raise FeedbackError("回答CSVが大きすぎます（上限10MB）。", status=413, code="feedback_file_too_large")
        try:
            text = payload.decode("utf-8-sig")
        except UnicodeDecodeError as error:
            raise FeedbackError(
                "このCSVを読み込めませんでした。UTF-8形式でダウンロードした回答CSVか確認してください。",
                code="feedback_encoding_error",
            ) from error
        try:
            reader = csv.DictReader(io.StringIO(text, newline=""))
            resolution = self._resolve_headers(reader.fieldnames)
            mapping = resolution["mapping"]
            if resolution["missing_required"]:
                labels = [FIELD_LABELS[key] for key in resolution["missing_required"]]
                raise FeedbackError(
                    "回答データの一部の項目を確認できませんでした。\n\n"
                    "不足している項目：\n・" + "\n・".join(labels) + "\n\n"
                    "Google Formsから出力したClassView受講者フィードバック用CSVか確認してください。",
                    code="missing_feedback_columns",
                    diagnostic=self._header_diagnostic(resolution),
                )
            rows = list(reader)
        except csv.Error as error:
            raise FeedbackError(
                "回答データを読み込めませんでした。フォームのCSV形式を確認してください。",
                code="feedback_csv_error",
            ) from error
        if len(rows) > FEEDBACK_SETTINGS["max_rows"]:
            raise FeedbackError(
                f"一度に読み込める回答は{FEEDBACK_SETTINGS['max_rows']:,}件までです。",
                code="feedback_too_many_rows",
            )
        courses = self._course_index()
        normalized: list[dict[str, Any]] = []
        warnings: list[str] = []
        if resolution["missing_optional"]:
            labels = [FIELD_LABELS[key] for key in resolution["missing_optional"]]
            warnings.append(
                "一部の任意回答項目が見つからなかったため、該当項目を除いて読み込みました："
                + "、".join(labels)
            )
        empty_rows = 0
        for offset, row in enumerate(rows, start=2):
            record, row_warnings = self._normalize_row(row, mapping, offset, courses)
            if record is None:
                empty_rows += 1
                continue
            normalized.append(record)
            warnings.extend(row_warnings)
        with self.lock:
            store = self._load_store()
            existing_ids = {record.get("response_id") for record in store["records"]}
            added = [record for record in normalized if record["response_id"] not in existing_ids]
            duplicates = len(normalized) - len(added)
            store["records"].extend(added)
            for record in added:
                self._ensure_issues(store, record)
            self._write_json_atomically(self.store_path, store)
        return {
            "success": True,
            "message": f"{len(added)}件の回答を読み込みました。",
            "added": len(added),
            "duplicates": duplicates,
            "emptyRows": empty_rows,
            "warnings": warnings,
            "missingOptionalColumns": [
                FIELD_LABELS[key] for key in resolution["missing_optional"]
            ],
            "headerMapping": [
                {
                    "csvHeader": mapping[key],
                    "internalField": key,
                    "matchedBy": resolution["matched_by"][key],
                }
                for key in FEEDBACK_COLUMNS
                if key in mapping
            ],
            "sourceFile": Path(filename or "responses.csv").name,
        }

    def _ensure_issues(self, store: dict[str, Any], record: dict[str, Any]) -> None:
        issue_types: list[str] = []
        if record.get("content_concern_text"):
            issue_types.append("content_concern")
        if record.get("improvement_text"):
            issue_types.append("improvement")
        syllabus_text = " ".join(str(record.get(key) or "") for key in ("improvement_text", "other_text"))
        if record.get("syllabus_alignment") in {1, 2} or re.search(r"シラバス|ClassView|掲載.*(?:違|異)|授業内容.*(?:違|異)", syllabus_text, re.I):
            issue_types.append("syllabus_alignment")
        for issue_type in issue_types:
            issue_id = f"{record['response_id']}:{issue_type}"
            store["issues"].setdefault(
                issue_id,
                {
                    "issue_id": issue_id,
                    "response_id": record["response_id"],
                    "type": issue_type,
                    "status": "unreviewed",
                    "note": "",
                    "updated_at": None,
                },
            )

    @staticmethod
    def _scale_summary(records: list[dict[str, Any]], key: str) -> dict[str, Any]:
        values = [record[key] for record in records if isinstance(record.get(key), int)]
        counts = {str(value): values.count(value) for value in range(1, 6)}
        not_applicable = Counter(
            record.get(f"{key}_not_applicable")
            for record in records
            if record.get(f"{key}_not_applicable")
        )
        return {
            "key": key,
            "label": FIELD_LABELS[key],
            "count": len(values),
            "average": round(sum(values) / len(values), 2) if values else None,
            "distribution": counts,
            "not_applicable": dict(not_applicable),
        }

    @staticmethod
    def _choice_summary(records: list[dict[str, Any]], key: str, options: tuple[str, ...]) -> dict[str, Any]:
        counts = Counter(record.get(key) for record in records if record.get(key))
        return {"key": key, "label": FIELD_LABELS[key], "total": sum(counts.values()), "distribution": {option: counts[option] for option in options}}

    @staticmethod
    def _styles_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
        counts: Counter[str] = Counter()
        for record in records:
            counts.update(record.get("class_style") or [])
        return {"key": "class_style", "label": FIELD_LABELS["class_style"], "total": len(records), "distribution": {option: counts[option] for option in CHOICE_OPTIONS["class_style"]}}

    def _records_for(self, course_id: str, academic_year: str) -> list[dict[str, Any]]:
        return [
            record for record in self._load_store()["records"]
            if record.get("course_id") == course_id and record.get("academic_year") == academic_year
        ]

    def aggregate(self, course_id: str, academic_year: str) -> dict[str, Any]:
        store = self._load_store()
        records = [record for record in store["records"] if record.get("course_id") == course_id and record.get("academic_year") == academic_year]
        if not records:
            raise FeedbackError("指定された授業・年度の回答が見つかりません。", status=404, code="feedback_not_found")
        eligible = [record for record in records if record.get("attended")]
        scale_groups = {
            "learning": [self._scale_summary(eligible, key) for key in ("content_understanding", "independent_application", "skill_growth", "goal_achievement")],
            "instruction": [self._scale_summary(eligible, key) for key in ("explanation_clarity", "practice_usefulness", "question_support")],
            "materials": [self._scale_summary(eligible, key) for key in ("material_usefulness", "assignment_usefulness")],
            "alignment": [self._scale_summary(eligible, "syllabus_alignment")],
            "background": [self._scale_summary(eligible, "prior_experience")],
        }
        issues = [issue for issue in store["issues"].values() if issue.get("response_id") in {record["response_id"] for record in records}]
        records_by_id = {record["response_id"]: record for record in records}
        grouped_issues: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for issue in issues:
            grouped_issues[str(issue.get("response_id", ""))].append(issue)
        issue_type_order = {
            "content_concern": 0,
            "syllabus_alignment": 1,
            "improvement": 2,
        }
        issue_groups = [
            {
                "response_id": response_id,
                "timestamp": records_by_id.get(response_id, {}).get("timestamp"),
                "has_unreviewed": any(
                    issue.get("status") == "unreviewed" for issue in response_issues
                ),
                "issues": sorted(
                    response_issues,
                    key=lambda issue: issue_type_order.get(str(issue.get("type", "")), 99),
                ),
            }
            for response_id, response_issues in grouped_issues.items()
        ]
        issue_groups.sort(key=lambda group: str(group.get("timestamp") or ""), reverse=True)
        issue_groups.sort(key=lambda group: not group["has_unreviewed"])
        text_counts = {key: sum(bool(record.get(key)) for record in eligible) for key in FREE_TEXT_KEYS}
        alerts = []
        for metric in sum(scale_groups.values(), []):
            if metric["count"] >= FEEDBACK_SETTINGS["min_responses_for_alert"] and metric["average"] is not None and metric["average"] <= FEEDBACK_SETTINGS["low_average_alert_threshold"]:
                alerts.append(f"{metric['label']}について確認をおすすめします。")
        return {
            "course_id": course_id,
            "course_title": records[0].get("course_title"),
            "academic_year": academic_year,
            "total_count": len(records),
            "eligible_count": len(eligible),
            "excluded_count": len(records) - len(eligible),
            "summary_available": len(eligible) >= FEEDBACK_SETTINGS["min_responses_for_summary"],
            "min_responses_for_summary": FEEDBACK_SETTINGS["min_responses_for_summary"],
            "scale_groups": scale_groups,
            "pace": self._choice_summary(eligible, "pace", CHOICE_OPTIONS["pace"]),
            "difficulty": self._choice_summary(eligible, "difficulty", CHOICE_OPTIONS["difficulty"]),
            "workload": self._choice_summary(eligible, "workload", CHOICE_OPTIONS["workload"]),
            "class_style": self._styles_summary(eligible),
            "text_counts": text_counts,
            "issues": sorted(issues, key=lambda issue: (issue.get("status") != "unreviewed", issue.get("type", ""))),
            "issue_groups": issue_groups,
            "issue_statuses": ISSUE_STATUSES,
            "alerts": alerts,
            "records": sorted(records, key=lambda record: str(record.get("timestamp", "")), reverse=True),
        }

    def dashboard(self, course_id: str = "", year: str = "", issue_filter: str = "") -> dict[str, Any]:
        store = self._load_store()
        grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for record in store["records"]:
            grouped[(record["course_id"], record["academic_year"])].append(record)
        response_to_group = {record["response_id"]: (record["course_id"], record["academic_year"]) for record in store["records"]}
        issues_by_group: Counter[tuple[str, str]] = Counter()
        issue_counts: Counter[str] = Counter()
        for issue in store["issues"].values():
            if issue.get("status") == "unreviewed":
                group = response_to_group.get(issue.get("response_id"))
                if group:
                    issues_by_group[group] += 1
                issue_counts[issue.get("type", "")] += 1
        groups = []
        for (group_course_id, group_year), records in grouped.items():
            if course_id and group_course_id != course_id:
                continue
            if year and group_year != year:
                continue
            unresolved = issues_by_group[(group_course_id, group_year)]
            if issue_filter == "yes" and not unresolved:
                continue
            if issue_filter == "no" and unresolved:
                continue
            groups.append({
                "course_id": group_course_id,
                "course_title": records[0].get("course_title"),
                "academic_year": group_year,
                "total_count": len(records),
                "eligible_count": sum(bool(record.get("attended")) for record in records),
                "unresolved_count": unresolved,
            })
        groups.sort(key=lambda item: (item["course_title"], -int(item["academic_year"])))
        return {
            "total_count": len(store["records"]),
            "groups": groups,
            "courses": sorted({(record["course_id"], record["course_title"]) for record in store["records"]}, key=lambda item: item[1]),
            "years": sorted({record["academic_year"] for record in store["records"]}, reverse=True),
            "issue_counts": {
                "syllabus_alignment": issue_counts["syllabus_alignment"],
                "content_concern": issue_counts["content_concern"],
                "improvement": issue_counts["improvement"],
            },
            "filters": {"course_id": course_id, "year": year, "issues": issue_filter},
        }

    def response_detail(self, response_id: str) -> dict[str, Any]:
        store = self._load_store()
        record = next((item for item in store["records"] if item.get("response_id") == response_id), None)
        if record is None:
            raise FeedbackError("回答が見つかりません。", status=404, code="feedback_response_not_found")
        issues = [issue for issue in store["issues"].values() if issue.get("response_id") == response_id]
        return {"record": record, "issues": issues, "labels": FIELD_LABELS, "issue_statuses": ISSUE_STATUSES}

    def update_issue(self, issue_id: str, status: str, note: str) -> dict[str, Any]:
        if status not in ISSUE_STATUSES:
            raise FeedbackError("確認状態を選び直してください。", code="invalid_issue_status")
        note = str(note or "").strip()
        if len(note) > 2000:
            raise FeedbackError("職員メモは2,000文字以内で入力してください。", code="issue_note_too_long")
        with self.lock:
            store = self._load_store()
            issue = store["issues"].get(issue_id)
            if issue is None:
                raise FeedbackError("要確認項目が見つかりません。", status=404, code="feedback_issue_not_found")
            issue["status"] = status
            issue["note"] = note
            issue["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            self._write_json_atomically(self.store_path, store)
        return {"success": True, "message": "確認状態と職員メモを保存しました。", "issue": issue}

    def save_public_summary(self, course_id: str, academic_year: str) -> dict[str, Any]:
        summary = self.aggregate(course_id, academic_year)
        if not summary["summary_available"]:
            raise FeedbackError(
                f"公開用集計には集計対象の回答が{FEEDBACK_SETTINGS['min_responses_for_summary']}件以上必要です。",
                code="not_enough_feedback",
            )
        public_group = {
            "courseId": course_id,
            "academicYear": academic_year,
            "responseCount": summary["total_count"],
            "eligibleResponseCount": summary["eligible_count"],
            "learningOutcomes": {
                item["key"]: {"count": item["count"], "average": item["average"], "distribution": item["distribution"]}
                for item in summary["scale_groups"]["learning"]
            },
            "difficulty": summary["difficulty"]["distribution"],
            "workload": summary["workload"]["distribution"],
            "classStyle": summary["class_style"]["distribution"],
        }
        current = {"version": 1, "generatedAt": None, "courses": []}
        if self.public_path.exists():
            try:
                current = json.loads(self.public_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise FeedbackError("公開用フィードバック集計を読み込めません。", status=500, code="public_feedback_invalid") from error
        timestamp = datetime.now().astimezone().strftime("%Y%m%d-%H%M%S")
        if self.public_path.exists():
            backup = self.backups_root / f"course-feedback-summary-{timestamp}.json"
            backup.write_bytes(self.public_path.read_bytes())
        groups = [item for item in current.get("courses", []) if not (item.get("courseId") == course_id and item.get("academicYear") == academic_year)]
        groups.append(public_group)
        groups.sort(key=lambda item: (item["courseId"], item["academicYear"]))
        document = {"version": 1, "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "courses": groups}
        self._write_json_atomically(self.public_path, document)
        return {"success": True, "message": "公開用集計を保存しました。ClassViewへの公開は管理ホームから行ってください。", "path": str(self.PUBLIC_PATH).replace("\\", "/")}
