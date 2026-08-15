"""Safe local management for public ClassView course works."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
import threading
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

from jsonschema import Draft202012Validator

from importer import CourseImporter, ImporterError


class WorksError(Exception):
    """An expected, staff-facing works management error."""

    def __init__(
        self,
        message: str,
        *,
        status: int = 400,
        code: str = "invalid_work",
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


class CourseWorksService:
    """Store public work metadata separately from syllabus-derived course data."""

    MAX_IMAGE_BYTES = 5 * 1024 * 1024
    MAX_IMAGE_DIMENSION = 12_000
    MAX_IMAGE_PIXELS = 60_000_000
    ALLOWED_MIME_TYPES = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }
    DISPLAY_MODES = {"image", "link", "both"}

    def __init__(
        self,
        repo_root: Path,
        work_root: Path,
        importer: CourseImporter,
    ) -> None:
        self.repo_root = Path(repo_root).resolve()
        self.work_root = Path(work_root).resolve()
        self.importer = importer
        self.document_path = self.repo_root / "data" / "course-works.json"
        self.schema_path = self.repo_root / "data" / "course-works.schema.json"
        self.assets_root = self.repo_root / "assets" / "works"
        self.backups_root = self.importer.backups_root
        self.assets_root.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()

    @staticmethod
    def _clone(value: Any) -> Any:
        return json.loads(json.dumps(value, ensure_ascii=False))

    @staticmethod
    def _text(value: Any, *, limit: int, required: bool = False) -> str | None:
        text = str(value or "").strip()
        if required and not text:
            raise WorksError("作品名を入力してください。", code="title_required")
        if len(text) > limit:
            raise WorksError(
                f"入力内容が長すぎます（{limit}文字以内にしてください）。",
                code="text_too_long",
            )
        return text or None

    @staticmethod
    def _academic_year(course: dict[str, Any]) -> str | None:
        value = course.get("academicYear")
        return value.strip() if isinstance(value, str) and value.strip() else None

    def _course(self, course_id: str) -> tuple[dict[str, Any], str]:
        for source, document in (
            ("published", self.importer.load_courses_document()),
            ("archived", self.importer.load_archived_courses_document()),
        ):
            for course in document.get("courses", []):
                if isinstance(course, dict) and course.get("id") == course_id:
                    return self._clone(course), source
        raise WorksError(
            f"授業ID「{course_id}」が見つかりません。",
            status=404,
            code="course_not_found",
        )

    def _load_schema(self) -> dict[str, Any]:
        try:
            schema = json.loads(self.schema_path.read_text(encoding="utf-8"))
            Draft202012Validator.check_schema(schema)
            return schema
        except (OSError, json.JSONDecodeError, Exception) as error:
            if isinstance(error, WorksError):
                raise
            raise WorksError(
                "制作物データの仕様を読み込めません。管理担当者へ確認してください。",
                status=500,
                code="invalid_works_schema",
            ) from error

    def load_document(self) -> dict[str, Any]:
        try:
            document = json.loads(self.document_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            document = {"works": []}
        except (OSError, json.JSONDecodeError) as error:
            raise WorksError(
                "制作物データを読み込めません。管理担当者へ確認してください。",
                status=500,
                code="invalid_works_document",
            ) from error
        self._validate_document(document)
        return document

    def _validate_document(self, document: Any) -> None:
        schema = self._load_schema()
        errors = sorted(
            Draft202012Validator(schema).iter_errors(document),
            key=lambda item: list(item.absolute_path),
        )
        if errors:
            raise WorksError(
                f"制作物データの形式が正しくありません: {errors[0].message}",
                status=500,
                code="works_schema_error",
            )
        ids = [work.get("id") for work in document.get("works", [])]
        if len(ids) != len(set(ids)):
            raise WorksError(
                "制作物IDが重複しています。管理担当者へ確認してください。",
                status=500,
                code="duplicate_work_id",
            )

    def _backup_json(self, operation: str) -> Path:
        stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        safe_operation = re.sub(r"[^a-z0-9-]+", "-", operation.lower()).strip("-")
        candidate = self.backups_root / f"course-works-{safe_operation or 'update'}-{stamp}.json"
        counter = 2
        while candidate.exists():
            candidate = self.backups_root / (
                f"course-works-{safe_operation or 'update'}-{stamp}-{counter}.json"
            )
            counter += 1
        if self.document_path.exists():
            shutil.copy2(self.document_path, candidate)
        else:
            candidate.write_text('{\n  "works": []\n}\n', encoding="utf-8")
        return candidate

    def _write_document(self, document: dict[str, Any], operation: str) -> Path:
        self._validate_document(document)
        backup = self._backup_json(operation)
        descriptor, name = tempfile.mkstemp(
            prefix=".course-works-", suffix=".tmp", dir=self.document_path.parent
        )
        temporary = Path(name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
                json.dump(document, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            written = json.loads(temporary.read_text(encoding="utf-8"))
            self._validate_document(written)
            os.replace(temporary, self.document_path)
            return backup
        except Exception as error:
            temporary.unlink(missing_ok=True)
            if backup.exists():
                shutil.copy2(backup, self.document_path)
            if isinstance(error, WorksError):
                raise
            raise WorksError(
                "制作物を保存できませんでした。元のデータは維持されています。",
                status=500,
                code="works_write_failed",
            ) from error
        finally:
            temporary.unlink(missing_ok=True)

    @staticmethod
    def _find_work(document: dict[str, Any], work_id: str) -> tuple[int, dict[str, Any]]:
        for index, work in enumerate(document["works"]):
            if isinstance(work, dict) and work.get("id") == work_id:
                return index, work
        raise WorksError(
            "指定された制作物が見つかりません。",
            status=404,
            code="work_not_found",
        )

    @staticmethod
    def _safe_year_segment(year: str | None) -> str:
        if year is None:
            return "no-year"
        simple = re.fullmatch(r"\s*(\d{4})(?:年度)?\s*", year)
        if simple:
            return simple.group(1)
        digest = hashlib.sha256(year.encode("utf-8")).hexdigest()[:10]
        return f"year-{digest}"

    @staticmethod
    def _jpeg_dimensions(data: bytes) -> tuple[int, int] | None:
        position = 2
        sof_markers = {
            0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
            0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
        }
        while position + 4 <= len(data):
            if data[position] != 0xFF:
                position += 1
                continue
            while position < len(data) and data[position] == 0xFF:
                position += 1
            if position >= len(data):
                break
            marker = data[position]
            position += 1
            if marker in {0xD8, 0xD9}:
                continue
            if marker == 0xDA or position + 2 > len(data):
                break
            segment_length = int.from_bytes(data[position:position + 2], "big")
            if segment_length < 2 or position + segment_length > len(data):
                break
            if marker in sof_markers and segment_length >= 7:
                height = int.from_bytes(data[position + 3:position + 5], "big")
                width = int.from_bytes(data[position + 5:position + 7], "big")
                return width, height
            position += segment_length
        return None

    @staticmethod
    def _webp_dimensions(data: bytes) -> tuple[int, int] | None:
        if len(data) < 30:
            return None
        chunk = data[12:16]
        if chunk == b"VP8X":
            width = 1 + int.from_bytes(data[24:27], "little")
            height = 1 + int.from_bytes(data[27:30], "little")
            return width, height
        if chunk == b"VP8L" and len(data) >= 25 and data[20] == 0x2F:
            b1, b2, b3, b4 = data[21:25]
            width = 1 + b1 + ((b2 & 0x3F) << 8)
            height = 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0F) << 10)
            return width, height
        if chunk == b"VP8 ":
            marker = data.find(b"\x9d\x01\x2a", 20)
            if marker >= 0 and marker + 7 <= len(data):
                width = int.from_bytes(data[marker + 3:marker + 5], "little") & 0x3FFF
                height = int.from_bytes(data[marker + 5:marker + 7], "little") & 0x3FFF
                return width, height
        return None

    def _inspect_image(self, upload: Any) -> tuple[bytes, str, int, int]:
        filename = str(getattr(upload, "filename", "") or "")
        if not filename:
            raise WorksError("画像ファイルを選択してください。", code="image_required")
        suffix = Path(filename).suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
            raise WorksError(
                "画像はJPEG、PNG、WebP形式を使用してください。",
                code="invalid_image_extension",
            )
        content_type = str(getattr(upload, "mimetype", "") or "").lower()
        expected_type = self.ALLOWED_MIME_TYPES.get(content_type)
        if not expected_type:
            raise WorksError(
                "画像の種類を確認できません。JPEG、PNG、WebPを選択してください。",
                code="invalid_image_mime",
            )
        data = upload.stream.read(self.MAX_IMAGE_BYTES + 1)
        if len(data) > self.MAX_IMAGE_BYTES:
            raise WorksError(
                "画像が大きすぎます。5MB以下の画像を使用してください。",
                status=413,
                code="image_too_large",
            )
        if len(data) < 24:
            raise WorksError("画像ファイルが壊れている可能性があります。", code="invalid_image")

        detected: str | None = None
        dimensions: tuple[int, int] | None = None
        if data.startswith(b"\x89PNG\r\n\x1a\n"):
            detected = "png"
            dimensions = (
                int.from_bytes(data[16:20], "big"),
                int.from_bytes(data[20:24], "big"),
            )
        elif data.startswith(b"\xff\xd8"):
            detected = "jpg"
            dimensions = self._jpeg_dimensions(data)
        elif data.startswith(b"RIFF") and data[8:12] == b"WEBP":
            detected = "webp"
            dimensions = self._webp_dimensions(data)
        if detected is None or dimensions is None or detected != expected_type:
            raise WorksError(
                "ファイルの内容と画像形式が一致しません。別の画像を選択してください。",
                code="invalid_image_signature",
            )
        if suffix in {".jpg", ".jpeg"}:
            suffix_type = "jpg"
        else:
            suffix_type = suffix[1:]
        if suffix_type != detected:
            raise WorksError(
                "ファイル名の拡張子と画像の内容が一致しません。",
                code="image_extension_mismatch",
            )
        width, height = dimensions
        if (
            width < 1
            or height < 1
            or width > self.MAX_IMAGE_DIMENSION
            or height > self.MAX_IMAGE_DIMENSION
            or width * height > self.MAX_IMAGE_PIXELS
        ):
            raise WorksError(
                "画像の縦横サイズが大きすぎます。小さくしてから登録してください。",
                code="image_dimensions_too_large",
            )
        return data, detected, width, height

    def _new_image_target(
        self, course_id: str, academic_year: str | None, extension: str
    ) -> tuple[str, Path]:
        filename = f"{uuid4().hex}.{extension}"
        relative = Path("assets") / "works" / course_id / self._safe_year_segment(academic_year) / filename
        target = (self.repo_root / relative).resolve()
        try:
            target.relative_to(self.assets_root)
        except ValueError as error:
            raise WorksError("画像の保存先を安全に作成できません。", status=500) from error
        return relative.as_posix(), target

    @staticmethod
    def _write_image(target: Path, data: bytes) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        descriptor, name = tempfile.mkstemp(prefix=".work-image-", suffix=".tmp", dir=target.parent)
        temporary = Path(name)
        try:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)

    def _asset_path(self, relative: str) -> Path:
        if not isinstance(relative, str) or not relative.startswith("assets/works/"):
            raise WorksError("制作物画像のパスが不正です。", status=500)
        target = (self.repo_root / Path(relative)).resolve()
        try:
            target.relative_to(self.assets_root)
        except ValueError as error:
            raise WorksError("制作物画像のパスが不正です。", status=500) from error
        return target

    def _backup_asset(self, target: Path, operation: str) -> Path | None:
        if not target.is_file():
            return None
        backup_dir = self.backups_root / "course-works-assets"
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        candidate = backup_dir / f"{stamp}-{operation}-{target.name}"
        counter = 2
        while candidate.exists():
            candidate = backup_dir / f"{stamp}-{operation}-{counter}-{target.name}"
            counter += 1
        shutil.copy2(target, candidate)
        return candidate

    @staticmethod
    def _validate_url(value: Any, *, required: bool) -> str | None:
        text = str(value or "").strip()
        if required and not text:
            raise WorksError("外部URLを入力してください。", code="url_required")
        if not text:
            return None
        if len(text) > 2048:
            raise WorksError("外部URLが長すぎます。", code="url_too_long")
        parsed = urlparse(text)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise WorksError(
                "外部URLは http:// または https:// で始まるURLを入力してください。",
                code="unsafe_url",
            )
        return text

    @staticmethod
    def _permission_confirmed(form: Any) -> bool:
        value = str(form.get("permissionConfirmed", "")).lower()
        return value in {"1", "true", "on", "yes"}

    def _clean_form(self, form: Any) -> dict[str, Any]:
        if not self._permission_confirmed(form):
            raise WorksError(
                "掲載許可・著作権・個人情報を確認したうえで、確認欄にチェックしてください。",
                code="permission_confirmation_required",
            )
        mode = str(form.get("displayMode", "")).strip()
        if mode not in self.DISPLAY_MODES:
            raise WorksError("表示方法を選択してください。", code="display_mode_required")
        title = self._text(form.get("title"), limit=120, required=True)
        description = self._text(form.get("description"), limit=1000)
        alt = self._text(form.get("alt"), limit=250)
        url = self._validate_url(form.get("url"), required=mode in {"link", "both"})
        if mode == "image":
            url = None
        link_label = self._text(form.get("linkLabel"), limit=80) if url else None
        return {
            "mode": mode,
            "title": title,
            "description": description,
            "alt": alt,
            "url": url,
            "linkLabel": link_label or ("作品を見る" if url else None),
        }

    @staticmethod
    def _sort_key(work: dict[str, Any]) -> tuple[int, str, str]:
        return (
            work.get("order") if isinstance(work.get("order"), int) else 0,
            str(work.get("title") or ""),
            str(work.get("id") or ""),
        )

    def works_for(self, course_id: str, academic_year: str | None) -> list[dict[str, Any]]:
        document = self.load_document()
        works = [
            self._clone(work)
            for work in document["works"]
            if work.get("courseId") == course_id
            and work.get("academicYear") == academic_year
        ]
        return sorted(works, key=self._sort_key)

    def page_context(self, course_id: str) -> dict[str, Any]:
        with self.lock:
            course, source = self._course(course_id)
            year = self._academic_year(course)
            return {
                "course": course,
                "source": source,
                "works": self.works_for(course_id, year),
                "maxImageMegabytes": self.MAX_IMAGE_BYTES // (1024 * 1024),
            }

    def counts_by_course(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for work in self.load_document()["works"]:
            course_id = work.get("courseId")
            if isinstance(course_id, str):
                counts[course_id] = counts.get(course_id, 0) + 1
        return counts

    def add(self, course_id: str, form: Any, upload: Any = None) -> dict[str, Any]:
        with self.lock:
            course, _source = self._course(course_id)
            year = self._academic_year(course)
            clean = self._clean_form(form)
            image_data: bytes | None = None
            image_path: str | None = None
            target: Path | None = None
            if upload is not None and getattr(upload, "filename", ""):
                image_data, extension, _width, _height = self._inspect_image(upload)
                image_path, target = self._new_image_target(course_id, year, extension)
            if clean["mode"] in {"image", "both"} and image_data is None:
                raise WorksError("画像ファイルを選択してください。", code="image_required")

            document = self.load_document()
            work_id = f"{course_id}-work-{uuid4().hex[:12]}"
            group = self.works_for(course_id, year)
            work = {
                "id": work_id,
                "courseId": course_id,
                "academicYear": year,
                "title": clean["title"],
                "description": clean["description"],
                "image": image_path,
                "url": clean["url"],
                "linkLabel": clean["linkLabel"],
                "alt": clean["alt"],
                "order": len(group),
            }
            document["works"].append(work)
            if target is not None and image_data is not None:
                self._write_image(target, image_data)
            try:
                backup = self._write_document(document, f"add-{work_id}")
            except Exception:
                if target is not None:
                    target.unlink(missing_ok=True)
                raise
            warnings = [] if clean["alt"] or not image_path else ["画像の代替テキストには作品名を使用します。"]
            return {
                "work": self._clone(work),
                "backupPath": str(backup),
                "warnings": warnings,
            }

    def update(self, work_id: str, form: Any, upload: Any = None) -> dict[str, Any]:
        with self.lock:
            clean = self._clean_form(form)
            document = self.load_document()
            index, current = self._find_work(document, work_id)
            old_image = current.get("image")
            remove_image = str(form.get("removeImage", "")).lower() in {"1", "true", "on", "yes"}
            new_image = old_image
            image_data: bytes | None = None
            target: Path | None = None
            if upload is not None and getattr(upload, "filename", ""):
                image_data, extension, _width, _height = self._inspect_image(upload)
                new_image, target = self._new_image_target(
                    current["courseId"], current.get("academicYear"), extension
                )
            elif remove_image:
                new_image = None
            if clean["mode"] in {"image", "both"} and not new_image:
                raise WorksError("画像ファイルを選択してください。", code="image_required")

            updated = {
                **current,
                "title": clean["title"],
                "description": clean["description"],
                "image": new_image,
                "url": clean["url"],
                "linkLabel": clean["linkLabel"],
                "alt": clean["alt"],
            }
            document["works"][index] = updated
            if target is not None and image_data is not None:
                self._write_image(target, image_data)
            try:
                backup = self._write_document(document, f"edit-{work_id}")
            except Exception:
                if target is not None:
                    target.unlink(missing_ok=True)
                raise

            if old_image and old_image != new_image:
                still_used = any(
                    work.get("image") == old_image for work in document["works"]
                )
                if not still_used:
                    old_target = self._asset_path(old_image)
                    self._backup_asset(old_target, "replace")
                    old_target.unlink(missing_ok=True)
            warnings = [] if clean["alt"] or not new_image else ["画像の代替テキストには作品名を使用します。"]
            return {
                "work": self._clone(updated),
                "backupPath": str(backup),
                "warnings": warnings,
            }

    def delete(self, work_id: str) -> dict[str, Any]:
        with self.lock:
            document = self.load_document()
            index, work = self._find_work(document, work_id)
            removed = document["works"].pop(index)
            group = sorted(
                [
                    item
                    for item in document["works"]
                    if item.get("courseId") == removed.get("courseId")
                    and item.get("academicYear") == removed.get("academicYear")
                ],
                key=self._sort_key,
            )
            for order, item in enumerate(group):
                item["order"] = order
            image = removed.get("image")
            image_target = self._asset_path(image) if image else None
            if image_target is not None:
                self._backup_asset(image_target, "delete")
            backup = self._write_document(document, f"delete-{work_id}")
            if image_target is not None and not any(
                item.get("image") == image for item in document["works"]
            ):
                image_target.unlink(missing_ok=True)
            return {
                "work": self._clone(removed),
                "backupPath": str(backup),
            }

    def move(self, work_id: str, direction: str) -> dict[str, Any]:
        with self.lock:
            if direction not in {"up", "down"}:
                raise WorksError("並び替え方向が不正です。", code="invalid_direction")
            document = self.load_document()
            _index, selected = self._find_work(document, work_id)
            group = sorted(
                [
                    work
                    for work in document["works"]
                    if work.get("courseId") == selected.get("courseId")
                    and work.get("academicYear") == selected.get("academicYear")
                ],
                key=self._sort_key,
            )
            position = next(index for index, work in enumerate(group) if work["id"] == work_id)
            target_position = position - 1 if direction == "up" else position + 1
            if target_position < 0 or target_position >= len(group):
                return {"work": self._clone(selected), "moved": False}
            group[position], group[target_position] = group[target_position], group[position]
            for order, work in enumerate(group):
                work["order"] = order
            backup = self._write_document(document, f"move-{work_id}-{direction}")
            return {
                "work": self._clone(selected),
                "moved": True,
                "backupPath": str(backup),
            }

    def image_for(self, work_id: str) -> Path:
        with self.lock:
            document = self.load_document()
            _index, work = self._find_work(document, work_id)
            image = work.get("image")
            if not image:
                raise WorksError("この制作物には画像がありません。", status=404)
            target = self._asset_path(image)
            if not target.is_file():
                raise WorksError("制作物画像が見つかりません。", status=404)
            return target

    def work_count(self, course_id: str) -> int:
        return sum(
            1 for work in self.load_document()["works"] if work.get("courseId") == course_id
        )


__all__ = ["CourseWorksService", "WorksError"]
