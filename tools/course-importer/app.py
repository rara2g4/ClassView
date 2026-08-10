"""Local-only Flask application for importing ClassView syllabus data."""

from __future__ import annotations

import os
import threading
import webbrowser
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.exceptions import RequestEntityTooLarge

from importer import CourseImporter, ImporterError


TOOL_ROOT = Path(__file__).resolve().parent
REPO_ROOT = TOOL_ROOT.parents[1]


def create_app(repo_root: Path | None = None, work_root: Path | None = None) -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 512 * 1024 * 1024
    environment_work_root = os.environ.get("CLASSVIEW_IMPORTER_WORK_ROOT")
    default_work_root = Path(environment_work_root) if environment_work_root else TOOL_ROOT
    service = CourseImporter(repo_root or REPO_ROOT, work_root or default_work_root)
    app.config["IMPORTER_SERVICE"] = service

    @app.before_request
    def restrict_to_localhost():
        if request.remote_addr not in {"127.0.0.1", "::1"}:
            return jsonify({"error": "このツールはlocalhostからのみ利用できます。"}), 403
        hostname = request.host.split(":", 1)[0].strip("[]").lower()
        if hostname not in {"localhost", "127.0.0.1", ""}:
            return jsonify({"error": "localhostのURLで開いてください。"}), 403
        return None

    @app.errorhandler(ImporterError)
    def handle_importer_error(error: ImporterError):
        return jsonify({"error": error.message, "code": error.code}), error.status

    @app.errorhandler(RequestEntityTooLarge)
    def handle_too_large(_error: RequestEntityTooLarge):
        return jsonify({"error": "PDFが大きすぎます（上限512MB）。"}), 413

    @app.get("/")
    def index():
        return render_template("index.html", id_pattern=service.id_pattern())

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True})

    @app.get("/api/editor-config")
    def editor_config():
        return jsonify(service.editor_config())

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
        return jsonify({"success": True, **result})

    return app


if __name__ == "__main__":
    port = int(os.environ.get("CLASSVIEW_IMPORTER_PORT", "5050"))
    url = f"http://localhost:{port}"
    if os.environ.get("CLASSVIEW_IMPORTER_NO_BROWSER") != "1":
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    create_app().run(host="127.0.0.1", port=port, debug=False, use_reloader=False)
