"""Music discovery — find tracks via yt-dlp."""
import subprocess
import os
import json
from pathlib import Path


DOWNLOAD_DIR = Path("downloads")
DOWNLOAD_DIR.mkdir(exist_ok=True)


def search_and_download(query: str, output_dir: str = None, max_duration: int = 600) -> str:
    """
    Search YouTube for a song and download audio.
    Returns path to downloaded audio file.
    """
    out_dir = Path(output_dir) if output_dir else DOWNLOAD_DIR
    out_dir.mkdir(exist_ok=True)
    out_template = str(out_dir / "%(title)s.%(ext)s")

    cmd = [
        "yt-dlp",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--max-downloads", "1",
        "--match-filter", f"duration<={max_duration}",
        "--output", out_template,
        "--print", "after_move:filepath",
        "--no-playlist",
        f"ytsearch1:{query}",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp failed: {result.stderr[:300]}")

    filepath = result.stdout.strip().split("\n")[-1]
    if not filepath or not os.path.exists(filepath):
        raise RuntimeError(f"Download failed, no file at: {filepath}")

    return filepath


def search_tracks(query: str, limit: int = 5) -> list:
    """Search YouTube and return metadata without downloading."""
    cmd = [
        "yt-dlp",
        "--dump-json",
        "--flat-playlist",
        f"ytsearch{limit}:{query}",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        return []

    tracks = []
    for line in result.stdout.strip().split("\n"):
        if not line.strip():
            continue
        try:
            data = json.loads(line)
            tracks.append({
                "title": data.get("title", "Unknown"),
                "url": data.get("url") or data.get("webpage_url", ""),
                "duration": data.get("duration"),
                "uploader": data.get("uploader", ""),
            })
        except json.JSONDecodeError:
            continue

    return tracks
