import re
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SENSITIVE_NAME = re.compile(r"(?:KEY|TOKEN|PASSWORD|SECRET)$", re.IGNORECASE)
PLACEHOLDER_VALUE = re.compile(
    r"^(?:your[-_ ]|replace[-_ ]|example[-_ ]|placeholder|change[-_ ]?me|<|\$\{)",
    re.IGNORECASE,
)
EMBEDDED_POSTGRES_CREDENTIAL = re.compile(
    r"postgres(?:ql)?://[^\s:/]+:[^\s@]+@", re.IGNORECASE
)
SECRET_DEFAULT = re.compile(
    r"os\.(?:environ\.get|getenv)\(\s*['\"][A-Z0-9_]*(?:KEY|TOKEN|PASSWORD|SECRET)['\"]"
    r"\s*,\s*['\"][^'\"]+['\"]",
)


def tracked_files() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
    )
    return [REPO_ROOT / item.decode() for item in result.stdout.split(b"\0") if item]


def text_files() -> list[tuple[Path, str]]:
    rows: list[tuple[Path, str]] = []
    for path in tracked_files():
        if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".apk"}:
            continue
        try:
            rows.append((path, path.read_text(encoding="utf-8")))
        except UnicodeDecodeError:
            continue
    return rows


def test_no_embedded_database_credentials_or_secret_defaults() -> None:
    findings: list[str] = []
    for path, content in text_files():
        if EMBEDDED_POSTGRES_CREDENTIAL.search(content) or SECRET_DEFAULT.search(content):
            findings.append(str(path.relative_to(REPO_ROOT)))
    assert findings == []


def test_sensitive_example_values_are_placeholders() -> None:
    findings: list[str] = []
    for path in tracked_files():
        if path.name != ".env.example":
            continue
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if "=" not in line or line.lstrip().startswith("#"):
                continue
            name, value = (part.strip() for part in line.split("=", 1))
            if SENSITIVE_NAME.search(name) and value and not PLACEHOLDER_VALUE.search(value):
                findings.append(f"{path.relative_to(REPO_ROOT)}:{line_number}:{name}")
    assert findings == []


def test_no_tracked_runtime_env_files() -> None:
    forbidden = [
        str(path.relative_to(REPO_ROOT))
        for path in tracked_files()
        if path.name.startswith(".env") and path.name != ".env.example"
    ]
    assert forbidden == []
