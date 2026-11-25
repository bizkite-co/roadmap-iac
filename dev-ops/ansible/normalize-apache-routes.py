#!/usr/bin/env python3
"""Converge the Roadmap application route allowlist on an existing Apache host."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import os
import shutil
import stat
import subprocess
import sys
import tempfile


PATHS = (
    Path("/etc/apache2/sites-enabled/000-default.conf"),
    Path("/etc/apache2/sites-enabled/default-ssl.conf"),
)
OLD_ROUTE_TAILS = (
    "|chat/send|logout)$",
    "|chat/send|mfa/enroll|mfa/challenge|mfa/recovery-codes|logout)$",
    "|chat/send|mfa/enroll|mfa/challenge|mfa/recovery-codes|mfa/replace|mfa/replace/enroll|logout)$",
)
NEW_ROUTE_TAIL = (
    "|chat/send|mfa/enroll|mfa/challenge|mfa/recovery-codes|mfa/replace|mfa/replace/enroll"
    "|mfa/email/enroll|mfa/email/challenge|mfa/email/challenge/start|mfa/email/disable"
    "|mfa/sms/enroll|mfa/sms/enroll/verify|mfa/sms/challenge|mfa/sms/challenge/start"
    "|mfa/sms/disable|logout)$"
)
REQUIRED_ROUTES = (
    "mfa/enroll",
    "mfa/challenge",
    "mfa/recovery-codes",
    "mfa/replace/enroll",
    "mfa/email/challenge/start",
    "mfa/sms/enroll/verify",
    "mfa/sms/challenge/start",
)
SECURITY_ROUTE = r"|changePassword\.html|security\.html|accountSettings\.html"
SECURITY_ROUTE_OLD = r"|changePassword\.html|accountSettings\.html"
ROUTE_LINE_PREFIX = "RewriteCond %{REQUEST_URI} !^/roadmap/"
SMOKE_ROUTES = (
    ("GET", "enroll"),
    ("GET", "replace"),
    ("GET", "replace/enroll"),
    ("GET", "challenge"),
    ("GET", "recovery-codes"),
    ("GET", "email/enroll"),
    ("GET", "email/challenge"),
    ("GET", "email/disable"),
    ("GET", "sms/enroll"),
    ("GET", "sms/challenge"),
    ("GET", "sms/disable"),
    ("POST", "email/challenge/start"),
    ("POST", "sms/enroll/verify"),
    ("POST", "sms/challenge/start"),
)


def is_route_line(line: str) -> bool:
    return ROUTE_LINE_PREFIX in line


def normalize_line(line: str, path: Path) -> str:
    updated = line
    if not all(route in updated for route in REQUIRED_ROUTES):
        matching = [tail for tail in OLD_ROUTE_TAILS if tail in updated]
        if not matching:
            raise RuntimeError(f"Unrecognized Roadmap route allowlist in {path}; no files changed.")
        for old_tail in matching:
            updated = updated.replace(old_tail, NEW_ROUTE_TAIL)

    if SECURITY_ROUTE not in updated:
        if SECURITY_ROUTE_OLD not in updated:
            raise RuntimeError(f"Unrecognized account-security allowlist in {path}; no files changed.")
        updated = updated.replace(SECURITY_ROUTE_OLD, SECURITY_ROUTE)
    return updated


def prepare(path: Path) -> tuple[str, str]:
    content = path.read_text()
    lines = content.splitlines(keepends=True)
    indexes = [index for index, line in enumerate(lines) if is_route_line(line)]
    if not indexes:
        raise RuntimeError(f"No Roadmap route allowlist found in {path}; no files changed.")
    for index in indexes:
        lines[index] = normalize_line(lines[index], path)
    return content, "".join(lines)


def atomic_write(path: Path, content: str) -> None:
    original = path.stat()
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as output:
        output.write(content)
        temporary = Path(output.name)
    os.chown(temporary, original.st_uid, original.st_gid)
    os.chmod(temporary, stat.S_IMODE(original.st_mode))
    temporary.replace(path)


def run_smoke_checks(host: str) -> None:
    for method, route in SMOKE_ROUTES:
        result = subprocess.run(
            [
                "curl", "--silent", "--output", "/dev/null", "--write-out", "%{http_code}",
                "-X", method, "-H", f"Host: {host}",
                f"http://127.0.0.1/roadmap/mfa/{route}",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        if result.stdout.strip() not in ("302", "400"):
            raise RuntimeError(
                f"Apache route smoke check for {method} {route} returned HTTP "
                f"{result.stdout.strip()}, expected an application response (302 or 400)."
            )


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] not in ("uat", "prod") or sys.argv[2] not in ("prepare", "verify"):
        print("Usage: normalize-apache-routes.py uat|prod prepare|verify", file=sys.stderr)
        return 2

    environment, mode = sys.argv[1:]
    host = "uat.roadmappartners.net" if environment == "uat" else "roadmappartners.net"

    # Read and validate both files before any write. PROD has historically had
    # duplicate allowlist blocks in its SSL vhost; normalize every occurrence.
    prepared = [(path, *prepare(path)) for path in PATHS]
    changed = [(path, old, new) for path, old, new in prepared if old != new]
    if mode == "verify" and changed:
        names = ", ".join(path.name for path, _, _ in changed)
        raise RuntimeError(f"Apache route policy needs reconciliation in {names}; run prepare first.")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_dir = Path("/var/backups/roadmap-apache-routes") / stamp
    backups: list[tuple[Path, Path]] = []
    try:
        for path, old, new in changed:
            backup_dir.mkdir(parents=True, exist_ok=True)
            backup = backup_dir / path.name
            shutil.copy2(path, backup)
            backups.append((path, backup))
            atomic_write(path, new)

        subprocess.run(["apache2ctl", "configtest"], check=True, capture_output=True, text=True)
        if changed:
            subprocess.run(["systemctl", "reload", "apache2"], check=True)
        if mode == "verify":
            run_smoke_checks(host)
    except Exception:
        for path, backup in backups:
            shutil.copy2(backup, path)
        subprocess.run(["apache2ctl", "configtest"], check=False)
        if backups:
            subprocess.run(["systemctl", "reload", "apache2"], check=False)
        raise

    action = "prepared" if mode == "prepare" else "verified"
    print(f"Apache route policy {action} for {host}; changed {len(changed)} vhost file(s).")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
