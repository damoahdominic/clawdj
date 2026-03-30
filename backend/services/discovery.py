"""Music discovery — find and download tracks via yt-dlp."""
import subprocess
import os
import json
from pathlib import Path


DOWNLOAD_DIR = Path("downloads")
DOWNLOAD_DIR.mkdir(exist_ok=True)


def search_and_download(query: str, output_dir: str = None, max_duration: int = 600, use_cookies: str = None) -> str:
    """
    Search YouTube for a song and download audio.
    Returns path to downloaded audio file.
    
    Args:
        query: Search query or URL
        output_dir: Directory to save the file
        max_duration: Max track duration in seconds
        use_cookies: Path to cookies.txt file, or browser name for --cookies-from-browser
    """
    out_dir = Path(output_dir) if output_dir else DOWNLOAD_DIR
    out_dir.mkdir(exist_ok=True)
    out_template = str(out_dir / "%(title)s.%(ext)s")

    # Check if query is a URL or search term
    is_url = query.startswith(("http://", "https://"))

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
    ]

    # Handle cookies for YouTube bot detection
    if use_cookies:
        if os.path.isfile(use_cookies):
            cmd.extend(["--cookies", use_cookies])
        else:
            cmd.extend(["--cookies-from-browser", use_cookies])

    if is_url:
        cmd.append(query)
    else:
        cmd.append(f"ytsearch1:{query}")

    # Add deno path if available
    env = os.environ.copy()
    deno_path = os.path.expanduser("~/.deno/bin")
    if os.path.isdir(deno_path):
        env["PATH"] = f"{deno_path}:{env.get(PATH, )}"

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, env=env)
    
    if result.returncode != 0:
        stderr = result.stderr
        # Check for bot detection
        if "Sign in to confirm" in stderr or "bot" in stderr.lower():
            raise RuntimeError(
                "YouTube bot detection triggered. Options:\n"
                "1. Export cookies: yt-dlp --cookies-from-browser chrome --cookies cookies.txt\n"
                "2. Use a cookies.txt file: clawdj mix --cookies path/to/cookies.txt\n"  
                "3. Provide a direct URL instead of search query\n"
                "4. Use a different source (SoundCloud, direct MP3 URL)"
            )
        raise RuntimeError(f"yt-dlp failed: {stderr[:300]}")

    filepath = result.stdout.strip().split("\\n")[-1]
    if not filepath or not os.path.exists(filepath):
        raise RuntimeError(f"Download failed, no file at: {filepath}")

    return filepath


def search_tracks(query: str, limit: int = 5) -> list:
    """Search YouTube and return metadata without downloading."""
    env = os.environ.copy()
    deno_path = os.path.expanduser("~/.deno/bin")
    if os.path.isdir(deno_path):
        env["PATH"] = f"{deno_path}:{env.get(PATH, )}"

    cmd = [
        "yt-dlp",
        "--dump-json",
        "--flat-playlist",
        f"ytsearch{limit}:{query}",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, env=env)
    if result.returncode != 0:
        return []

    tracks = []
    for line in result.stdout.strip().split("\\n"):
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


def download_from_url(url: str, output_dir: str = None) -> str:
    """Download audio from a direct URL (SoundCloud, direct MP3, etc.)."""
    out_dir = Path(output_dir) if output_dir else DOWNLOAD_DIR
    out_dir.mkdir(exist_ok=True)
    out_template = str(out_dir / "%(title)s.%(ext)s")

    env = os.environ.copy()
    deno_path = os.path.expanduser("~/.deno/bin")
    if os.path.isdir(deno_path):
        env["PATH"] = f"{deno_path}:{env.get(PATH, )}"

    cmd = [
        "yt-dlp",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--output", out_template,
        "--print", "after_move:filepath",
        url,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120, env=env)
    if result.returncode != 0:
        raise RuntimeError(f"Download failed: {result.stderr[:300]}")

    filepath = result.stdout.strip().split("\\n")[-1]
    if not filepath or not os.path.exists(filepath):
        raise RuntimeError(f"Download failed, no output file")

    return filepath
