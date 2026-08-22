"""Local-only Flask application for importing ClassView syllabus data."""

from __future__ import annotations

import os
import socket
import sys
import threading
import webbrowser
from pathlib import Path
from uuid import uuid4

from flask import Flask, g, jsonify, render_template, request, send_file
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.serving import BaseWSGIServer, make_server

from importer import CourseImporter, ImporterError
from feedback_service import FeedbackError, FeedbackService
from publisher import ClassViewPublisher, PublicationError
from timetable_service import TimetableError, TimetableService
from works_service import CourseWorksService, WorksError
from single_instance import (
    APP_NAME,
    APP_VERSION,
    InstanceState,
    SingleInstanceGuard,
    find_existing_instance,
    show_existing_instance_unavailable,
)


if getattr(sys, "frozen", False):
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w", encoding="utf-8")

SOURCE_TOOL_ROOT = Path(__file__).resolve().parent
if getattr(sys, "frozen", False):
    executable_root = Path(sys.executable).resolve().parent
    TOOL_ROOT = executable_root.parent if executable_root.name.lower() == "dist" else executable_root
    BUNDLE_ROOT = Path(getattr(sys, "_MEIPASS", executable_root))
else:
    TOOL_ROOT = SOURCE_TOOL_ROOT
    BUNDLE_ROOT = SOURCE_TOOL_ROOT
REPO_ROOT = TOOL_ROOT.parents[1]


