#!/usr/bin/env python3
"""Apply or verify Roadmap's Tomcat default idle session timeout."""

from __future__ import annotations

import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


TIMEOUT_MINUTES = 30
WEB_XML = Path("/opt/tomcat/latest/conf/web.xml")
SESSION_CONFIG = re.compile(
    r"(<session-config>\s*<session-timeout>)[^<]*(</session-timeout>\s*</session-config>)",
    re.DOTALL,
)


def fail(message: str) -> None:
    raise SystemExit(message)


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"prepare", "verify"}:
        fail("Usage: roadmap-session-timeout.py prepare|verify")
    mode = sys.argv[1]
    if not WEB_XML.is_file():
        fail(f"Tomcat configuration not found: {WEB_XML}")

    original = WEB_XML.read_text(encoding="utf-8")
    matches = list(SESSION_CONFIG.finditer(original))
    if len(matches) != 1:
        fail(f"Expected one Tomcat session-config block, found {len(matches)}")

    replacement = rf"\g<1>{TIMEOUT_MINUTES}\g<2>"
    updated, count = SESSION_CONFIG.subn(replacement, original, count=1)
    if count != 1:
        fail("Could not update the Tomcat session timeout block")

    changed = updated != original
    if mode == "verify" and changed:
        fail(f"Tomcat session timeout is not {TIMEOUT_MINUTES} minutes")

    if mode == "prepare" and changed:
        metadata = WEB_XML.stat()
        backup = WEB_XML.with_name(
            f"web.xml.roadmap-backup-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}"
        )
        shutil.copy2(WEB_XML, backup)
        fd, temporary_name = tempfile.mkstemp(prefix=".web.xml.", dir=WEB_XML.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as temporary:
                temporary.write(updated)
            os.chmod(temporary_name, stat.S_IMODE(metadata.st_mode))
            os.chown(temporary_name, metadata.st_uid, metadata.st_gid)
            os.replace(temporary_name, WEB_XML)
        finally:
            if os.path.exists(temporary_name):
                os.unlink(temporary_name)
        subprocess.run(["systemctl", "restart", "tomcat.service"], check=True)

    status = subprocess.run(
        ["systemctl", "is-active", "tomcat.service"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if status != "active":
        fail(f"Tomcat is not active (status: {status})")

    state = "changed 1 file(s)" if changed and mode == "prepare" else "changed 0 file(s)"
    print(f"Tomcat idle session timeout is {TIMEOUT_MINUTES} minutes; {state}.")


if __name__ == "__main__":
    main()
