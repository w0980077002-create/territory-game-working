#!/usr/bin/env python3
"""Verify the pre-Claude handoff without importing any dependency or touching production."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
ERRORS: list[str] = []
CHARACTER_ROOT = ROOT / "assets/characters/v2-source/TERRITORY_ART_PACK_2026-11-11_v2"
REFERENCE = ROOT / "assets/references/main-screen-100-percent.png"
EXPECTED_IMAGE_GIT_BLOB = "0d114d23277c01a5cde32ff7a97a5df2ecd04117"
ROLE_COUNTS = {"heroes": 3, "companions": 2, "enemies": 8, "minibosses": 3, "bosses": 4, "special": 1}


def require(condition: bool, message: str) -> None:
    if not condition:
        ERRORS.append(message)


def inspect_image() -> None:
    require(REFERENCE.is_file(), "missing canonical owner-approved screenshot")
    if not REFERENCE.is_file():
        return
    payload = REFERENCE.read_bytes()
    require(payload[:8] == b"\x89PNG\r\n\x1a\n", "the 100% screenshot is not a real PNG")
    if len(payload) < 24:
        ERRORS.append("screenshot is too short to contain IHDR")
        return
    width, height = struct.unpack(">II", payload[16:24])
    require((width, height) == (864, 1536), f"reference size changed: {width}x{height}")
    blob_sha = hashlib.sha1(f"blob {len(payload)}\0".encode() + payload).hexdigest()
    require(blob_sha == EXPECTED_IMAGE_GIT_BLOB, "owner 100% screenshot content differs from approved Git blob")
    print(f"REFERENCE: {width}x{height}, {len(payload)} bytes, blob {blob_sha[:12]}")


def inspect_characters() -> None:
    file = CHARACTER_ROOT / "manifest.json"
    require(file.is_file(), "the 21-character source manifest is missing")
    if not file.is_file():
        return
    manifest = json.loads(file.read_text(encoding="utf-8"))
    characters = manifest["files"]
    require(len(characters) == 21, f"expected 21 characters, got {len(characters)}")
    ids: set[str] = set()
    role_counts: dict[str, int] = {}
    for character in characters:
        ident = str(character["id"])
        role = str(character["category"])
        require(ident not in ids, f"duplicate character id: {ident}")
        ids.add(ident)
        role_counts[role] = role_counts.get(role, 0) + 1
        master = CHARACTER_ROOT / character["master"]
        still = CHARACTER_ROOT / character["still_preview"]
        require(master.is_file(), f"missing PNG {master.relative_to(ROOT)}")
        require(still.is_file(), f"missing WebP {still.relative_to(ROOT)}")
        if master.is_file():
            data = master.read_bytes()
            require(data.startswith(b"\x89PNG\r\n\x1a\n"), f"not a PNG: {ident}")
            require(hashlib.sha256(data).hexdigest() == character["sha256"], f"bad SHA256: {ident}")
        if still.is_file():
            data = still.read_bytes()
            require(data[:4] == b"RIFF" and data[8:12] == b"WEBP", f"not a WebP: {ident}")
    require(role_counts == ROLE_COUNTS, f"character role counts changed: {role_counts}")
    originals = [p for p in (CHARACTER_ROOT / "03_original_owner_references").rglob("*") if p.is_file()]
    require(len(originals) == 10, f"expected 10 owner originals, got {len(originals)}")
    report = ROOT / "assets/characters/v2-source/EXTRACTION_REPORT.json"
    require(report.is_file(), "missing extraction report")
    if report.is_file():
        obj = json.loads(report.read_text(encoding="utf-8"))
        require(obj.get("characters") == 21, "extraction report is missing 21 characters")
        require(obj.get("owner_originals") == 10, "extraction report is missing 10 originals")
        require(obj.get("source_zip_sha256") == "d8bd7c242accd3396232a53cae7fe47478c4b6aae558b95dbad0c68edf5c1fa1", "source archive checksum changed")
    print(f"ART: {len(characters)} character masters, {len(originals)} originals, roles={role_counts}")


def inspect_docs() -> None:
    docs = list((ROOT / "docs").glob("*.md")) + [ROOT / "README.md", ROOT / "CLAUDE.md", ROOT / "PROJECT_BRIEF.md"]
    links = 0
    for doc in docs:
        text = doc.read_text(encoding="utf-8")
        for link in re.findall(r"\]\(([^)\s]+)\)", text):
            if link.startswith(("http:", "https:", "#", "mailto:", "data:")):
                continue
            local = link.split("#", 1)[0].split("?", 1)[0]
            target = (doc.parent / local).resolve()
            require(target.is_relative_to(ROOT), f"link escapes repository: {doc.relative_to(ROOT)} -> {link}")
            if target.is_relative_to(ROOT):
                require(target.exists(), f"broken link: {doc.relative_to(ROOT)} -> {link}")
            links += 1
    checklist = ROOT / "docs/LOOTBORN_FEATURE_CHECKLIST_20261112_RU.md"
    require(checklist.is_file(), "missing full scope checklist")
    if checklist.is_file():
        text = checklist.read_text(encoding="utf-8")
        ids = re.findall(r"^\| ([A-Z]\d{2}) \|", text, flags=re.MULTILINE)
        require(len(ids) >= 201, f"full feature scope shrank to {len(ids)} rows")
        require(len(ids) == len(set(ids)), "duplicate feature checklist IDs")
        print(f"SCOPE: {len(ids)} numbered requirements")
    guide = (ROOT / "PROJECT_BRIEF.md").read_text(encoding="utf-8")
    require("12 основных" in guide and "Крылья" in guide, "owner's 12+1 equipment decision missing")
    require("100%" in guide, "owner's visual rule missing")
    print(f"DOCS: {len(docs)} Markdown files, {links} internal links resolve")


inspect_image()
inspect_characters()
inspect_docs()
if ERRORS:
    print("\nPRE-FLIGHT FAILED:")
    for err in ERRORS:
        print(f" - {err}")
    sys.exit(1)
print("\nPRE-FLIGHT PASSED: docs, approved image, source art and full scope intact")
