"""Stem separation using Demucs."""
import subprocess
import os
from pathlib import Path


def separate_stems(audio_path: str, output_dir: str, two_stems: bool = True) -> dict:
    """
    Separate an audio file into stems using Demucs.
    Returns dict of stem paths: {vocals, no_vocals} or {vocals, drums, bass, other}
    """
    os.makedirs(output_dir, exist_ok=True)

    cmd = [
        "python3", "-m", "demucs",
        "--out", output_dir,
        "--mp3",
    ]
    if two_stems:
        cmd.extend(["--two-stems", "vocals"])
    cmd.append(audio_path)

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(f"Demucs failed: {result.stderr[:500]}")

    # Find output stems
    track_name = Path(audio_path).stem
    stems_dir = Path(output_dir) / "htdemucs" / track_name

    stems = {}
    if two_stems:
        stem_names = ["vocals", "no_vocals"]
    else:
        stem_names = ["vocals", "drums", "bass", "other"]

    for stem_name in stem_names:
        for ext in [".mp3", ".wav"]:
            p = stems_dir / f"{stem_name}{ext}"
            if p.exists():
                stems[stem_name] = str(p)
                break

    if not stems:
        # List what's actually there for debugging
        found = list(stems_dir.glob("*")) if stems_dir.exists() else []
        raise RuntimeError(f"No stems found in {stems_dir}. Found: {found}")

    return stems
