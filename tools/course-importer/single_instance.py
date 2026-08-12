"""Single-instance lifecycle support for the local ClassView administration tool."""

from __future__ import annotations

import ctypes
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable


APP_NAME = "ClassView Management Tool"
APP_VERSION = "1"
DEFAULT_MUTEX_NAME = r"Local\Rara2g4.ClassView.ManagementTool.SingleInstance.v1"
ERROR_ALREADY_EXISTS = 183


class SingleInstanceGuard:
    """Hold an OS-managed lock for the lifetime of the administration tool."""

    def __init__(self, runtime_root: Path, mutex_name: str | None = None) -> None:
        self.runtime_root = Path(runtime_root)
        self.mutex_name = mutex_name or os.environ.get(
            "CLASSVIEW_INSTANCE_MUTEX", DEFAULT_MUTEX_NAME
        )
        self._handle: int | None = None
        self._lock_file: Any = None

    def acquire(self) -> bool:
        if os.name == "nt":
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
            kernel32.CreateMutexW.restype = ctypes.c_void_p
            kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
            kernel32.CloseHandle.restype = ctypes.c_bool
            ctypes.set_last_error(0)
            handle = kernel32.CreateMutexW(None, False, self.mutex_name)
            if not handle:
                raise ctypes.WinError(ctypes.get_last_error())
            if ctypes.get_last_error() == ERROR_ALREADY_EXISTS:
                kernel32.CloseHandle(handle)
                return False
            self._handle = int(handle)
            return True

        self.runtime_root.mkdir(parents=True, exist_ok=True)
        lock_path = self.runtime_root / "classview-instance.lock"
        lock_file = lock_path.open("a+b")
        try:
            import fcntl

            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (ImportError, BlockingIOError, OSError):
            lock_file.close()
            return False
        self._lock_file = lock_file
        return True

    def release(self) -> None:
        if self._handle is not None and os.name == "nt":
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
            kernel32.CloseHandle.restype = ctypes.c_bool
            kernel32.CloseHandle(ctypes.c_void_p(self._handle))
            self._handle = None
        if self._lock_file is not None:
            try:
                import fcntl

                fcntl.flock(self._lock_file.fileno(), fcntl.LOCK_UN)
            finally:
                self._lock_file.close()
                self._lock_file = None


class InstanceState:
    """Share only the localhost endpoint required to reopen an existing instance."""

    def __init__(self, runtime_root: Path) -> None:
        self.runtime_root = Path(runtime_root)
        self.path = self.runtime_root / "classview-instance.json"

    def read(self) -> dict[str, Any] | None:
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (FileNotFoundError, OSError, json.JSONDecodeError):
            return None
        if not isinstance(value, dict):
            return None
        pid = value.get("pid")
        port = value.get("port")
        instance_id = value.get("instanceId")
        if (
            not isinstance(pid, int)
            or pid <= 0
            or not isinstance(port, int)
            or not 1 <= port <= 65535
            or not isinstance(instance_id, str)
            or not instance_id
        ):
            return None
        return {"pid": pid, "port": port, "instanceId": instance_id}

    def write(self, *, pid: int, port: int, instance_id: str) -> None:
        self.runtime_root.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(f".{pid}.tmp")
        temporary.write_text(
            json.dumps(
                {"pid": pid, "port": port, "instanceId": instance_id},
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, self.path)

    def clear(self, instance_id: str | None = None) -> None:
        if instance_id is not None:
            current = self.read()
            if current is not None and current["instanceId"] != instance_id:
                return
        try:
            self.path.unlink()
        except FileNotFoundError:
            pass


def check_instance_health(state: dict[str, Any], timeout: float = 0.5) -> str | None:
    """Return the management URL only when it belongs to the recorded instance."""
    url = f"http://127.0.0.1:{state['port']}"
    request = urllib.request.Request(
        f"{url}/api/health",
        headers={"Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, urllib.error.URLError, json.JSONDecodeError):
        return None
    if (
        response.status == 200
        and payload.get("status") == "ok"
        and payload.get("app") == APP_NAME
        and payload.get("instanceId") == state["instanceId"]
    ):
        return url
    return None


def find_existing_instance(
    state_store: InstanceState,
    *,
    attempts: int = 20,
    interval: float = 0.25,
    health_check: Callable[[dict[str, Any]], str | None] = check_instance_health,
) -> str | None:
    """Wait briefly for an already-starting instance to become healthy."""
    for attempt in range(max(1, attempts)):
        state = state_store.read()
        if state is not None:
            url = health_check(state)
            if url:
                return url
        if attempt + 1 < attempts:
            time.sleep(interval)
    return None


def show_existing_instance_unavailable() -> bool:
    """Show a staff-facing Retry/Cancel message; return True for Retry."""
    if os.name != "nt":
        return False
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    result = user32.MessageBoxW(
        None,
        "ClassViewは既に起動していますが、管理画面を開けませんでした。\n"
        "少し待ってから、もう一度お試しください。",
        "ClassView 管理ツール",
        0x00000005 | 0x00000030 | 0x00040000,
    )
    return result == 4
