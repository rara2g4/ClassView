"""Core services for the local ClassView syllabus importer."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, BinaryIO

from jsonschema import Draft202012Validator
from pypdf import PdfReader, PdfWriter


class ImporterError(Exception):
    """An expected, user-facing importer error."""

    def __init__(self, message: str, *, status: int = 400, code: str = "invalid_request"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


@dataclass
class Preparation:
    token: str
    course_id: str
    page_number: int
    page_end: int
    page_spec: str
    page_count: int
    extracted_pdf: Path
    prompt: str
    conversion_mode: str = "support"
    validation_token: str | None = None
    validated_hash: str | None = None
    validated_field_meta: dict[str, Any] | None = None
    validated_manual_fields: tuple[str, ...] = ()
    validated_inferred_fields: tuple[str, ...] = ()
    validated_proposal_reviews: dict[str, str] | None = None
    proposal_original_values: dict[str, Any] | None = None

    @property
    def extracted_page_count(self) -> int:
        return self.page_end - self.page_number + 1


class CourseImporter:
    """Reads the repository contract and safely appends validated courses."""

    MAX_EXTRACTED_PAGES = 20
    CONVERSION_MODES = {"strict", "support"}
    SOURCE_TYPES = {"explicit", "inferred", "proposed", "timetable", "missing"}
    TIMETABLE_FIELDS = {"title", "academicYear", "instructor"}
    REVIEW_STATUSES = {"pending", "accepted", "edited", "rejected"}
    INFERABLE_FIELDS = {
        "summary",
        "learningGoals",
        "outcomes",
        "topics",
        "suitableFor",
        "assignments",
        "classFlow",
    }
    PROPOSABLE_FIELDS = {
        "summary",
        "category",
        "classStyle",
        "prerequisites",
        "learningGoals",
        "classFlow",
        "outcomes",
        "suitableFor",
        "assignments",
    }

    def __init__(self, repo_root: Path, work_root: Path | None = None):
        self.repo_root = Path(repo_root).resolve()
        self.tool_root = Path(work_root or Path(__file__).resolve().parent).resolve()
        self.courses_path = self.repo_root / "data" / "courses.json"
        self.archived_courses_path = self.repo_root / "data" / "archived-courses.json"
        self.schema_path = self.repo_root / "data" / "course.schema.json"
        self.template_path = self.repo_root / "data" / "course.template.json"
        self.conversion_prompt_path = (
            self.repo_root / "docs" / "syllabus-conversion-prompt.md"
        )
        self.tmp_root = self.tool_root / "tmp"
        self.backups_root = self.tool_root / "backups"
        self.tmp_root.mkdir(parents=True, exist_ok=True)
        self.backups_root.mkdir(parents=True, exist_ok=True)
        self.preparations: dict[str, Preparation] = {}
        self.management_lock = threading.RLock()

    @staticmethod
    def _load_json(path: Path) -> Any:
        try:
            with path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except FileNotFoundError as error:
            raise ImporterError(f"必要なファイルが見つかりません: {path}", status=500) from error
        except json.JSONDecodeError as error:
            raise ImporterError(
                f"{path.name} のJSONが不正です（{error.lineno}行 {error.colno}列）。",
                status=500,
            ) from error

    def load_schema(self) -> dict[str, Any]:
        schema = self._load_json(self.schema_path)
        try:
            Draft202012Validator.check_schema(schema)
        except Exception as error:
            raise ImporterError("course.schema.json 自体が有効ではありません。", status=500) from error
        return schema

    def load_courses_document(self) -> dict[str, Any]:
        return self._load_course_document(self.courses_path, "courses.json")

    def load_archived_courses_document(self) -> dict[str, Any]:
        if not self.archived_courses_path.exists():
            return {"courses": []}
        return self._load_course_document(
            self.archived_courses_path, "archived-courses.json"
        )

    def _load_course_document(self, path: Path, label: str) -> dict[str, Any]:
        document = self._load_json(path)
        if not isinstance(document, dict) or not isinstance(document.get("courses"), list):
            raise ImporterError(
                f"{label} は courses 配列を持つオブジェクトである必要があります。",
                status=500,
            )
        return document

    def id_pattern(self) -> str:
        schema = self.load_schema()
        pattern = schema.get("properties", {}).get("id", {}).get("pattern")
        if not isinstance(pattern, str) or not pattern:
            raise ImporterError("Schemaに授業IDのpatternがありません。", status=500)
        return pattern

    def is_valid_id(self, course_id: str) -> bool:
        return bool(re.fullmatch(self.id_pattern(), course_id or ""))

    def duplicate_id(self, course_id: str, *, include_archived: bool = False) -> bool:
        is_public_duplicate = any(
            isinstance(course, dict) and course.get("id") == course_id
            for course in self.load_courses_document()["courses"]
        )
        if is_public_duplicate or not include_archived:
            return is_public_duplicate
        return any(
            isinstance(course, dict) and course.get("id") == course_id
            for course in self.load_archived_courses_document()["courses"]
        )

    def validate_new_id(self, course_id: str) -> None:
        if not isinstance(course_id, str) or not self.is_valid_id(course_id):
            raise ImporterError(
                "授業IDは半角英小文字・数字・ハイフンで入力してください。"
                "先頭・末尾や連続するハイフンは使用できません。",
                code="invalid_id",
            )
        if self.duplicate_id(course_id, include_archived=True):
            raise ImporterError(
                f"授業ID「{course_id}」は公開中またはアーカイブに存在します。",
                code="duplicate_id",
            )

    @classmethod
    def parse_page_range(cls, page_spec: int | str) -> tuple[int, int, str]:
        value = str(page_spec).strip()
        match = re.fullmatch(r"(\d+)(?:\s*-\s*(\d+))?", value)
        if not match:
            raise ImporterError(
                "掲載ページは「42」または「42-43」の形式で入力してください。",
                code="invalid_page",
            )
        start = int(match.group(1))
        end = int(match.group(2) or start)
        if start < 1 or end < 1:
            raise ImporterError(
                "ページ番号は1以上で入力してください。", code="invalid_page"
            )
        if start > end:
            raise ImporterError(
                "開始ページは終了ページ以下にしてください。",
                code="invalid_page_range",
            )
        page_total = end - start + 1
        if page_total > cls.MAX_EXTRACTED_PAGES:
            raise ImporterError(
                f"一度に抽出できるのは{cls.MAX_EXTRACTED_PAGES}ページまでです。",
                code="page_range_too_large",
            )
        normalized = str(start) if start == end else f"{start}-{end}"
        return start, end, normalized

    @classmethod
    def normalize_conversion_mode(cls, conversion_mode: Any) -> str:
        mode = str(conversion_mode or "support").strip().lower()
        if mode not in cls.CONVERSION_MODES:
            raise ImporterError(
                "変換モードは厳格変換またはシラバス作成支援を選択してください。",
                code="invalid_conversion_mode",
            )
        return mode

    def build_prompt(
        self,
        course_id: str,
        page_spec: str = "1",
        extracted_page_count: int = 1,
        conversion_mode: str = "support",
    ) -> str:
        mode = self.normalize_conversion_mode(conversion_mode)
        base_prompt = self.conversion_prompt_path.read_text(encoding="utf-8")
        schema_text = self.schema_path.read_text(encoding="utf-8")
        template_text = self.template_path.read_text(encoding="utf-8")
        existing_courses = self.load_courses_document()["courses"]
        category_candidates = sorted(
            {
                value.strip()
                for course in existing_courses
                if isinstance(course, dict)
                and isinstance((value := course.get("category")), str)
                and value.strip()
            }
        )
        if extracted_page_count > 1:
            page_instruction = f"""