class RequestActivity:
    """Track requests that must finish before the application can exit."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active = 0

    def begin(self) -> None:
        with self._lock:
            self._active += 1

    def end(self) -> None:
        with self._lock:
            self._active = max(0, self._active - 1)

    def is_busy(self) -> bool:
        with self._lock:
            return self._active > 0


class ApplicationRuntime:
    """Coordinate graceful shutdown of the embedded local web server."""

    def __init__(self, instance_id: str) -> None:
        self.instance_id = instance_id
        self._server: BaseWSGIServer | None = None
        self._shutdown_started = threading.Event()

    def attach_server(self, server: BaseWSGIServer) -> None:
        self._server = server

    def request_shutdown(self) -> bool:
        if self._server is None or self._shutdown_started.is_set():
            return False
        self._shutdown_started.set()
        thread = threading.Thread(
            target=self._server.shutdown,
            daemon=True,
            name="classview-graceful-shutdown",
        )
        thread.start()
        return True


def create_app(
    repo_root: Path | None = None,
    work_root: Path | None = None,
    *,
    runtime: ApplicationRuntime | None = None,
    activity: RequestActivity | None = None,
    instance_id: str = "development",
) -> Flask:
    app = Flask(
        __name__,
        template_folder=str(BUNDLE_ROOT / "templates"),
        static_folder=str(BUNDLE_ROOT / "static"),
    )
    app.config["MAX_CONTENT_LENGTH"] = 512 * 1024 * 1024
    environment_work_root = os.environ.get("CLASSVIEW_IMPORTER_WORK_ROOT")
    default_work_root = Path(environment_work_root) if environment_work_root else TOOL_ROOT
    service = CourseImporter(repo_root or REPO_ROOT, work_root or default_work_root)
    publisher = ClassViewPublisher(
        repo_root or REPO_ROOT, work_root or default_work_root, service
    )
    feedback = FeedbackService(
        repo_root or REPO_ROOT, work_root or default_work_root, service
    )
    course_works = CourseWorksService(
        repo_root or REPO_ROOT, work_root or default_work_root, service
    )
    timetable = TimetableService(repo_root or REPO_ROOT, work_root or default_work_root)
    request_activity = activity or RequestActivity()
    app.config["IMPORTER_SERVICE"] = service
    app.config["PUBLISHER_SERVICE"] = publisher
    app.config["FEEDBACK_SERVICE"] = feedback
    app.config["COURSE_WORKS_SERVICE"] = course_works
    app.config["TIMETABLE_SERVICE"] = timetable
    app.config["REQUEST_ACTIVITY"] = request_activity
    app.config["APPLICATION_RUNTIME"] = runtime

    @app.before_request
    def restrict_to_localhost():
        if request.remote_addr not in {"127.0.0.1", "::1"}:
            return jsonify({"error": "このツールはlocalhostからのみ利用できます。"}), 403
        hostname = request.host.split(":", 1)[0].strip("[]").lower()
        if hostname not in {"localhost", "127.0.0.1", ""}:
            return jsonify({"error": "localhostのURLで開いてください。"}), 403
        return None

    @app.before_request
    def track_mutating_request():
        git_read_endpoints = {"admin_status", "publication_history"}
        modifies_local_state = request.method in {"POST", "PUT", "PATCH", "DELETE"}
        if (
            (modifies_local_state or request.endpoint in git_read_endpoints)
            and request.endpoint != "shutdown_admin_tool"
        ):
            request_activity.begin()
            g.classview_activity_tracked = True

    @app.teardown_request
    def finish_tracked_request(_error):
        if getattr(g, "classview_activity_tracked", False):
            request_activity.end()

    @app.errorhandler(ImporterError)
    def handle_importer_error(error: ImporterError):
        return jsonify({"error": error.message, "code": error.code}), error.status

    @app.errorhandler(PublicationError)
    def handle_publication_error(error: PublicationError):
        return (
            jsonify(
                {
                    "error": error.message,
                    "code": error.code,
                    "diagnostic": error.technical or publisher.last_diagnostic,
                }
            ),
            error.status,
        )

    @app.errorhandler(FeedbackError)
    def handle_feedback_error(error: FeedbackError):
        if request.path.startswith("/api/"):
            return jsonify(
                {
                    "error": error.message,
                    "code": error.code,
                    "diagnostic": error.diagnostic,
                }
            ), error.status
        return (
            render_template(
                "feedback_error.html",
                message=error.message,
            ),
            error.status,
        )

    @app.errorhandler(WorksError)
    def handle_works_error(error: WorksError):
        if request.path.startswith("/api/") or request.path.startswith("/works/image/"):
            return jsonify({"error": error.message, "code": error.code}), error.status
        return (
            render_template("works_error.html", message=error.message),
            error.status,
        )

    @app.errorhandler(TimetableError)
    def handle_timetable_error(error: TimetableError):
        return jsonify({"error": error.message, "code": error.code}), error.status

    @app.errorhandler(RequestEntityTooLarge)
    def handle_too_large(_error: RequestEntityTooLarge):
        return jsonify({"error": "選択したファイルが大きすぎます（上限512MB）。"}), 413

    @app.get("/")
    def index():
        return render_template("dashboard.html")

    @app.get("/register")
    def registration_page():
        return render_template("index.html", id_pattern=service.id_pattern())

    @app.get("/manage")
    def manage():
        return render_template("manage.html", id_pattern=service.id_pattern())

    @app.get("/timetable")
    def timetable_page():
        return render_template("timetable.html")

    @app.get("/api/timetable/status")
    def timetable_status():
        return jsonify(timetable.status())

    @app.get("/api/timetable/previews/<token>")
    def timetable_preview(token: str):
        return jsonify(timetable.get_preview(token))

    @app.post("/api/timetable/course-context")
    def create_timetable_course_context():
        payload = request.get_json(silent=True) or {}
        return jsonify(timetable.create_course_context(
            str(payload.get("previewToken", "")),
            str(payload.get("subjectName", "")),
        ))

    @app.get("/api/timetable/course-context/<token>")
    def timetable_course_context(token: str):
        return jsonify(timetable.get_course_context(token))

    @app.post("/api/timetable/course-context/<token>/cancel")
    def cancel_timetable_course_context(token: str):
        return jsonify(timetable.cancel_course_context(token))

    @app.post("/api/timetable/analyze")
    def analyze_timetable():
        uploaded = request.files.get("excel")
        if uploaded is None or not uploaded.filename:
            raise TimetableError("時間割Excelを選択してください。")
        result = timetable.analyze(
            uploaded.stream,
            uploaded.filename,
            request.form.get("startDate", ""),
            request.form.get("endDate", ""),
            sheet_name=request.form.get("sheetName", ""),
            source_modified_at=request.form.get("sourceModifiedAt") or None,
        )
        return jsonify(result)

    @app.post("/api/timetable/mappings/subject")
    def save_timetable_subject_mapping():
        payload = request.get_json(silent=True) or {}
        result = timetable.save_mapping(
            str(payload.get("subjectName", "")),
            str(payload.get("courseId", "")),
            replace_existing=bool(payload.get("replaceExisting", False)),
        )
        preview_token = str(payload.get("previewToken", ""))
        if preview_token:
            result["preview"] = timetable.refresh_preview(preview_token)
        return jsonify(result)

    @app.post("/api/timetable/mappings/item")
    def save_timetable_item_mapping():
        payload = request.get_json(silent=True) or {}
        result = timetable.save_item_mapping(
            str(payload.get("subjectName", "")),
            str(payload.get("classification", "")),
            replace_existing=bool(payload.get("replaceExisting", False)),
        )
        preview_token = str(payload.get("previewToken", ""))
        if preview_token:
            result["preview"] = timetable.refresh_preview(preview_token)
        return jsonify(result)

    @app.post("/api/timetable/mappings/group")
    def save_timetable_group_mapping():
        payload = request.get_json(silent=True) or {}
        result = timetable.save_group_mapping(
            str(payload.get("rawToken", "")),
            group_id=str(payload.get("groupId", "")),
            display_name=str(payload.get("displayName", "")),
        )
        preview_token = str(payload.get("previewToken", ""))
        if preview_token:
            result["preview"] = timetable.refresh_preview(preview_token)
        return jsonify(result)

    @app.post("/api/timetable/save")
    def save_timetable():
        payload = request.get_json(silent=True) or {}
        result = timetable.save_preview(
            str(payload.get("token", "")), bool(payload.get("warningsAcknowledged", False))
        )
        publisher.record_operation("時間割を保存", f"{result['entryCount']}件")
        return jsonify(result)

    @app.get("/works/course/<course_id>")
    def course_works_page(course_id: str):
        return render_template("works.html", **course_works.page_context(course_id))

    @app.get("/works/image/<work_id>")
    def course_work_image(work_id: str):
        return send_file(course_works.image_for(work_id), conditional=True)

    @app.get("/api/works/course/<course_id>")
    def course_works_catalog(course_id: str):
        return jsonify(course_works.page_context(course_id))

    @app.post("/api/works/course/<course_id>")
    def add_course_work(course_id: str):
        result = course_works.add(course_id, request.form, request.files.get("image"))
        publisher.record_operation("制作物を追加", result["work"]["id"])
        return jsonify({"success": True, **result, "unpublished": True})

    @app.post("/api/works/<work_id>/update")
    def update_course_work(work_id: str):
        result = course_works.update(work_id, request.form, request.files.get("image"))
        publisher.record_operation("制作物を編集", work_id)
        return jsonify({"success": True, **result, "unpublished": True})

    @app.post("/api/works/<work_id>/delete")
    def delete_course_work(work_id: str):
        result = course_works.delete(work_id)
        publisher.record_operation("制作物を削除", work_id)
        return jsonify({"success": True, **result, "unpublished": True})

    @app.post("/api/works/<work_id>/move")
    def move_course_work(work_id: str):
        payload = request.get_json(silent=True) or {}
        result = course_works.move(work_id, str(payload.get("direction", "")))
        if result.get("moved"):
            publisher.record_operation("制作物を並び替え", work_id)
        return jsonify({"success": True, **result, "unpublished": True})

    @app.get("/feedback")
    def feedback_dashboard():
        catalog = feedback.dashboard(
            request.args.get("course", "").strip(),
            request.args.get("year", "").strip(),
            request.args.get("issues", "").strip(),
        )
        return render_template("feedback_dashboard.html", **catalog)

    @app.get("/feedback/course/<course_id>/<academic_year>")
    def feedback_course(course_id: str, academic_year: str):
        return render_template(
            "feedback_course.html",
            summary=feedback.aggregate(course_id, academic_year),
        )

    @app.get("/feedback/response/<response_id>")
    def feedback_response(response_id: str):
        return render_template(
            "feedback_response.html", **feedback.response_detail(response_id)
        )

    @app.post("/api/feedback/import")
    def import_feedback_csv():
        uploaded = request.files.get("csv")
        if uploaded is None or not uploaded.filename:
            raise FeedbackError("Google Formsの回答CSVを選択してください。")
        result = feedback.import_csv(
            uploaded.stream,
            uploaded.filename,
            request.content_length,
        )
        publisher.record_operation("受講者フィードバックCSVを読み込み", str(result["added"]))
        return jsonify(result)

    @app.post("/api/feedback/issues/<path:issue_id>")
    def update_feedback_issue(issue_id: str):
        payload = request.get_json(silent=True) or {}
        return jsonify(
            feedback.update_issue(
                issue_id,
                str(payload.get("status", "")),
                str(payload.get("note", "")),
            )
        )

    @app.post("/api/feedback/public-summary")
    def save_feedback_public_summary():
        payload = request.get_json(silent=True) or {}
        result = feedback.save_public_summary(
            str(payload.get("courseId", "")),
            str(payload.get("academicYear", "")),
        )
        publisher.record_operation(
            "公開用フィードバック集計を保存",
            f"{payload.get('courseId', '')} {payload.get('academicYear', '')}",
        )
        return jsonify(result)

    @app.get("/api/health")
    def health():
        return jsonify(
            {
                "ok": True,
                "status": "ok",
                "app": APP_NAME,
                "version": APP_VERSION,
                "instanceId": instance_id,
            }
        )

    @app.get("/api/admin/status")
    def admin_status():
        refresh = request.args.get("refresh") == "1"
        auto_update = request.args.get("autoUpdate") == "1"
        return jsonify(publisher.status(refresh=refresh, auto_update=auto_update))

    @app.get("/api/admin/history")
    def publication_history():
        return jsonify({"history": publisher.history()})

    @app.post("/api/admin/publish")
    def publish_classview():
        return jsonify(publisher.publish())

    @app.post("/api/admin/reconnect")
    def reconnect_publication_service():
        return jsonify({"success": True, **publisher.reconnect()})

    @app.post("/api/admin/shutdown")
    def shutdown_admin_tool():
        publisher_busy = getattr(publisher, "is_busy", lambda: False)()
        if request_activity.is_busy() or publisher_busy:
            return (
                jsonify(
                    {
                        "error": "ClassViewを更新中です。処理が完了するまで終了できません。",
                        "code": "operation_in_progress",
                    }
                ),
                409,
            )
        if runtime is None or not runtime.request_shutdown():
            return (
                jsonify(
                    {
                        "error": "管理ツールを終了できませんでした。もう一度お試しください。",
                        "code": "shutdown_unavailable",
                    }
                ),
                503,
            )
        publisher.record_operation("管理ツールを終了")
        return jsonify({"success": True, "message": "管理ツールを終了します。"})

    @app.get("/api/editor-config")
    def editor_config():
        return jsonify(service.editor_config())

    @app.get("/api/manage/courses")
    def management_catalog():
        catalog = service.management_catalog()
        work_counts = course_works.counts_by_course()
        for source in ("published", "archived"):
            for course in catalog[source]:
                course["workCount"] = work_counts.get(course.get("id"), 0)
        return jsonify(catalog)

    @app.get("/api/manage/courses/<source>/<course_id>")
    def managed_course(source: str, course_id: str):
        return jsonify(service.managed_course(source, course_id))

    @app.post("/api/manage/courses/<course_id>/rollover-draft")
    def rollover_draft(course_id: str):
        return jsonify(service.rollover_draft(course_id))

    @app.post("/api/manage/courses/<course_id>/update")
    def update_managed_course(course_id: str):
        payload = request.get_json(silent=True) or {}
        result = service.update_managed_course(
            course_id,
            payload.get("course"),
            str(payload.get("expectedHash", "")),
        )
        publisher.record_operation("授業を編集", course_id)
        return jsonify({"success": True, **result, "unpublished": True})

    @app.post("/api/manage/courses/<course_id>/rollover")
    def create_next_year_course(course_id: str):
        payload = request.get_json(silent=True) or {}
        result = service.create_next_year_course(
            course_id,
            payload.get("course"),
            str(payload.get("expectedHash", "")),
        )
        publisher.record_operation("次年度版を追加", result["course"].get("id", ""))
        return jsonify({"success": True, **result, "unpublished": True})

    @app.post("/api/manage/courses/<course_id>/archive")
    def archive_managed_course(course_id: str):
        payload = request.get_json(silent=True) or {}
        result = service.archive_managed_course(
            course_id, str(payload.get("expectedHash", ""))
        )
        publisher.record_operation("授業をアーカイブ", course_id)
        return jsonify({"success": True, **result, "unpublished": True})

    @app.post("/api/manage/archived/<course_id>/restore")
    def restore_managed_course(course_id: str):
        payload = request.get_json(silent=True) or {}
        result = service.restore_managed_course(
            course_id, str(payload.get("expectedHash", ""))
        )
        publisher.record_operation("授業を公開中へ復元", course_id)
        return jsonify({"success": True, **result, "unpublished": True})

    @app.post("/api/manage/archived/<course_id>/delete")
    def permanently_delete_archived_course(course_id: str):
        payload = request.get_json(silent=True) or {}
        work_count = course_works.work_count(course_id)
        if work_count and not payload.get("confirmWorks"):
            raise ImporterError(
                f"この授業には制作物が{work_count}件登録されています。"
                "制作物を残したまま授業を完全削除することを確認してください。",
                status=409,
                code="course_has_works",
            )
        result = service.permanently_delete_archived_course(
            course_id, str(payload.get("expectedHash", ""))
        )
        publisher.record_operation("アーカイブ授業を完全削除", course_id)
        return jsonify({"success": True, **result, "unpublished": True})

    @app.post("/api/prepare")
    def prepare():
        uploaded = request.files.get("pdf")
        if uploaded is None or not uploaded.filename:
            raise ImporterError("シラバスPDFを選択してください。")
        page_range = request.form.get("pageRange")
        if page_range is None:
            page_range = request.form.get("pageNumber", "")
        course_id = request.form.get("courseId", "").strip()
        conversion_mode = request.form.get("conversionMode", "support")
        preparation = service.prepare_pdf(
            uploaded.stream,
            uploaded.filename,
            page_range,
            course_id,
            conversion_mode,
        )
        return jsonify(
            {
                "token": preparation.token,
                "courseId": preparation.course_id,
                "pageNumber": preparation.page_number,
                "pageRange": preparation.page_spec,
                "extractedPageCount": preparation.extracted_page_count,
                "pageCount": preparation.page_count,
                "conversionMode": preparation.conversion_mode,
                "prompt": preparation.prompt,
                "pdfViewUrl": f"/api/preparations/{preparation.token}/pdf",
                "pdfDownloadUrl": f"/api/preparations/{preparation.token}/download",
            }
        )

    @app.get("/api/preparations/<token>/pdf")
    def view_pdf(token: str):
        preparation = service.get_preparation(token)
        return send_file(preparation.extracted_pdf, mimetype="application/pdf")

    @app.get("/api/preparations/<token>/download")
    def download_pdf(token: str):
        preparation = service.get_preparation(token)
        return send_file(
            preparation.extracted_pdf,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"{preparation.course_id}.pdf",
        )

    @app.post("/api/validate")
    def validate():
        payload = request.get_json(silent=True) or {}
        return jsonify(
            service.validate_submission(
                str(payload.get("preparationToken", "")),
                str(payload.get("jsonText", "")),
            )
        )

    @app.post("/api/validate-course")
    def validate_course():
        payload = request.get_json(silent=True) or {}
        return jsonify(
            service.validate_course(
                str(payload.get("preparationToken", "")),
                payload.get("course"),
                payload.get("fieldMeta"),
                payload.get("manualFields"),
                payload.get("proposalReviews"),
                True,
            )
        )

    @app.post("/api/register")
    def register():
        payload = request.get_json(silent=True) or {}
        if "course" in payload:
            result = service.register_course(
                str(payload.get("preparationToken", "")),
                payload.get("course"),
                str(payload.get("validationToken", "")),
                bool(payload.get("inferenceConfirmed", False)),
            )
        else:
            result = service.register(
                str(payload.get("preparationToken", "")),
                str(payload.get("jsonText", "")),
                str(payload.get("validationToken", "")),
                bool(payload.get("inferenceConfirmed", False)),
            )
        publisher.record_operation("新しい授業を登録", result.get("id", ""))
        timetable_context_token = str(payload.get("timetableContextToken", ""))
        if timetable_context_token:
            try:
                timetable_result = timetable.complete_course_registration(
                    timetable_context_token, result["id"]
                )
            except TimetableError as error:
                return jsonify({
                    "error": (
                        f"授業「{result['title']}」は保存されましたが、"
                        f"時間割との対応を登録できませんでした: {error.message}"
                    ),
                    "code": "timetable_mapping_failed",
                    "courseCreated": True,
                    **result,
                }), 409
            result["timetableMapping"] = timetable_result
        return jsonify({"success": True, **result, "unpublished": True})

    return app


def select_local_port(preferred: int) -> int:
    """Select an available localhost port without exposing the server externally."""
    for port in range(preferred, min(preferred + 20, 65536)):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as candidate:
            candidate.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                candidate.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError("ClassView管理ツールを起動できるポートが見つかりません。")


def open_management_page(url: str) -> None:
    webbrowser.open(url)


def main() -> int:
    runtime_root = Path(
        os.environ.get("CLASSVIEW_IMPORTER_RUNTIME_ROOT", TOOL_ROOT / "runtime")
    )
    state_store = InstanceState(runtime_root)
    guard = SingleInstanceGuard(runtime_root)
    if not guard.acquire():
        while True:
            existing_url = find_existing_instance(state_store)
            if existing_url:
                if os.environ.get("CLASSVIEW_IMPORTER_NO_BROWSER") != "1":
                    open_management_page(existing_url)
                return 0
            if os.environ.get("CLASSVIEW_IMPORTER_NO_BROWSER") == "1":
                return 2
            if not show_existing_instance_unavailable():
                return 2

    instance_id = uuid4().hex
    state_store.clear()
    runtime = ApplicationRuntime(instance_id)
    try:
        preferred_port = int(os.environ.get("CLASSVIEW_IMPORTER_PORT", "5050"))
        port = select_local_port(preferred_port)
        url = f"http://127.0.0.1:{port}"
        activity = RequestActivity()
        application = create_app(
            runtime=runtime,
            activity=activity,
            instance_id=instance_id,
        )
        server = make_server("127.0.0.1", port, application, threaded=True)
        runtime.attach_server(server)
        state_store.write(pid=os.getpid(), port=port, instance_id=instance_id)
        application.config["PUBLISHER_SERVICE"].record_operation("管理ツールを起動")
        if os.environ.get("CLASSVIEW_IMPORTER_NO_BROWSER") != "1":
            browser_timer = threading.Timer(0.5, open_management_page, args=(url,))
            browser_timer.daemon = True
            browser_timer.start()
        server.serve_forever()
        return 0
    finally:
        state_store.clear(instance_id)
        guard.release()


if __name__ == "__main__":
    raise SystemExit(main())
