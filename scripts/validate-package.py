#!/usr/bin/env python3
"""
CLI validation tool for DocuStratum portable packages.
Performs schema, referential integrity, and sha256 checksum verification.
"""
from __future__ import annotations

import sys
import os
import json
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from service.packager.validator import validate_package_zip


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/validate-package.py <path-to-rag-package.zip>")
        return 1

    zip_path = Path(sys.argv[1])
    if not zip_path.is_file():
        print(f"Error: File not found: {zip_path}", file=sys.stderr)
        return 1

    print(f"[*] Validating DocuStratum package: {zip_path.name} ({zip_path.stat().st_size} bytes)...")
    with open(zip_path, "rb") as f:
        zip_bytes = f.read()

    report = validate_package_zip(zip_bytes)
    
    print("\n--- Validation Report ---")
    print(f"Valid: {report.valid}")
    print(f"Format Version: {report.formatVersion or 'N/A'}")
    print(f"Total Files: {report.totalFiles}")
    print(f"Total Blocks: {report.totalBlocks}")
    print(f"Total Chunks: {report.totalChunks}")
    print(f"Total Questions: {report.totalQuestions}")
    print(f"Total Answers: {report.totalAnswers}")

    errors = [i for i in report.issues if i.severity == "error"]
    warnings = [i for i in report.issues if i.severity == "warning"]

    if errors:
        print(f"\n❌ Errors ({len(errors)}):")
        for err in errors:
            print(f"  - [{err.code}] {err.message} (file: {err.file or 'global'})")

    if warnings:
        print(f"\n⚠️ Warnings ({len(warnings)}):")
        for warn in warnings:
            print(f"  - [{warn.code}] {warn.message} (file: {warn.file or 'global'})")

    if not report.valid:
        print("\n❌ RESULT: Package validation FAILED.")
        return 1

    print("\n✅ RESULT: Package is 100% valid and production-ready.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