添付された{extracted_page_count}ページ（元PDFの{page_spec}ページ）は、すべて同一授業のシラバスです。
ページをまたいだ情報を統合し、授業1件分のJSONを生成してください。
各ページを別授業として扱わず、同時に、添付範囲外の別授業の情報を推測して混ぜないでください。
""".strip()
        else:
            page_instruction = (
                f"添付されたPDFは、元PDFの{page_spec}ページから抽出した1ページです。"
            )
        if mode == "strict":
            mode_instruction = """選択モード: 厳格変換
シラバスに直接記載された情報と、同じシラバス内から合理的に直接導ける情報だけを使用してください。
一般的な専門知識や教育設計による下書き提案は行わず、sourceTypeにproposedを使用しないでください。"""
        else:
            mode_instruction = """選択モード: シラバス作成支援
元シラバスを最優先の基礎資料とし、不足部分には科目の一般的な専門知識と教育設計を使った完成形の下書きを提案してください。
シラバスから確認できる事実はexplicit、同じシラバス内から直接導ける内容はinferred、外部の一般知識を使った下書きはproposedとして厳密に区別してください。"""
        return f"""# ClassView 授業JSON変換依頼

{mode_instruction}
{page_instruction}
登録する授業IDは必ず次の値と完全に一致させてください。

登録用授業ID: `{course_id}`

現在のClassViewで使用している分野候補: {json.dumps(category_candidates, ensure_ascii=False)}

以下の変換指示、JSON Schema、テンプレートに厳密に従ってください。
出力は `course` と `fieldMeta` を持つ中間JSONオブジェクトだけにし、説明、前置き、Markdownコードフェンスは出力しないでください。

--- 変換指示 ---
{base_prompt.rstrip()}

--- JSON Schema: data/course.schema.json ---
```json
{schema_text.rstrip()}
```

