"""Audio analysis — BPM, key detection, beat grid."""
import librosa
import numpy as np


KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# Camelot wheel for harmonic mixing compatibility
CAMELOT = {
    'C': '8B', 'C#': '3B', 'D': '10B', 'D#': '5B', 'E': '12B', 'F': '7B',
    'F#': '2B', 'G': '9B', 'G#': '4B', 'A': '11B', 'A#': '6B', 'B': '1B',
}


def analyze_track(audio_path: str) -> dict:
    """Analyze a track for BPM, key, duration, and energy."""
    y, sr = librosa.load(audio_path, sr=22050, mono=True)

    # BPM
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.round(tempo, 1)) if np.isscalar(tempo) else float(np.round(tempo[0], 1))
    beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

    # Key via chroma
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_idx = int(np.argmax(np.mean(chroma, axis=1)))
    key = KEY_NAMES[key_idx]
    camelot = CAMELOT.get(key, "?")

    # Duration
    duration = float(librosa.get_duration(y=y, sr=sr))

    # RMS energy (average loudness)
    rms = librosa.feature.rms(y=y)[0]
    energy = float(np.mean(rms))

    return {
        "bpm": bpm,
        "key": key,
        "camelot": camelot,
        "duration_sec": round(duration, 2),
        "beat_count": len(beat_times),
        "beat_times": beat_times[:32],
        "energy": round(energy, 4),
    }


def are_compatible(analysis_a: dict, analysis_b: dict) -> dict:
    """Check if two tracks are compatible for mixing."""
    bpm_diff = abs(analysis_a["bpm"] - analysis_b["bpm"])
    same_key = analysis_a["key"] == analysis_b["key"]
    bpm_close = bpm_diff <= 8  # within 8 BPM is mixable

    return {
        "bpm_diff": round(bpm_diff, 1),
        "bpm_compatible": bpm_close,
        "same_key": same_key,
        "camelot_a": analysis_a["camelot"],
        "camelot_b": analysis_b["camelot"],
        "recommendation": "great match" if (bpm_close and same_key) else
                          "good match" if bpm_close else
                          "tempo mismatch — will time-stretch",
    }
