#!/usr/bin/env python3
"""Extract only JPEG photos from the itinerary ZIP, skipping documents and PSDs."""

import json
import os
import shutil
import stat
import sys
import zipfile
from pathlib import Path


MAX_IMAGES = 1000
MAX_IMAGE_SIZE = 40 * 1024 * 1024
MAX_TOTAL_IMAGE_SIZE = 1024 * 1024 * 1024
IMAGE_EXTENSIONS = {".jpg", ".jpeg"}


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_itinerary_images.py <zip_path> <output_directory>")

    archive_path = Path(sys.argv[1]).resolve()
    output_directory = Path(sys.argv[2]).resolve()
    output_directory.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(archive_path) as archive:
        images = [
            item for item in archive.infolist()
            if not item.is_dir() and Path(item.filename).suffix.lower() in IMAGE_EXTENSIONS
        ]
        if len(images) > MAX_IMAGES:
            raise ValueError(f"Image archive contains {len(images)} photos; limit is {MAX_IMAGES}.")

        total_size = sum(item.file_size for item in images)
        if total_size > MAX_TOTAL_IMAGE_SIZE:
            raise ValueError("The uncompressed photo collection exceeds the 1 GB import limit.")

        manifest = []
        for index, item in enumerate(images):
            if item.file_size <= 0 or item.file_size > MAX_IMAGE_SIZE:
                continue
            unix_mode = item.external_attr >> 16
            if stat.S_ISLNK(unix_mode):
                continue

            filename = f"{index:04d}{Path(item.filename).suffix.lower()}"
            output_path = output_directory / filename
            with archive.open(item) as source, output_path.open("wb") as target:
                shutil.copyfileobj(source, target, length=1024 * 1024)
            manifest.append({
                "filename": filename,
                "sourcePath": item.filename.replace("\\", "/"),
                "sourceName": Path(item.filename).name,
            })

    manifest_path = output_directory / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    print(f"Extracted {len(manifest)} JPEG photos; skipped non-image archive entries.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"Image archive import failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
