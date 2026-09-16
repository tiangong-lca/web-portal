#!/usr/bin/env python3
"""Verify the vendored shared SEO checker against its manifest.

The checker is a generated consumption asset: `tiangong-lca/workspace` is the
authoritative source and updates only ever arrive through its export script.
This check proves the committed bytes match the recorded digest using the
standard library, so a public CI job with no access to the private workspace
repository can still fail closed on a hand-edited or half-copied snapshot.

It is not origin proof on its own: only the private integration job, which
hashes the Git blob at the recorded commit, can attest provenance. A mismatch
here means the file must be re-exported, never edited in place.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import re
import sys

VENDOR_DIR = pathlib.Path(__file__).resolve().parent / "vendor" / "workspace-seo"
EXPECTED_REPOSITORY = "tiangong-lca/workspace"
EXPECTED_SOURCE_PATH = "scripts/seo/check.py"


def main() -> int:
    problems: list[str] = []
    manifest_path = VENDOR_DIR / "manifest.json"
    checker_path = VENDOR_DIR / "check.py"
    if not manifest_path.is_file():
        print(f"missing vendored manifest: {manifest_path}", file=sys.stderr)
        return 1
    if not checker_path.is_file():
        print(f"missing vendored checker: {checker_path}", file=sys.stderr)
        return 1

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != 1:
        problems.append(f"manifest schema must be 1; found {manifest.get('schema')!r}")
    if manifest.get("generated") is not True:
        problems.append("manifest must mark the snapshot as generated")
    if manifest.get("source_repository") != EXPECTED_REPOSITORY:
        problems.append(
            f"manifest source_repository must be {EXPECTED_REPOSITORY}; "
            f"found {manifest.get('source_repository')!r}"
        )
    if manifest.get("source_path") != EXPECTED_SOURCE_PATH:
        problems.append(
            f"manifest source_path must be {EXPECTED_SOURCE_PATH}; "
            f"found {manifest.get('source_path')!r}"
        )
    source_commit = manifest.get("source_commit")
    if not isinstance(source_commit, str) or not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        problems.append(f"manifest source_commit must be a 40-character hex commit; found {source_commit!r}")
    expected = manifest.get("sha256")
    if not isinstance(expected, str) or not re.fullmatch(r"[0-9a-f]{64}", expected):
        problems.append(f"manifest sha256 must be a 64-character hex digest; found {expected!r}")

    digest = hashlib.sha256(checker_path.read_bytes()).hexdigest()
    if expected != digest:
        problems.append(f"vendored check.py sha256 {digest} does not match the manifest {expected}")

    if problems:
        print("vendored shared SEO checker FAILED verification:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        print("re-export it from the workspace repository; never edit it in place.", file=sys.stderr)
        return 1

    print(
        "vendored shared SEO checker OK: "
        f"sha256={digest} source={EXPECTED_REPOSITORY}@{source_commit} ({EXPECTED_SOURCE_PATH})"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