--- JSONテンプレート: data/course.template.json ---
```json
{template_text.rstrip()}
```
"""

    def prepare_pdf(
        self,
        stream: BinaryIO,
        filename: str,
        page_number: int | str,
        course_id: str,
        conversion_mode: str = "support",
    ) -> Preparation:
        mode = self.normalize_conversion_mode(conversion_mode)
        self.validate_new_id(course_id)
        if not filename or Path(filename).suffix.lower() != ".pdf":
            raise ImporterError("PDFファイル（.pdf）を選択してください。", code="invalid_pdf")
        page_start, page_end, page_spec = self.parse_page_range(page_number)

        token = uuid.uuid4().hex
        preparation_dir = self.tmp_root / token
        preparation_dir.mkdir(parents=True, exist_ok=False)
        uploaded_pdf = preparation_dir / "source.pdf"
        extracted_pdf = preparation_dir / f"{course_id}.pdf"

        try:
            with uploaded_pdf.open("wb") as destination:
                shutil.copyfileobj(stream, destination, length=1024 * 1024)
            with uploaded_pdf.open("rb") as handle:
                if handle.read(5) != b"%PDF-":
                    raise ImporterError("選択されたファイルはPDFとして認識できません。", code="invalid_pdf")

            reader = PdfReader(str(uploaded_pdf))
            if reader.is_encrypted and reader.decrypt("") == 0:
                raise ImporterError("パスワード付きPDFは使用できません。", code="encrypted_pdf")
            page_count = len(reader.pages)
            if page_end > page_count:
                raise ImporterError(
                    f"ページ範囲がPDFの総ページ数を超えています。このPDFは{page_count}ページです。",
                    code="page_out_of_range",
                )

            writer = PdfWriter()
            for index in range(page_start - 1, page_end):
                writer.add_page(reader.pages[index])
            with extracted_pdf.open("wb") as output:
                writer.write(output)

            preparation = Preparation(
                token=token,
                course_id=course_id,
                page_number=page_start,
                page_end=page_end,
                page_spec=page_spec,
                page_count=page_count,
                extracted_pdf=extracted_pdf,
                prompt=self.build_prompt(
                    course_id, page_spec, page_end - page_start + 1, mode
                ),
                conversion_mode=mode,
            )
            self.preparations[token] = preparation
            return preparation
        except ImporterError:
            shutil.rmtree(preparation_dir, ignore_errors=True)
            raise
        except Exception as error:
            shutil.rmtree(preparation_dir, ignore_errors=True)
            raise ImporterError(
                "PDFを読み込めませんでした。破損していないPDFか確認してください。",
                code="invalid_pdf",
            ) from error
        finally:
            uploaded_pdf.unlink(missing_ok=True)

    def get_preparation(self, token: str) -> Preparation:
        preparation = self.preparations.get(token)
        if not preparation:
            raise ImporterError(
                "準備情報が見つかりません。PDFの準備からやり直してください。",
                status=404,
                code="preparation_not_found",
            )
        return preparation

    @staticmethod
    def _json_hash(json_text: str) -> str:
        return hashlib.sha256(json_text.encode("utf-8")).hexdigest()

    @staticmethod
    def _course_hash(course: Any) -> str:
        canonical = json.dumps(
            course, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    def _format_path(path: Any) -> str:
        parts: list[str] = []
        for part in path:
            if isinstance(part, int):
                parts.append(f"[{part}]")
            else:
                parts.append(("." if parts else "") + str(part))
        return "".join(parts) or "JSON全体"

    @staticmethod
    def _type_label(expected: Any) -> str:
        labels = {
            "string": "文字列",
            "array": "配列",
            "object": "オブジェクト",
            "null": "null",
            "number": "数値",
            "integer": "整数",
            "boolean": "真偽値",
        }
        values = expected if isinstance(expected, list) else [expected]
        return " または ".join(labels.get(value, str(value)) for value in values)

    def _schema_error_details(self, course: Any) -> list[dict[str, str | None]]:
        validator = Draft202012Validator(self.load_schema())
        details: list[dict[str, str | None]] = []
        for error in sorted(validator.iter_errors(course), key=lambda item: list(item.absolute_path)):
            path = self._format_path(error.absolute_path)
            field = str(error.absolute_path[0]) if error.absolute_path else None
            if error.validator == "required":
                missing = re.search(r"'([^']+)'", error.message)
                if missing:
                    field = missing.group(1)
                    message = f"必須項目「{field}」がありません。"
                else:
                    message = error.message
            elif error.validator == "additionalProperties":
                message = "Schemaにないフィールドがあります。フィールド名を確認してください。"
            elif error.validator == "type":
                message = f"{path}は{self._type_label(error.validator_value)}である必要があります。"
            elif error.validator == "pattern":
                message = "指定された形式に一致しません。"
            elif error.validator == "minLength":
                message = "空文字にはできません。"
            elif error.validator == "anyOf":
                message = "title または description のどちらかに内容が必要です。"
            else:
                message = error.message
            full_message = message if message.startswith(path) else f"{path}: {message}"
            details.append({"field": field, "path": path, "message": full_message})
        return details[:20]

    def _schema_errors(self, course: Any) -> list[str]:
        return [detail["message"] for detail in self._schema_error_details(course)]

    @staticmethod
    def _has_value(value: Any) -> bool:
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, list):
            return any(CourseImporter._has_value(item) for item in value)
        if isinstance(value, dict):
            return any(CourseImporter._has_value(item) for item in value.values())
        return value is not None

    def _synthesized_field_meta(self, course: Any) -> dict[str, dict[str, str]]:
        properties = self.load_schema().get("properties", {})
        source = course if isinstance(course, dict) else {}
        return {
            field: {
                "sourceType": "explicit" if self._has_value(source.get(field)) else "missing",
                "reason": (
                    "旧形式JSONの値をシラバス由来として取り込みました。"
                    if self._has_value(source.get(field))
                    else "旧形式JSONに有効な値がありません。"
                ),
            }
            for field in properties
        }

    def _field_meta_errors(
        self,
        course: Any,
        field_meta: Any,
        *,
        conversion_mode: str = "support",
        require_all: bool = True,
        manual_fields: set[str] | None = None,
    ) -> list[dict[str, str | None]]:
        properties = self.load_schema().get("properties", {})
        fields = set(properties)
        details: list[dict[str, str | None]] = []
        if not isinstance(field_meta, dict):
            return [
                {
                    "field": None,
                    "path": "fieldMeta",
                    "message": "fieldMeta: 各項目の情報源を持つオブジェクトが必要です。",
                }
            ]

        unknown = sorted(set(field_meta) - fields)
        if unknown:
            details.append(
                {
                    "field": None,
                    "path": "fieldMeta",
                    "message": f"fieldMeta: Schemaにない項目があります: {', '.join(unknown)}",
                }
            )
        if require_all:
            missing = [field for field in properties if field not in field_meta]
            if missing:
                details.append(
                    {
                        "field": None,
                        "path": "fieldMeta",
                        "message": f"fieldMeta: 情報源がない項目があります: {', '.join(missing)}",
                    }
                )

        course_object = course if isinstance(course, dict) else {}
        manually_changed = manual_fields or set()
        for field in fields & set(field_meta):
            meta = field_meta[field]
            if not isinstance(meta, dict):
                details.append(
                    {
                        "field": field,
                        "path": f"fieldMeta.{field}",
                        "message": f"fieldMeta.{field}: オブジェクトで指定してください。",
                    }
                )
                continue
            source_type = meta.get("sourceType")
            reason = meta.get("reason")
            if source_type not in self.SOURCE_TYPES:
                details.append(
                    {
                        "field": field,
                        "path": f"fieldMeta.{field}.sourceType",
                        "message": (
                            f"fieldMeta.{field}.sourceType: explicit、inferred、proposed、timetable、missingの"
                            "いずれかを指定してください。"
                        ),
                    }
                )
                continue
            if reason is not None and not isinstance(reason, str):
                details.append(
                    {
                        "field": field,
                        "path": f"fieldMeta.{field}.reason",
                        "message": f"fieldMeta.{field}.reason: 文字列で指定してください。",
                    }
                )
            if source_type == "inferred":
                if field not in self.INFERABLE_FIELDS:
                    details.append(
                        {
                            "field": field,
                            "path": f"fieldMeta.{field}.sourceType",
                            "message": f"{field}: この項目はAI推察で設定できません。",
                        }
                    )
                if not isinstance(reason, str) or not reason.strip():
                    details.append(
                        {
                            "field": field,
                            "path": f"fieldMeta.{field}.reason",
                            "message": f"{field}: AI推察にはシラバス内の根拠が必要です。",
                        }
                    )
            if source_type == "proposed":
                if conversion_mode != "support":
                    details.append(
                        {
                            "field": field,
                            "path": f"fieldMeta.{field}.sourceType",
                            "message": f"{field}: 厳格変換ではAI下書き提案を使用できません。",
                        }
                    )
                if field not in self.PROPOSABLE_FIELDS:
                    details.append(
                        {
                            "field": field,
                            "path": f"fieldMeta.{field}.sourceType",
                            "message": f"{field}: この項目はAI下書き提案で設定できません。",
                        }
                    )
                if not isinstance(reason, str) or not reason.strip():
                    details.append(
                        {
                            "field": field,
                            "path": f"fieldMeta.{field}.reason",
                            "message": f"{field}: AI下書き提案には提案理由が必要です。",
                        }
                    )
            if source_type == "timetable":
                if field not in self.TIMETABLE_FIELDS:
                    details.append(
                        {
                            "field": field,
                            "path": f"fieldMeta.{field}.sourceType",
                            "message": f"{field}: この項目は時間割から引き継げません。",
                        }
                    )
                if not isinstance(reason, str) or not reason.strip():
                    details.append(
                        {
                            "field": field,
                            "path": f"fieldMeta.{field}.reason",
                            "message": f"{field}: 時間割から引き継いだ根拠が必要です。",
                        }
                    )
            has_value = self._has_value(course_object.get(field))
            if field in manually_changed:
                continue
            if source_type == "missing" and has_value:
                details.append(
                    {
                        "field": field,
                        "path": f"fieldMeta.{field}.sourceType",
                        "message": f"{field}: 情報不足の項目には値を設定できません。",
                    }
                )
            if source_type in {"explicit", "inferred", "proposed", "timetable"} and not has_value:
                details.append(
                    {
                        "field": field,
                        "path": f"fieldMeta.{field}.sourceType",
                        "message": f"{field}: 情報源を指定した項目には値が必要です。",
                    }
                )
        return details[:30]

    def _parse_submission_payload(
        self, payload: Any
    ) -> tuple[Any, Any, bool, list[dict[str, str | None]]]:
        if isinstance(payload, dict) and "course" in payload:
            extra = sorted(set(payload) - {"course", "fieldMeta"})
            course = payload.get("course")
            field_meta = payload.get("fieldMeta")
            errors: list[dict[str, str | None]] = []
            if "fieldMeta" not in payload:
                errors.append(
                    {
                        "field": None,
                        "path": "fieldMeta",
                        "message": "中間JSONにはfieldMetaが必要です。",
                    }
                )
            if extra:
                errors.append(
                    {
                        "field": None,
                        "path": "JSON全体",
                        "message": f"中間JSONに未対応の項目があります: {', '.join(extra)}",
                    }
                )
            return course, field_meta, False, errors
        course = payload
        return course, self._synthesized_field_meta(course), True, []

    def editor_config(self) -> dict[str, Any]:
        courses = self.load_courses_document()["courses"]
        suggestion_fields = (
            "category",
            "grade",
            "academicYear",
            "instructor",
            "courseType",
            "classStyle",
        )
        suggestions: dict[str, list[str]] = {}
        for field in suggestion_fields:
            suggestions[field] = sorted(
                {
                    value.strip()
                    for course in courses
                    if isinstance(course, dict)
                    and isinstance((value := course.get(field)), str)
                    and value.strip()
                }
            )
        return {
            "schema": self.load_schema(),
            "template": self._load_json(self.template_path),
            "suggestions": suggestions,
        }

    def _proposal_review_errors(
        self,
        course: Any,
        field_meta: Any,
        proposal_reviews: Any,
        manual_fields: set[str],
        proposal_original_values: dict[str, Any] | None = None,
    ) -> tuple[dict[str, str], list[dict[str, str | None]], tuple[str, ...]]:
        meta = field_meta if isinstance(field_meta, dict) else {}
        proposed_fields = tuple(
            field
            for field in self.load_schema().get("properties", {})
            if isinstance(meta.get(field), dict)
            and meta[field].get("sourceType") == "proposed"
        )
        reviews = proposal_reviews if isinstance(proposal_reviews, dict) else {}
        clean_reviews: dict[str, str] = {}
        details: list[dict[str, str | None]] = []
        unknown = sorted(set(reviews) - set(proposed_fields))
        if unknown:
            details.append(
                {
                    "field": None,
                    "path": "proposalReviews",
                    "message": f"AI提案ではない項目に確認状態があります: {', '.join(unknown)}",
                }
            )

        pending: list[str] = []
        course_object = course if isinstance(course, dict) else {}
        for field in proposed_fields:
            status = reviews.get(field, "pending")
            if status not in self.REVIEW_STATUSES:
                details.append(
                    {
                        "field": field,
                        "path": f"proposalReviews.{field}",
                        "message": f"{field}: AI提案の確認状態が不正です。",
                    }
                )
                continue
            clean_reviews[field] = status
            has_value = self._has_value(course_object.get(field))
            has_original = isinstance(proposal_original_values, dict) and field in proposal_original_values
            matches_original = (
                course_object.get(field) == proposal_original_values[field]
                if has_original
                else field not in manual_fields
            )
            if status == "pending":
                pending.append(field)
            elif status == "accepted":
                if not matches_original or not has_value:
                    details.append(
                        {
                            "field": field,
                            "path": f"proposalReviews.{field}",
                            "message": f"{field}: 内容を変更したAI提案は「修正して採用」として確認してください。",
                        }
                    )
            elif status == "edited":
                if matches_original or not has_value:
                    details.append(
                        {
                            "field": field,
                            "path": f"proposalReviews.{field}",
                            "message": f"{field}: 修正して採用する場合は、提案内容を編集して値を残してください。",
                        }
                    )
            elif status == "rejected" and has_value:
                details.append(
                    {
                        "field": field,
                        "path": f"proposalReviews.{field}",
                        "message": f"{field}: 使用しないAI提案は値を空にしてください。",
                    }
                )

        if pending:
            details.insert(
                0,
                {
                    "field": None,
                    "path": "proposalReviews",
                    "message": f"AI下書き提案が{len(pending)}件未確認です。すべて採用・修正・使用しないのいずれかを選択してください。",
                },
            )
        return clean_reviews, details[:30], tuple(pending)

    def validate_course(
        self,
        token: str,
        course: Any,
        field_meta: Any = None,
        manual_fields: Any = None,
        proposal_reviews: Any = None,
        require_proposal_review: bool = False,
    ) -> dict[str, Any]:
        preparation = self.get_preparation(token)
        schema_fields = set(self.load_schema().get("properties", {}))
        clean_manual_fields = tuple(
            sorted(
                field
                for field in (manual_fields if isinstance(manual_fields, list) else [])
                if isinstance(field, str) and field in schema_fields
            )
        )
        rejected_proposal_fields = {
            field
            for field, status in (
                proposal_reviews.items() if isinstance(proposal_reviews, dict) else []
            )
            if field in schema_fields and status == "rejected"
        }
        checklist = {
            "jsonSyntax": True,
            "metadata": True,
            "proposalReview": True,
            "schema": False,
            "idMatch": False,
            "notDuplicate": False,
        }
        schema_errors = self._schema_error_details(course)
        error_details = list(schema_errors)
        metadata_errors = (
            self._field_meta_errors(
                course,
                field_meta,
                conversion_mode=preparation.conversion_mode,
                require_all=True,
                manual_fields=set(clean_manual_fields) | rejected_proposal_fields,
            )
            if field_meta is not None
            else []
        )
        if metadata_errors:
            checklist["metadata"] = False
            error_details.extend(metadata_errors)
        clean_proposal_reviews, proposal_errors, pending_proposals = (
            self._proposal_review_errors(
                course,
                field_meta,
                proposal_reviews,
                set(clean_manual_fields),
                preparation.proposal_original_values,
            )
            if field_meta is not None
            else ({}, [], ())
        )
        if require_proposal_review and proposal_errors:
            checklist["proposalReview"] = False
            error_details.extend(proposal_errors)
        if not schema_errors:
            checklist["schema"] = True

        actual_id = course.get("id") if isinstance(course, dict) else None
        if actual_id == preparation.course_id:
            checklist["idMatch"] = True
        else:
            error_details.append(
                {
                    "field": "id",
                    "path": "id",
                    "message": (
                        f"id: 準備した授業ID「{preparation.course_id}」と"
                        "完全に一致させてください。"
                    ),
                }
            )

        if (
            isinstance(actual_id, str)
            and actual_id
            and not self.duplicate_id(actual_id, include_archived=True)
        ):
            checklist["notDuplicate"] = True
        elif isinstance(actual_id, str) and actual_id:
            error_details.append(
                {
                    "field": "id",
                    "path": "id",
                    "message": f"id: 授業ID「{actual_id or ''}」はすでに登録されています。",
                }
            )

        valid = all(checklist.values())
        result: dict[str, Any] = {
            "valid": valid,
            "checklist": checklist,
            "errors": [detail["message"] for detail in error_details],
            "fieldErrors": error_details,
        }
        if valid:
            clean_meta = field_meta if isinstance(field_meta, dict) else None
            inferred_fields = tuple(
                field
                for field in self.load_schema().get("properties", {})
                if field not in clean_manual_fields
                and clean_meta is not None
                and clean_meta.get(field, {}).get("sourceType") == "inferred"
                and self._has_value(course.get(field) if isinstance(course, dict) else None)
            )
            validation_token = uuid.uuid4().hex
            preparation.validation_token = validation_token
            preparation.validated_hash = self._course_hash(course)
            preparation.validated_field_meta = clean_meta
            preparation.validated_manual_fields = clean_manual_fields
            preparation.validated_inferred_fields = inferred_fields
            preparation.validated_proposal_reviews = clean_proposal_reviews
            result["validationToken"] = validation_token
            result["course"] = course
            result["inferredFields"] = list(inferred_fields)
            result["proposalReviews"] = clean_proposal_reviews
            result["proposedFields"] = list(clean_proposal_reviews)
            result["pendingProposedFields"] = list(pending_proposals)
        else:
            preparation.validation_token = None
            preparation.validated_hash = None
            preparation.validated_field_meta = None
            preparation.validated_manual_fields = ()
            preparation.validated_inferred_fields = ()
            preparation.validated_proposal_reviews = None
        return result

    def validate_submission(self, token: str, json_text: str) -> dict[str, Any]:
        preparation = self.get_preparation(token)
        preparation.proposal_original_values = None

        try:
            payload = json.loads(json_text)
        except json.JSONDecodeError as error:
            message = f"JSONの構文エラー: {error.lineno}行 {error.colno}列 — {error.msg}"
            return {
                "valid": False,
                "checklist": {
                    "jsonSyntax": False,
                    "metadata": False,
                    "proposalReview": False,
                    "schema": False,
                    "idMatch": False,
                    "notDuplicate": False,
                },
                "errors": [message],
                "fieldErrors": [],
            }

        course, field_meta, legacy_format, metadata_errors = self._parse_submission_payload(
            payload
        )
        result = self.validate_course(token, course, field_meta)
        if metadata_errors:
            result["valid"] = False
            result["checklist"]["metadata"] = False
            result["errors"] = [detail["message"] for detail in metadata_errors] + result["errors"]
            result["fieldErrors"] = metadata_errors + result["fieldErrors"]
            preparation.validation_token = None
            preparation.validated_hash = None
            preparation.validated_field_meta = None
            preparation.validated_manual_fields = ()
            preparation.validated_inferred_fields = ()
            preparation.validated_proposal_reviews = None
        result["fieldMeta"] = field_meta
        result["legacyFormat"] = legacy_format
        result["conversionMode"] = preparation.conversion_mode
        if result["valid"]:
            preparation.validated_hash = self._json_hash(json_text)
            meta = field_meta if isinstance(field_meta, dict) else {}
            course_object = course if isinstance(course, dict) else {}
            preparation.proposal_original_values = {
                field: json.loads(json.dumps(course_object.get(field), ensure_ascii=False))
                for field, item in meta.items()
                if isinstance(item, dict) and item.get("sourceType") == "proposed"
            }
        return result

    @staticmethod
    def _clone_json(value: Any) -> Any:
        return json.loads(json.dumps(value, ensure_ascii=False))

    def _validate_course_document(self, document: Any, label: str) -> None:
        if not isinstance(document, dict) or set(document) != {"courses"}:
            raise ImporterError(
                f"{label} は courses 配列だけを持つオブジェクトである必要があります。",
                status=500,
                code="invalid_course_document",
            )
        courses = document.get("courses")
        if not isinstance(courses, list):
            raise ImporterError(
                f"{label} の courses は配列である必要があります。",
                status=500,
                code="invalid_course_document",
            )
        seen: set[str] = set()
        for index, course in enumerate(courses):
            errors = self._schema_errors(course)
            if errors:
                raise ImporterError(
                    f"{label} の{index + 1}件目がSchemaに適合しません: {errors[0]}",
                    code="schema_error",
                )
            course_id = course.get("id")
            if course_id in seen:
                raise ImporterError(
                    f"{label} 内で授業ID「{course_id}」が重複しています。",
                    code="duplicate_id",
                )
            seen.add(course_id)

    @staticmethod
    def _safe_operation_name(value: str) -> str:
        normalized = re.sub(r"[^a-z0-9-]+", "-", value.lower()).strip("-")
        return normalized or "management"

    def _next_operation_backup_path(self, path: Path, operation: str) -> Path:
        stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        operation_name = self._safe_operation_name(operation)
        candidate = self.backups_root / f"{path.stem}-{operation_name}-{stamp}.json"
        counter = 2
        while candidate.exists():
            candidate = self.backups_root / (
                f"{path.stem}-{operation_name}-{stamp}-{counter}.json"
            )
            counter += 1
        return candidate

    def _serialize_document(self, path: Path, document: dict[str, Any]) -> str:
        serialized = json.dumps(document, ensure_ascii=False, indent=2)
        if path.exists() and path.read_text(encoding="utf-8").endswith(("\n", "\r")):
            serialized += "\n"
        return serialized

    def _stage_document(self, path: Path, document: dict[str, Any]) -> Path:
        descriptor, name = tempfile.mkstemp(
            prefix=f".{path.stem}-", suffix=".tmp", dir=path.parent
        )
        temporary_path = Path(name)
        try:
            serialized = self._serialize_document(path, document)
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(serialized)
                handle.flush()
                os.fsync(handle.fileno())
            if self._load_json(temporary_path) != document:
                raise ImporterError("一時ファイルの検証に失敗しました。", status=500)
            return temporary_path
        except Exception:
            temporary_path.unlink(missing_ok=True)
            raise

    def _backup_document(self, path: Path, operation: str) -> Path:
        backup_path = self._next_operation_backup_path(path, operation)
        if path.exists():
            shutil.copy2(path, backup_path)
        else:
            backup_path.write_text(
                json.dumps({"courses": []}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        return backup_path

    @staticmethod
    def _restore_backup(backup_path: Path, target_path: Path) -> None:
        descriptor, name = tempfile.mkstemp(
            prefix=f".{target_path.stem}-restore-",
            suffix=".tmp",
            dir=target_path.parent,
        )
        os.close(descriptor)
        restore_path = Path(name)
        try:
            shutil.copy2(backup_path, restore_path)
            os.replace(restore_path, target_path)
        finally:
            restore_path.unlink(missing_ok=True)

    def _write_documents_atomically(
        self,
        updates: list[tuple[Path, dict[str, Any], str]],
        operation: str,
    ) -> list[Path]:
        for _path, document, label in updates:
            self._validate_course_document(document, label)

        backups: list[tuple[Path, Path]] = []
        staged: list[tuple[Path, Path]] = []
        replaced: list[tuple[Path, Path]] = []
        try:
            for path, _document, _label in updates:
                backups.append((path, self._backup_document(path, operation)))
            for path, document, _label in updates:
                staged.append((path, self._stage_document(path, document)))
            for path, temporary_path in staged:
                os.replace(temporary_path, path)
                replaced.append((path, temporary_path))
            for path, document, _label in updates:
                if self._load_json(path) != document:
                    raise ImporterError(
                        f"{path.name} の書き込み後検証に失敗しました。",
                        status=500,
                    )
            return [backup for _path, backup in backups]
        except Exception as error:
            rollback_errors: list[str] = []
            backup_map = dict(backups)
            for path, _temporary_path in reversed(replaced):
                try:
                    self._restore_backup(backup_map[path], path)
                except Exception:
                    rollback_errors.append(path.name)
            if rollback_errors:
                raise ImporterError(
                    "更新に失敗し、次のファイルを自動復元できませんでした: "
                    + ", ".join(rollback_errors),
                    status=500,
                    code="rollback_failed",
                ) from error
            if isinstance(error, ImporterError):
                raise
            raise ImporterError(
                "授業管理データを更新できませんでした。元のファイルは復元されています。",
                status=500,
                code="write_failed",
            ) from error
        finally:
            for _path, temporary_path in staged:
                temporary_path.unlink(missing_ok=True)

    @staticmethod
    def _find_course(
        document: dict[str, Any], course_id: str
    ) -> tuple[int, dict[str, Any]]:
        for index, course in enumerate(document["courses"]):
            if isinstance(course, dict) and course.get("id") == course_id:
                return index, course
        raise ImporterError(
            f"授業ID「{course_id}」が見つかりません。",
            status=404,
            code="course_not_found",
        )

    @staticmethod
    def _academic_year_number(value: Any) -> int | None:
        if not isinstance(value, str):
            return None
        match = re.fullmatch(r"\s*(\d{4})(?:年度)?\s*", value)
        return int(match.group(1)) if match else None

    @staticmethod
    def _display_path(path: Path, repo_root: Path) -> str:
        try:
            shown = path.relative_to(repo_root)
        except ValueError:
            shown = path
        return str(shown).replace("\\", "/")

    def _management_source(self, source: str) -> tuple[Path, dict[str, Any], str]:
        if source == "published":
            return self.courses_path, self.load_courses_document(), "courses.json"
        if source == "archived":
            return (
                self.archived_courses_path,
                self.load_archived_courses_document(),
                "archived-courses.json",
            )
        raise ImporterError("授業データの区分が不正です。", code="invalid_source")

    def _management_summary(self, course: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": course.get("id"),
            "title": course.get("title"),
            "academicYear": course.get("academicYear"),
            "instructor": course.get("instructor"),
            "category": course.get("category"),
            "hash": self._course_hash(course),
        }

    def _sort_managed_courses(
        self, courses: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        def sort_key(course: dict[str, Any]) -> tuple[str, int, str]:
            year = self._academic_year_number(course.get("academicYear"))
            return (
                str(course.get("title") or "").casefold(),
                -(year if year is not None else -1),
                str(course.get("id") or ""),
            )

        return sorted(courses, key=sort_key)

    def management_catalog(self) -> dict[str, Any]:
        with self.management_lock:
            published = self.load_courses_document()
            archived = self.load_archived_courses_document()
            self._validate_course_document(published, "courses.json")
            self._validate_course_document(archived, "archived-courses.json")
            return {
                "published": [
                    self._management_summary(course)
                    for course in self._sort_managed_courses(published["courses"])
                ],
                "archived": [
                    self._management_summary(course)
                    for course in self._sort_managed_courses(archived["courses"])
                ],
            }

    def managed_course(self, source: str, course_id: str) -> dict[str, Any]:
        with self.management_lock:
            _path, document, label = self._management_source(source)
            self._validate_course_document(document, label)
            _index, course = self._find_course(document, course_id)
            return {
                "source": source,
                "course": self._clone_json(course),
                "hash": self._course_hash(course),
            }

    def rollover_draft(self, course_id: str) -> dict[str, Any]:
        with self.management_lock:
            document = self.load_courses_document()
            self._validate_course_document(document, "courses.json")
            _index, original = self._find_course(document, course_id)
            draft = self._clone_json(original)
            old_year = self._academic_year_number(original.get("academicYear"))
            next_year = old_year + 1 if old_year is not None else None
            if next_year is None:
                draft["academicYear"] = None
                draft["id"] = ""
            else:
                draft["academicYear"] = str(next_year)
                old_suffix = f"-{old_year}"
                base_id = (
                    course_id[: -len(old_suffix)]
                    if course_id.endswith(old_suffix)
                    else course_id
                )
                candidate = f"{base_id}-{next_year}"
                counter = 2
                while self.duplicate_id(candidate, include_archived=True):
                    candidate = f"{base_id}-{next_year}-{counter}"
                    counter += 1
                draft["id"] = candidate
            return {
                "course": draft,
                "original": self._clone_json(original),
                "originalHash": self._course_hash(original),
                "yearSuggested": next_year is not None,
            }

    def update_managed_course(
        self, course_id: str, course: Any, expected_hash: str
    ) -> dict[str, Any]:
        with self.management_lock:
            document = self.load_courses_document()
            self._validate_course_document(document, "courses.json")
            index, current = self._find_course(document, course_id)
            if self._course_hash(current) != expected_hash:
                raise ImporterError(
                    "授業が読み込み後に変更されています。一覧から開き直してください。",
                    status=409,
                    code="course_changed",
                )
            if not isinstance(course, dict) or course.get("id") != course_id:
                raise ImporterError(
                    "既存授業のIDは変更できません。",
                    code="id_change_not_allowed",
                )
            errors = self._schema_errors(course)
            if errors:
                raise ImporterError(
                    f"Schema検証に失敗しました: {errors[0]}", code="schema_error"
                )
            document["courses"][index] = self._clone_json(course)
            backups = self._write_documents_atomically(
                [(self.courses_path, document, "courses.json")],
                f"edit-{course_id}",
            )
            return {
                "course": self._clone_json(course),
                "backupPaths": [
                    self._display_path(path, self.repo_root) for path in backups
                ],
            }

    def create_next_year_course(
        self, original_id: str, course: Any, expected_hash: str
    ) -> dict[str, Any]:
        with self.management_lock:
            document = self.load_courses_document()
            self._validate_course_document(document, "courses.json")
            _index, original = self._find_course(document, original_id)
            if self._course_hash(original) != expected_hash:
                raise ImporterError(
                    "前年度版が読み込み後に変更されています。引き継ぎをやり直してください。",
                    status=409,
                    code="course_changed",
                )
            if not isinstance(course, dict) or course.get("id") == original_id:
                raise ImporterError(
                    "新年度版には前年度版と異なる授業IDが必要です。",
                    code="duplicate_id",
                )
            errors = self._schema_errors(course)
            if errors:
                raise ImporterError(
                    f"Schema検証に失敗しました: {errors[0]}", code="schema_error"
                )
            self.validate_new_id(course.get("id"))
            original_snapshot = self._clone_json(original)
            document["courses"].append(self._clone_json(course))
            if document["courses"][_index] != original_snapshot:
                raise ImporterError(
                    "前年度版を保護できなかったため、追加を中止しました。",
                    status=500,
                )
            backups = self._write_documents_atomically(
                [(self.courses_path, document, "courses.json")],
                f"rollover-{original_id}-to-{course.get('id')}",
            )
            return {
                "course": self._clone_json(course),
                "original": original_snapshot,
                "backupPaths": [
                    self._display_path(path, self.repo_root) for path in backups
                ],
            }

    def archive_managed_course(
        self, course_id: str, expected_hash: str
    ) -> dict[str, Any]:
        with self.management_lock:
            published = self.load_courses_document()
            archived = self.load_archived_courses_document()
            self._validate_course_document(published, "courses.json")
            self._validate_course_document(archived, "archived-courses.json")
            index, course = self._find_course(published, course_id)
            if self._course_hash(course) != expected_hash:
                raise ImporterError(
                    "授業が読み込み後に変更されています。一覧を更新してください。",
                    status=409,
                    code="course_changed",
                )
            if any(item.get("id") == course_id for item in archived["courses"]):
                raise ImporterError(
                    "同じ授業IDがすでにアーカイブに存在します。",
                    code="duplicate_id",
                )
            moved = published["courses"].pop(index)
            archived["courses"].append(self._clone_json(moved))
            backups = self._write_documents_atomically(
                [
                    (self.courses_path, published, "courses.json"),
                    (
                        self.archived_courses_path,
                        archived,
                        "archived-courses.json",
                    ),
                ],
                f"archive-{course_id}",
            )
            return {
                "course": self._clone_json(moved),
                "backupPaths": [
                    self._display_path(path, self.repo_root) for path in backups
                ],
            }

    def restore_managed_course(
        self, course_id: str, expected_hash: str
    ) -> dict[str, Any]:
        with self.management_lock:
            published = self.load_courses_document()
            archived = self.load_archived_courses_document()
            self._validate_course_document(published, "courses.json")
            self._validate_course_document(archived, "archived-courses.json")
            index, course = self._find_course(archived, course_id)
            if self._course_hash(course) != expected_hash:
                raise ImporterError(
                    "アーカイブ授業が読み込み後に変更されています。一覧を更新してください。",
                    status=409,
                    code="course_changed",
                )
            if any(item.get("id") == course_id for item in published["courses"]):
                raise ImporterError(
                    "公開中の授業に同じIDがあるため復元できません。",
                    code="duplicate_id",
                )
            moved = archived["courses"].pop(index)
            published["courses"].append(self._clone_json(moved))
            backups = self._write_documents_atomically(
                [
                    (self.courses_path, published, "courses.json"),
                    (
                        self.archived_courses_path,
                        archived,
                        "archived-courses.json",
                    ),
                ],
                f"restore-{course_id}",
            )
            return {
                "course": self._clone_json(moved),
                "backupPaths": [
                    self._display_path(path, self.repo_root) for path in backups
                ],
            }

    def permanently_delete_archived_course(
        self, course_id: str, expected_hash: str
    ) -> dict[str, Any]:
        with self.management_lock:
            archived = self.load_archived_courses_document()
            self._validate_course_document(archived, "archived-courses.json")
            index, course = self._find_course(archived, course_id)
            if self._course_hash(course) != expected_hash:
                raise ImporterError(
                    "アーカイブ授業が読み込み後に変更されています。一覧を更新してください。",
                    status=409,
                    code="course_changed",
                )
            removed = archived["courses"].pop(index)
            backups = self._write_documents_atomically(
                [
                    (
                        self.archived_courses_path,
                        archived,
                        "archived-courses.json",
                    )
                ],
                f"delete-{course_id}",
            )
            return {
                "course": self._clone_json(removed),
                "backupPaths": [
                    self._display_path(path, self.repo_root) for path in backups
                ],
            }

    def _next_backup_path(self) -> Path:
        stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        candidate = self.backups_root / f"courses-{stamp}.json"
        counter = 2
        while candidate.exists():
            candidate = self.backups_root / f"courses-{stamp}-{counter}.json"
            counter += 1
        return candidate

    def append_course(self, course: dict[str, Any]) -> Path:
        schema_errors = self._schema_errors(course)
        if schema_errors:
            raise ImporterError("登録直前のSchema検証に失敗しました。", code="schema_error")
        course_id = course.get("id")
        if self.duplicate_id(course_id, include_archived=True):
            raise ImporterError(
                f"授業ID「{course_id}」は公開中またはアーカイブに存在します。",
                code="duplicate_id",
            )

        original_text = self.courses_path.read_text(encoding="utf-8")
        document = self.load_courses_document()
        document["courses"].append(course)
        serialized = json.dumps(document, ensure_ascii=False, indent=2)
        if original_text.endswith(("\n", "\r")):
            serialized += "\n"
        backup_path = self._next_backup_path()
        temporary_path: Path | None = None

        try:
            shutil.copy2(self.courses_path, backup_path)
            descriptor, name = tempfile.mkstemp(
                prefix=".courses-", suffix=".tmp", dir=self.courses_path.parent
            )
            temporary_path = Path(name)
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(serialized)
                handle.flush()
                os.fsync(handle.fileno())

            verified = self._load_json(temporary_path)
            if verified != document:
                raise ImporterError("一時ファイルの検証に失敗しました。", status=500)
            os.replace(temporary_path, self.courses_path)
            temporary_path = None
            return backup_path
        except ImporterError:
            raise
        except Exception as error:
            raise ImporterError(
                "courses.json を更新できませんでした。元のファイルは保持されています。",
                status=500,
                code="write_failed",
            ) from error
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)

    def register(
        self,
        token: str,
        json_text: str,
        validation_token: str,
        inference_confirmed: bool = False,
    ) -> dict[str, str]:
        preparation = self.get_preparation(token)
        if (
            not validation_token
            or validation_token != preparation.validation_token
            or preparation.validated_hash != self._json_hash(json_text)
        ):
            raise ImporterError(
                "JSONが検証後に変更されています。もう一度検証してください。",
                code="validation_expired",
            )
        if preparation.validated_inferred_fields and not inference_confirmed:
            raise ImporterError(
                "AIによる推察項目を確認してから登録してください。",
                code="inference_confirmation_required",
            )
        if preparation.validated_proposal_reviews:
            raise ImporterError(
                "AI下書き提案は編集フォームで採用・修正・使用しないを確認してください。",
                code="proposal_review_required",
            )

        validation = self.validate_submission(token, json_text)
        if not validation["valid"]:
            raise ImporterError(
                "登録直前の再検証に失敗しました。内容を確認してください。",
                code="revalidation_failed",
            )
        course = validation["course"]
        backup_path = self.append_course(course)
        preparation.validation_token = None
        preparation.validated_hash = None
        preparation.validated_field_meta = None
        preparation.validated_manual_fields = ()
        preparation.validated_inferred_fields = ()
        preparation.validated_proposal_reviews = None

        def display_path(path: Path) -> str:
            try:
                shown = path.relative_to(self.repo_root)
            except ValueError:
                shown = path
            return str(shown).replace("\\", "/")

        return {
            "id": course["id"],
            "title": course["title"],
            "coursesPath": display_path(self.courses_path),
            "backupPath": display_path(backup_path),
        }

    def register_course(
        self,
        token: str,
        course: Any,
        validation_token: str,
        inference_confirmed: bool = False,
    ) -> dict[str, str]:
        preparation = self.get_preparation(token)
        if (
            not validation_token
            or validation_token != preparation.validation_token
            or preparation.validated_hash != self._course_hash(course)
        ):
            raise ImporterError(
                "フォーム内容が検証後に変更されています。もう一度最終検証してください。",
                code="validation_expired",
            )
        if preparation.validated_inferred_fields and not inference_confirmed:
            raise ImporterError(
                "AIによる推察項目を確認してから登録してください。",
                code="inference_confirmation_required",
            )

        validation = self.validate_course(
            token,
            course,
            preparation.validated_field_meta,
            list(preparation.validated_manual_fields),
            preparation.validated_proposal_reviews,
            True,
        )
        if not validation["valid"]:
            raise ImporterError(
                "登録直前の再検証に失敗しました。内容を確認してください。",
                code="revalidation_failed",
            )
        validated_course = validation["course"]
        backup_path = self.append_course(validated_course)
        preparation.validation_token = None
        preparation.validated_hash = None
        preparation.validated_field_meta = None
        preparation.validated_manual_fields = ()
        preparation.validated_inferred_fields = ()
        preparation.validated_proposal_reviews = None

        def display_path(path: Path) -> str:
            try:
                shown = path.relative_to(self.repo_root)
            except ValueError:
                shown = path
            return str(shown).replace("\\", "/")

        return {
            "id": validated_course["id"],
            "title": validated_course["title"],
            "coursesPath": display_path(self.courses_path),
            "backupPath": display_path(backup_path),
        }
