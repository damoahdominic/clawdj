"""Mashup mixer — combine stems from two tracks."""
from pydub import AudioSegment
import os


def _load_audio(path: str) -> AudioSegment:
    return AudioSegment.from_file(path)


def _time_stretch(audio: AudioSegment, original_bpm: float, target_bpm: float) -> AudioSegment:
    """Time-stretch via frame rate manipulation. Good enough for v1."""
    if abs(original_bpm - target_bpm) < 1.0:
        return audio
    ratio = target_bpm / original_bpm
    new_frame_rate = int(audio.frame_rate * ratio)
    stretched = audio._spawn(audio.raw_data, overrides={"frame_rate": new_frame_rate})
    return stretched.set_frame_rate(audio.frame_rate)


def _crossfade_segments(seg_a: AudioSegment, seg_b: AudioSegment, fade_ms: int = 3000) -> AudioSegment:
    """Crossfade two audio segments."""
    fade_ms = min(fade_ms, len(seg_a), len(seg_b))
    return seg_a.append(seg_b, crossfade=fade_ms)


def create_mashup(
    stems_a: dict,
    stems_b: dict,
    analysis_a: dict,
    analysis_b: dict,
    output_path: str,
    vocals_from: str = "a",
    vocal_boost_db: float = 2.0,
    inst_reduce_db: float = 2.0,
) -> str:
    """
    Create a mashup: vocals from one track over instrumental of the other.
    """
    if vocals_from == "a":
        vocals = _load_audio(stems_a["vocals"])
        inst_key = "no_vocals" if "no_vocals" in stems_b else "other"
        instrumental = _load_audio(stems_b.get(inst_key, list(stems_b.values())[0]))
        vocal_bpm, inst_bpm = analysis_a["bpm"], analysis_b["bpm"]
    else:
        vocals = _load_audio(stems_b["vocals"])
        inst_key = "no_vocals" if "no_vocals" in stems_a else "other"
        instrumental = _load_audio(stems_a.get(inst_key, list(stems_a.values())[0]))
        vocal_bpm, inst_bpm = analysis_b["bpm"], analysis_a["bpm"]

    # Time-stretch vocals to match instrumental BPM
    vocals = _time_stretch(vocals, vocal_bpm, inst_bpm)

    # Trim to shortest
    min_len = min(len(vocals), len(instrumental))
    vocals = vocals[:min_len]
    instrumental = instrumental[:min_len]

    # Level adjustment
    vocals = vocals + vocal_boost_db
    instrumental = instrumental - inst_reduce_db

    mashup = instrumental.overlay(vocals)

    # Normalize to -14 LUFS (approx)
    target_dBFS = -14.0
    change = target_dBFS - mashup.dBFS
    mashup = mashup.apply_gain(change)

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    mashup.export(output_path, format="mp3", bitrate="320k")
    return output_path
