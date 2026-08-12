from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from uuid import uuid4


TOOL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOL_ROOT))

import app as classview_app  # noqa: E402
from single_instance import (  # noqa: E402
    APP_NAME,
    InstanceState,
    SingleInstanceGuard,
    find_existing_instance,
)


class SingleInstanceTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory()
        self.runtime_root = Path(self.temp_directory.name) / "runtime"

    def tearDown(self):
        self.temp_directory.cleanup()

    @unittest.skipUnless(os.name == "nt", "Windows Named Mutex test")
    def test_windows_named_mutex_allows_only_one_owner_and_recovers_after_release(self):
        name = rf"Local\Rara2g4.ClassView.Test.{uuid4().hex}"
        first = SingleInstanceGuard(self.runtime_root, name)
        second = SingleInstanceGuard(self.runtime_root, name)
        third = SingleInstanceGuard(self.runtime_root, name)
        try:
            self.assertTrue(first.acquire())
            self.assertFalse(second.acquire())
            first.release()
            self.assertTrue(third.acquire())
        finally:
            first.release()
            second.release()
            third.release()

    def test_runtime_state_contains_only_endpoint_data_and_can_clear_stale_state(self):
        state = InstanceState(self.runtime_root)
        state.write(pid=1234, port=5050, instance_id="instance-a")

        self.assertEqual(
            state.read(),
            {"pid": 1234, "port": 5050, "instanceId": "instance-a"},
        )
        raw = json.loads(state.path.read_text(encoding="utf-8"))
        self.assertEqual(set(raw), {"pid", "port", "instanceId"})
        state.clear()
        self.assertFalse(state.path.exists())

    def test_existing_instance_retry_handles_server_startup_delay(self):
        state = MagicMock()
        state.read.side_effect = [None, None, {"pid": 1, "port": 5050, "instanceId": "a"}]
        health = MagicMock(return_value="http://127.0.0.1:5050")

        with patch("single_instance.time.sleep") as mocked_sleep:
            url = find_existing_instance(
                state,
                attempts=3,
                interval=0.01,
                health_check=health,
            )

        self.assertEqual(url, "http://127.0.0.1:5050")
        self.assertEqual(mocked_sleep.call_count, 2)
        health.assert_called_once()

    def test_second_launch_opens_existing_page_without_starting_flask(self):
        guard = MagicMock()
        guard.acquire.return_value = False
        state = MagicMock()
        with (
            patch.object(classview_app, "SingleInstanceGuard", return_value=guard),
            patch.object(classview_app, "InstanceState", return_value=state),
            patch.object(
                classview_app,
                "find_existing_instance",
                return_value="http://127.0.0.1:5050",
            ),
            patch.object(classview_app, "open_management_page") as open_page,
            patch.object(classview_app, "make_server") as make_server,
            patch.dict(os.environ, {"CLASSVIEW_IMPORTER_RUNTIME_ROOT": str(self.runtime_root)}, clear=False),
        ):
            os.environ.pop("CLASSVIEW_IMPORTER_NO_BROWSER", None)
            result = classview_app.main()

        self.assertEqual(result, 0)
        open_page.assert_called_once_with("http://127.0.0.1:5050")
        make_server.assert_not_called()

    def test_first_launch_clears_stale_state_starts_one_server_and_cleans_up(self):
        guard = MagicMock()
        guard.acquire.return_value = True
        state = MagicMock()
        server = MagicMock()
        application = MagicMock()
        publisher = MagicMock()
        application.config = {"PUBLISHER_SERVICE": publisher}

        with (
            patch.object(classview_app, "SingleInstanceGuard", return_value=guard),
            patch.object(classview_app, "InstanceState", return_value=state),
            patch.object(classview_app, "select_local_port", return_value=5099),
            patch.object(classview_app, "create_app", return_value=application),
            patch.object(classview_app, "make_server", return_value=server),
            patch.dict(
                os.environ,
                {
                    "CLASSVIEW_IMPORTER_RUNTIME_ROOT": str(self.runtime_root),
                    "CLASSVIEW_IMPORTER_NO_BROWSER": "1",
                },
                clear=False,
            ),
        ):
            result = classview_app.main()

        self.assertEqual(result, 0)
        state.clear.assert_any_call()
        state.write.assert_called_once()
        server.serve_forever.assert_called_once_with()
        state.clear.assert_called_with(state.write.call_args.kwargs["instance_id"])
        guard.release.assert_called_once_with()

    def test_health_and_shutdown_are_staff_safe(self):
        runtime = MagicMock()
        runtime.request_shutdown.return_value = True
        activity = classview_app.RequestActivity()
        publisher = MagicMock()
        publisher.is_busy.return_value = False
        with (
            patch.object(classview_app, "CourseImporter"),
            patch.object(classview_app, "ClassViewPublisher", return_value=publisher),
        ):
            application = classview_app.create_app(
                self.runtime_root,
                self.runtime_root,
                runtime=runtime,
                activity=activity,
                instance_id="health-instance",
            )

        client = application.test_client()
        health = client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(
            health.get_json(),
            {
                "ok": True,
                "status": "ok",
                "app": APP_NAME,
                "version": "1",
                "instanceId": "health-instance",
            },
        )
        self.assertNotIn("path", health.get_json())

        activity.begin()
        busy = client.post("/api/admin/shutdown", json={})
        self.assertEqual(busy.status_code, 409)
        self.assertEqual(busy.get_json()["code"], "operation_in_progress")
        runtime.request_shutdown.assert_not_called()
        activity.end()

        stopped = client.post("/api/admin/shutdown", json={})
        self.assertEqual(stopped.status_code, 200)
        runtime.request_shutdown.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
