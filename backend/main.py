"""ClawDJ Web API — Phase 2."""
import os
import sys
import uuid
import json
import asyncio
import subprocess
import re
import shlex
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, WebSocket, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.insert(0, os.path.dirname(__file__))
from services.separator import separate_stems
from services.analyzer import analyze_track, are_compatible
from services.mixer import create_mashup

app = FastAPI(title="ClawDJ", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

HOME = Path.home()
MUSIC_DIR = HOME / "music"
MASHUP_DIR = MUSIC_DIR / "mashups"
STEMS_DIR = Path("/tmp/clawdj_stems")
LIBRARY_FILE = HOME / ".clawdj" / "library.json"
ANYSONG_BIN = HOME / "Workspace" / "anysong" / "anysong"
BACKEND_DIR = Path(__file__).parent
VENV_PYTHON = HOME / "Workspace" / "clawdj" / "venv" / "bin" / "python3"
COOKIES_FILE = HOME / ".anysong" / "cookies.txt"
RADIO_MUSIC_DIR = HOME / "music" / "radio"

SESSION_FILE = HOME / ".clawdj" / "session.json"

for d in [MUSIC_DIR, MASHUP_DIR, STEMS_DIR, RADIO_MUSIC_DIR]:
    d.mkdir(parents=True, exist_ok=True)
(HOME / ".clawdj").mkdir(parents=True, exist_ok=True)

jobs: dict = {}

# Track download state — prevents duplicate concurrent downloads.
_download_locks: dict[str, asyncio.Lock] = {}
_download_cache: dict[str, str] = {}  # "Artist - Title" → filename


class MixRequest(BaseModel):
    track_a: str
    track_b: str
    vocals_from: str = "a"


class SessionData(BaseModel):
    vibe_query: str = ""
    playlist: list = []
    current_index: int = -1
    playback_position: float = 0.0


# --- Health ---

@app.get("/health")
def health():
    return {"status": "ok", "version": "0.2.0"}


# --- Session persistence ---

@app.get("/api/session")
def get_session():
    """Return the saved DJ session (playlist, current track, position)."""
    if SESSION_FILE.exists():
        try:
            return json.loads(SESSION_FILE.read_text())
        except Exception:
            pass
    return {}


@app.post("/api/session")
def save_session(data: SessionData):
    """Save the current DJ session state."""
    try:
        SESSION_FILE.write_text(data.model_dump_json())
    except Exception:
        pass
    return {"ok": True}


# --- Search (Deezer) ---

@app.get("/api/search")
async def api_search(q: str, limit: int = 8):
    """Search Deezer for tracks."""
    import urllib.request
    import urllib.parse
    url = f"https://api.deezer.com/search?q={urllib.parse.quote(q)}&limit={limit}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "clawdj/0.2"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            return {"results": data.get("data", [])}
    except Exception as e:
        return {"results": [], "error": str(e)}


# --- Library ---

@app.get("/api/library")
def get_library():
    """Return the local library."""
    if LIBRARY_FILE.exists():
        data = json.loads(LIBRARY_FILE.read_text())
        return {"tracks": data.get("tracks", [])}
    return {"tracks": []}


# --- Mix by name ---

@app.post("/api/mix")
async def start_mix(req: MixRequest):
    """Start a mix job. Tracks can be file paths or search queries."""
    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {
        "status": "queued",
        "track_a": req.track_a,
        "track_b": req.track_b,
        "vocals_from": req.vocals_from,
        "messages": [],
    }
    return {"job_id": job_id}


@app.websocket("/ws/mix/{job_id}")
async def mix_progress(websocket: WebSocket, job_id: str):
    await websocket.accept()
    if job_id not in jobs:
        await websocket.send_json({"error": "job not found"})
        await websocket.close()
        return

    job = jobs[job_id]
    track_a_query = job["track_a"]
    track_b_query = job["track_b"]
    vocals_from = job["vocals_from"]

    try:
        # Step 1: Resolve tracks (download if needed)
        await websocket.send_json({"step": "downloading", "message": "Resolving Track A..."})
        path_a = await asyncio.to_thread(resolve_track, track_a_query)
        if not path_a:
            await websocket.send_json({"error": f"Could not find: {track_a_query}"})
            await websocket.close()
            return

        await websocket.send_json({"step": "downloading", "message": "Resolving Track B..."})
        path_b = await asyncio.to_thread(resolve_track, track_b_query)
        if not path_b:
            await websocket.send_json({"error": f"Could not find: {track_b_query}"})
            await websocket.close()
            return

        # Step 2: Analyze
        await websocket.send_json({"step": "analyzing", "message": "Analyzing tracks..."})
        analysis_a = await asyncio.to_thread(analyze_track, path_a)
        analysis_b = await asyncio.to_thread(analyze_track, path_b)
        compat = are_compatible(analysis_a, analysis_b)
        await websocket.send_json({
            "step": "analyzing", "progress": 100,
            "analysis": {"a": analysis_a, "b": analysis_b, "compatibility": compat}
        })

        # Step 3: Separate stems
        await websocket.send_json({"step": "separating", "message": "Separating stems (Track A)..."})
        stems_a = await asyncio.to_thread(separate_stems, path_a, str(STEMS_DIR / job_id / "a"))

        await websocket.send_json({"step": "separating", "message": "Separating stems (Track B)..."})
        stems_b = await asyncio.to_thread(separate_stems, path_b, str(STEMS_DIR / job_id / "b"))

        # Step 4: Mix
        await websocket.send_json({"step": "mixing", "message": "Creating mashup..."})
        output_path = str(MASHUP_DIR / f"clawdj_{job_id}.mp3")
        await asyncio.to_thread(
            create_mashup, stems_a, stems_b, analysis_a, analysis_b, output_path,
            vocals_from=vocals_from
        )

        jobs[job_id]["status"] = "complete"
        jobs[job_id]["output"] = output_path

        # Add tracks to library
        for path, analysis in [(path_a, analysis_a), (path_b, analysis_b)]:
            add_to_library(path, analysis)

        await websocket.send_json({
            "step": "complete", "progress": 100,
            "download": f"/api/download/{job_id}",
            "analysis": {"a": analysis_a, "b": analysis_b, "compatibility": compat},
        })

    except Exception as e:
        await websocket.send_json({"error": str(e)})
    finally:
        await websocket.close()


# --- Upload-based mix (legacy) ---

@app.post("/api/upload")
async def upload_tracks(track_a: UploadFile = File(...), track_b: UploadFile = File(...)):
    job_id = str(uuid.uuid4())[:8]
    job_dir = MUSIC_DIR / "uploads" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    paths = {}
    for name, f in [("track_a", track_a), ("track_b", track_b)]:
        ext = Path(f.filename).suffix or ".mp3"
        p = job_dir / f"{name}{ext}"
        with open(p, "wb") as out:
            out.write(await f.read())
        paths[name] = str(p)

    jobs[job_id] = {"status": "uploaded", "paths": paths}
    return {"job_id": job_id, "status": "uploaded"}


@app.websocket("/ws/jobs/{job_id}")
async def job_progress(websocket: WebSocket, job_id: str):
    """Legacy upload-based mix WebSocket."""
    await websocket.accept()
    if job_id not in jobs or "paths" not in jobs[job_id]:
        await websocket.send_json({"error": "job not found"})
        await websocket.close()
        return

    job = jobs[job_id]
    paths = job["paths"]

    try:
        await websocket.send_json({"step": "separating", "track": "A", "progress": 0})
        stems_a = await asyncio.to_thread(separate_stems, paths["track_a"], str(STEMS_DIR / job_id / "a"))
        await websocket.send_json({"step": "separating", "track": "A", "progress": 100})

        await websocket.send_json({"step": "separating", "track": "B", "progress": 0})
        stems_b = await asyncio.to_thread(separate_stems, paths["track_b"], str(STEMS_DIR / job_id / "b"))
        await websocket.send_json({"step": "separating", "track": "B", "progress": 100})

        await websocket.send_json({"step": "analyzing", "progress": 0})
        analysis_a = await asyncio.to_thread(analyze_track, paths["track_a"])
        analysis_b = await asyncio.to_thread(analyze_track, paths["track_b"])
        compat = are_compatible(analysis_a, analysis_b)
        await websocket.send_json({
            "step": "analyzing", "progress": 100,
            "analysis": {"a": analysis_a, "b": analysis_b, "compatibility": compat}
        })

        await websocket.send_json({"step": "mixing", "progress": 0})
        output_path = str(MASHUP_DIR / f"clawdj_{job_id}.mp3")
        await asyncio.to_thread(create_mashup, stems_a, stems_b, analysis_a, analysis_b, output_path)
        await websocket.send_json({"step": "complete", "progress": 100, "download": f"/api/download/{job_id}"})

        jobs[job_id]["status"] = "complete"
        jobs[job_id]["output"] = output_path

    except Exception as e:
        await websocket.send_json({"step": "error", "message": str(e)})
    finally:
        await websocket.close()


# --- Download ---

@app.get("/api/download/{job_id}")
def download_mashup(job_id: str):
    if job_id not in jobs or jobs[job_id].get("status") != "complete":
        return JSONResponse({"error": "not ready"}, 404)
    return FileResponse(jobs[job_id]["output"], media_type="audio/mpeg", filename=f"clawdj_{job_id}.mp3")


# --- Helpers ---

def resolve_track(query: str) -> str:
    """Resolve a query to a local MP3 path. Downloads via anysong if needed."""
    # Already a file path
    if os.path.isfile(query):
        return query

    # Check music dir for partial match
    if MUSIC_DIR.exists():
        q = query.lower()
        for f in MUSIC_DIR.iterdir():
            if f.suffix == ".mp3" and q in f.name.lower():
                return str(f)

    # Download via anysong
    if ANYSONG_BIN.exists():
        before = set(MUSIC_DIR.glob("*.mp3"))
        try:
            subprocess.run(
                [str(ANYSONG_BIN), "download", query, "--dir", str(MUSIC_DIR)],
                timeout=120, capture_output=True
            )
        except subprocess.TimeoutExpired:
            pass

        after = set(MUSIC_DIR.glob("*.mp3"))
        new_files = after - before
        if new_files:
            return str(next(iter(new_files)))

        # Find most recent mp3
        mp3s = sorted(MUSIC_DIR.glob("*.mp3"), key=lambda p: p.stat().st_mtime, reverse=True)
        if mp3s:
            return str(mp3s[0])

    return ""


def add_to_library(path: str, analysis: dict):
    """Add a track to the library if not already there."""
    lib_dir = LIBRARY_FILE.parent
    lib_dir.mkdir(parents=True, exist_ok=True)

    lib = {"tracks": [], "updated": ""}
    if LIBRARY_FILE.exists():
        try:
            lib = json.loads(LIBRARY_FILE.read_text())
        except:
            pass

    basename = os.path.basename(path)
    for t in lib.get("tracks", []):
        if t.get("filename") == basename:
            return  # already in library

    name = basename.replace(".mp3", "")
    title, artist = name, "Unknown"
    if "_by_" in name:
        parts = name.split("_by_", 1)
        title = parts[0].replace("_", " ")
        artist = parts[1].replace("_", " ")

    import time
    track = {
        "id": str(int(time.time() * 1000)),
        "title": title,
        "artist": artist,
        "filename": basename,
        "path": path,
        "bpm": analysis.get("bpm", 0),
        "key": analysis.get("key", ""),
        "camelot": analysis.get("camelot", ""),
        "energy": analysis.get("energy", 0),
        "duration_sec": analysis.get("duration_sec", 0),
        "beat_count": analysis.get("beat_count", 0),
        "added_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    if "tracks" not in lib:
        lib["tracks"] = []
    lib["tracks"].append(track)
    lib["updated"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    LIBRARY_FILE.write_text(json.dumps(lib, indent=2))


# --- Vibe / Auto Mix ---

@app.get("/api/vibe")
async def vibe_search(q: str, limit: int = 6):
    """Search for tracks matching a vibe/genre description."""
    import urllib.request
    import urllib.parse
    import random

    tracks = []

    # Strategy 1: Search playlists matching the vibe, grab tracks from top result
    try:
        purl = f"https://api.deezer.com/search/playlist?q={urllib.parse.quote(q)}&limit=3"
        req = urllib.request.Request(purl, headers={"User-Agent": "clawdj/0.2"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            playlists = json.loads(resp.read().decode()).get("data", [])

        if playlists:
            best = max(playlists, key=lambda p: p.get("nb_tracks", 0))
            turl = f"https://api.deezer.com/playlist/{best['id']}/tracks?limit=50"
            req = urllib.request.Request(turl, headers={"User-Agent": "clawdj/0.2"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                playlist_tracks = json.loads(resp.read().decode()).get("data", [])

            random.shuffle(playlist_tracks)
            tracks = playlist_tracks[:limit]
    except Exception:
        pass

    # Strategy 2: Fall back to regular search
    if len(tracks) < 2:
        try:
            surl = f"https://api.deezer.com/search?q={urllib.parse.quote(q)}&limit={limit}"
            req = urllib.request.Request(surl, headers={"User-Agent": "clawdj/0.2"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                search_tracks = json.loads(resp.read().decode()).get("data", [])
            tracks = search_tracks[:limit]
        except Exception:
            pass

    return {"vibe": q, "tracks": tracks, "count": len(tracks)}


@app.post("/api/vibe-mix")
async def vibe_mix(q: str):
    """Auto-pick two compatible tracks from a vibe query and start a mix job."""
    import random

    vibe_result = await vibe_search(q, limit=20)
    tracks = vibe_result.get("tracks", [])

    if len(tracks) < 2:
        raise HTTPException(400, "Couldn't find enough tracks for that vibe")

    random.shuffle(tracks)
    track_a = tracks[0]
    track_b = None
    for t in tracks[1:]:
        if t.get("artist", {}).get("name") != track_a.get("artist", {}).get("name"):
            track_b = t
            break
    if not track_b:
        track_b = tracks[1]

    a_query = f"{track_a['artist']['name']} {track_a['title']}"
    b_query = f"{track_b['artist']['name']} {track_b['title']}"

    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {
        "status": "queued",
        "track_a": a_query,
        "track_b": b_query,
        "vocals_from": "a",
        "messages": [],
    }

    return {
        "job_id": job_id,
        "track_a": {"title": track_a["title"], "artist": track_a["artist"]["name"]},
        "track_b": {"title": track_b["title"], "artist": track_b["artist"]["name"]},
        "vibe": q,
    }


# --- Vibe Playlist (Radio Mode) ---

def _fetch_track_bpm(track_id: int) -> float:
    """Fetch BPM for a specific track from Deezer."""
    import urllib.request
    try:
        url = f"https://api.deezer.com/track/{track_id}"
        req = urllib.request.Request(url, headers={"User-Agent": "clawdj/0.2"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            return float(data.get("bpm", 0))
    except Exception:
        return 0


def _order_by_bpm(tracks: list, bpm_range: int = 15) -> list:
    """Order tracks by BPM for smooth energy flow.
    Groups tracks into BPM clusters and picks the largest cluster.
    Within the cluster, sorts by BPM for gradual progression.
    """
    if len(tracks) <= 2:
        return tracks

    # Find the most common BPM range
    bpms = [t.get("_bpm", 0) for t in tracks if t.get("_bpm", 0) > 0]
    if not bpms:
        return tracks

    # Find the BPM center that captures the most tracks
    best_center = bpms[0]
    best_count = 0
    for center in bpms:
        count = sum(1 for b in bpms if abs(b - center) <= bpm_range)
        if count > best_count:
            best_count = count
            best_center = center

    # Filter to tracks within range of best center, keep others as fallback
    in_range = [t for t in tracks if t.get("_bpm", 0) > 0 and abs(t["_bpm"] - best_center) <= bpm_range]
    out_range = [t for t in tracks if t not in in_range]

    # Sort in-range by BPM for smooth progression
    in_range.sort(key=lambda t: t.get("_bpm", 0))

    return in_range + out_range


# ── Full-length audio download pipeline ──────────────────────────────────────

def _sanitize_filename(s: str) -> str:
    """Make a string safe for use as a filename."""
    import re
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', s).strip()[:120]


def _find_cached(artist: str, title: str) -> str | None:
    """Check if we already have this track downloaded."""
    key = f"{artist} - {title}".lower()
    if key in _download_cache:
        path = RADIO_MUSIC_DIR / _download_cache[key]
        if path.exists() and path.stat().st_size > 10000:
            return _download_cache[key]
        del _download_cache[key]

    # Scan directory for partial match
    needle_a = artist.lower()
    needle_t = title.lower()
    for f in RADIO_MUSIC_DIR.glob("*.mp3"):
        name = f.stem.lower()
        if needle_a in name and needle_t in name:
            _download_cache[key] = f.name
            return f.name
        if needle_t in name and f.stat().st_size > 10000:
            _download_cache[key] = f.name
            return f.name
    return None


DOCKER_CONTAINER = "d1a110f0ee36"
DOCKER_YT_DLP = "/home/webuser/.local/bin/yt-dlp"
DOCKER_PROFILE = "Profile 1"
DOCKER_DL_DIR = "/tmp/clawdj_dl"


def _do_download(artist: str, title: str) -> str | None:
    """Download via yt-dlp running INSIDE the Docker container (where Chrome
    cookies are live and not exported/rotated). The file is then docker-cp'd
    to the host's RADIO_MUSIC_DIR."""
    # Anchor the search on the artist name so YouTube doesn't give us covers,
    # karaoke, lyric videos from unrelated uploaders, or the wrong song. We
    # also require the artist name to appear in the video title via yt-dlp's
    # match-filter; ytsearch5 gives us enough candidates to pick the first
    # that passes.
    query = f"{artist} - {title} official audio"
    safe = _sanitize_filename(f"{artist} - {title}")

    # Escape any single quotes in the artist so the shell + match-filter
    # stay well-formed.
    artist_safe = artist.replace("'", "").replace('"', "")

    docker_out = f"{DOCKER_DL_DIR}/{safe}.%(ext)s"
    # match-filter uses yt-dlp's Python-style expression language. The
    # ~= operator is a case-insensitive regex search.
    match_filter = f"title ~= (?i){re.escape(artist_safe)}"
    cmd = [
        "docker", "exec", "-u", "webuser", DOCKER_CONTAINER,
        "bash", "-c",
        f'export PATH="/usr/local/bin:$PATH" && '
        f'{DOCKER_YT_DLP} --cookies-from-browser "chrome:{DOCKER_PROFILE}" '
        f'-f bestaudio --extract-audio --audio-format mp3 --audio-quality 192K '
        f'--no-playlist --match-filter {shlex.quote(match_filter)} '
        f'--break-match-filters -o "{docker_out}" '
        f'"ytsearch5:{query}"',
    ]
    try:
        subprocess.run(cmd, timeout=180, capture_output=True)
    except (subprocess.TimeoutExpired, Exception):
        pass

    # Find the file inside the container and copy it out.
    find_cmd = [
        "docker", "exec", DOCKER_CONTAINER,
        "bash", "-c", f'ls -1 "{DOCKER_DL_DIR}/{safe}"*.mp3 2>/dev/null | head -1',
    ]
    try:
        result = subprocess.run(find_cmd, capture_output=True, text=True, timeout=10)
        remote_path = result.stdout.strip()
    except Exception:
        remote_path = ""

    if not remote_path:
        return None

    remote_name = os.path.basename(remote_path)
    local_path = RADIO_MUSIC_DIR / remote_name
    cp_cmd = ["docker", "cp", f"{DOCKER_CONTAINER}:{remote_path}", str(local_path)]
    try:
        subprocess.run(cp_cmd, timeout=30, capture_output=True)
    except Exception:
        pass

    if local_path.exists() and local_path.stat().st_size > 10000:
        _download_cache[f"{artist} - {title}".lower()] = remote_name
        # Clean up inside the container.
        subprocess.run(
            ["docker", "exec", DOCKER_CONTAINER, "rm", "-f", remote_path],
            capture_output=True, timeout=10,
        )
        return remote_name
    return None


class DownloadRequest(BaseModel):
    artist: str
    title: str


@app.post("/api/download-track")
async def download_track(req: DownloadRequest):
    """Download a full-length track via YouTube. Returns the audio URL when done.
    Concurrent requests for the same track share a single download."""
    artist = req.artist.strip()
    title = req.title.strip()
    if not artist or not title:
        raise HTTPException(400, "artist and title required")

    # Already downloaded?
    existing = _find_cached(artist, title)
    if existing:
        return {"status": "ready", "audioUrl": f"/api/audio/{existing}"}

    # Lock per track so concurrent requests don't trigger parallel downloads.
    key = f"{artist} - {title}".lower()
    if key not in _download_locks:
        _download_locks[key] = asyncio.Lock()
    async with _download_locks[key]:
        # Re-check after acquiring lock (another request may have finished it).
        existing = _find_cached(artist, title)
        if existing:
            return {"status": "ready", "audioUrl": f"/api/audio/{existing}"}

        filename = await asyncio.to_thread(_do_download, artist, title)
        if filename:
            return {"status": "ready", "audioUrl": f"/api/audio/{filename}"}
        return {"status": "failed", "audioUrl": None}


# ── Persistent download queue ────────────────────────────────────────────────
# A single long-lived thread pool (4 workers) processes downloads for the
# lifetime of the server. Tracks are enqueued via POST /api/download-batch;
# new tracks from infinity-mode just get appended. Duplicate track keys are
# silently skipped. Results accumulate per batch_id so the frontend can poll.

import threading as _th
import queue as _q

_dl_queue: _q.Queue = _q.Queue()
_dl_results: dict[str, dict[int, str | None]] = {}
_dl_lock = _th.Lock()
_dl_seen: set[str] = set()  # "batch_id:idx" keys already queued or done


def _dl_worker() -> None:
    """Pull jobs from the queue forever, 4 of these run in parallel."""
    while True:
        try:
            job = _dl_queue.get(timeout=5)
        except _q.Empty:
            continue
        bid, idx, artist, title = job
        try:
            existing = _find_cached(artist, title)
            if existing:
                url = f"/api/audio/{existing}"
            else:
                filename = _do_download(artist, title)
                url = f"/api/audio/{filename}" if filename else None
            with _dl_lock:
                _dl_results.setdefault(bid, {})[idx] = url
        except Exception:
            with _dl_lock:
                _dl_results.setdefault(bid, {})[idx] = None
        finally:
            _dl_queue.task_done()


# Start 4 persistent download workers on import.
for _i in range(4):
    _t = _th.Thread(target=_dl_worker, daemon=True)
    _t.start()


class BatchDownloadRequest(BaseModel):
    batch_id: str
    tracks: list[dict]  # [{artist, title}, ...]


@app.post("/api/download-batch")
async def download_batch(req: BatchDownloadRequest):
    """Enqueue tracks for download. Tracks already queued or finished under
    this batch_id are skipped. Call again with the same batch_id + more tracks
    to grow the queue (infinity mode)."""
    bid = req.batch_id.strip()
    if not bid or not req.tracks:
        raise HTTPException(400, "batch_id and tracks required")

    added = 0
    with _dl_lock:
        _dl_results.setdefault(bid, {})
    for i, t in enumerate(req.tracks):
        a = (t.get("artist") or "").strip()
        tl = (t.get("title") or "").strip()
        key = f"{bid}:{i}"
        if not a or not tl:
            continue
        with _dl_lock:
            if key in _dl_seen:
                continue
            _dl_seen.add(key)
        _dl_queue.put((bid, i, a, tl))
        added += 1

    return {"status": "queued", "batch_id": bid, "added": added, "queue_size": _dl_queue.qsize()}


@app.get("/api/download-status")
async def download_status(batch_id: str):
    """Poll for download progress. Returns a map of track index → audioUrl
    for every track that has finished so far under this batch_id."""
    with _dl_lock:
        results = dict(_dl_results.get(batch_id, {}))
    return {"batch_id": batch_id, "ready": results, "queue_size": _dl_queue.qsize()}


@app.get("/api/audio/{filename:path}")
async def serve_audio(filename: str):
    """Serve a downloaded MP3 with range-request support."""
    path = RADIO_MUSIC_DIR / filename
    if not path.exists() or not path.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(
        path,
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=86400",
        },
    )


def _deezer_get(url: str, timeout: int = 10) -> dict:
    """GET a Deezer URL and return parsed JSON. Returns {} on failure."""
    import urllib.request
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "clawdj/0.2"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except Exception:
        return {}


def _attach_bpms(tracks: list, max_to_fetch: int) -> None:
    """Fetch BPMs in parallel and annotate each track in-place with _bpm."""
    import concurrent.futures
    ids = [t.get("id") for t in tracks[:max_to_fetch] if t.get("id")]
    bpm_map: dict = {}
    if not ids:
        return
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(_fetch_track_bpm, tid): tid for tid in ids}
        for future in concurrent.futures.as_completed(futures, timeout=10):
            tid = futures[future]
            try:
                bpm_map[tid] = future.result()
            except Exception:
                pass
    for t in tracks:
        t["_bpm"] = bpm_map.get(t.get("id"), 0)


def _filter_by_bpm(tracks: list, min_bpm: int, max_bpm: int) -> list:
    """Keep tracks whose BPM (if known) fits the window. Unknown BPMs pass through."""
    if min_bpm <= 0 and max_bpm >= 200:
        return tracks
    out = []
    for t in tracks:
        bpm = t.get("_bpm", 0)
        if bpm <= 0:
            out.append(t)  # Unknown BPM — don't discard
            continue
        if bpm >= min_bpm and bpm <= max_bpm:
            out.append(t)
    return out


def _serialize(tracks: list) -> list:
    out = []
    for t in tracks:
        artist_name = t.get("artist", {}).get("name", "Unknown")
        title = t.get("title", "Unknown")
        cached = _find_cached(artist_name, title)
        out.append({
            "id": t.get("id"),
            "title": title,
            "artist": artist_name,
            "album": t.get("album", {}).get("title", ""),
            "cover": t.get("album", {}).get("cover_medium", ""),
            "duration": t.get("duration", 0),
            "preview": t.get("preview", ""),
            "bpm": t.get("_bpm", 0),
            "audioUrl": f"/api/audio/{cached}" if cached else None,
        })
    return out


def _resolve_bpm_window(
    user_min: int, user_max: int,
    llm_min: int | None, llm_max: int | None,
) -> tuple[int, int]:
    """User sliders override LLM hints. If user left defaults (0..200),
    use LLM hint if present, else open window."""
    if user_min > 0 or user_max < 200:
        return user_min, user_max
    if llm_min is not None or llm_max is not None:
        return (llm_min or 0, llm_max or 200)
    return user_min, user_max


def _branch_artist(intent: dict, count: int, exclude_ids: set,
                   user_min: int, user_max: int) -> tuple[list, dict]:
    """Artist branch → top tracks by the matched artist."""
    import urllib.parse
    name = intent.get("artist") or ""
    if not name:
        return [], {"label": None}

    sd = _deezer_get(f"https://api.deezer.com/search/artist?q={urllib.parse.quote(name)}&limit=1")
    artists = sd.get("data", [])
    if not artists:
        return [], {"label": name}
    artist = artists[0]
    aid = artist.get("id")
    canonical = artist.get("name") or name

    td = _deezer_get(f"https://api.deezer.com/artist/{aid}/top?limit={count * 2}")
    tracks = [t for t in td.get("data", []) if t.get("preview") and t.get("id") not in exclude_ids]
    _attach_bpms(tracks, count * 2)

    filtered = _filter_by_bpm(tracks, user_min, user_max)
    if len(filtered) < max(3, count // 2):
        filtered = tracks  # BPM filter too strict for this artist
    return filtered[:count], {"label": canonical}


def _branch_song(intent: dict, count: int, exclude_ids: set,
                 user_min: int, user_max: int) -> tuple[list, dict]:
    """Song branch → the seed track plus similar tracks via artist radio."""
    import urllib.parse
    title = intent.get("title") or ""
    artist = intent.get("artist") or ""
    if not title:
        return [], {"label": None}

    # Strategy: run both a plain search and a strict filtered search, then
    # pick the highest-ranked (most popular) preview-bearing candidate that
    # matches the title. Deezer's `rank` field correlates with popularity —
    # the real Queen track beats the Lucia Micarelli cover etc.
    queries: list[str] = []
    if artist:
        queries.append(f'track:"{title}" artist:"{artist}"')
    queries.append(f"{title} {artist}".strip())
    queries.append(title)

    candidates: dict[int, dict] = {}
    for q in queries:
        sd = _deezer_get(
            f"https://api.deezer.com/search/track?q={urllib.parse.quote(q)}&limit=10"
        )
        for t in sd.get("data", []):
            if not t.get("preview"):
                continue
            tid = t.get("id")
            if tid and tid not in candidates:
                candidates[tid] = t

    if not candidates:
        return [], {"label": f"{title}{' · ' + artist if artist else ''}"}

    # Optional title substring filter — tolerate small deltas but drop obvious
    # mis-matches like "Bohemian Rhapsody (Acapella Mashup)".
    def _score(t: dict) -> tuple[int, int]:
        rank = int(t.get("rank") or 0)
        # Bonus for an exact-ish title match
        title_lc = (t.get("title") or "").lower()
        bonus = 1 if title.lower() in title_lc else 0
        return (bonus, rank)

    seed_list = sorted(candidates.values(), key=_score, reverse=True)
    seed = seed_list[0]
    seed_id = seed.get("id")
    seed_artist_id = (seed.get("artist") or {}).get("id")

    similar: list = []
    if seed_artist_id:
        rd = _deezer_get(f"https://api.deezer.com/artist/{seed_artist_id}/radio?limit={count * 3}")
        similar = [t for t in rd.get("data", []) if t.get("preview") and t.get("id") not in exclude_ids and t.get("id") != seed_id]

    # Always lead with the seed track (unless it was excluded by infinity mode)
    ordered: list = []
    if seed_id not in exclude_ids:
        ordered.append(seed)
    ordered.extend(similar)

    _attach_bpms(ordered, count * 2)
    seed_bpm = ordered[0].get("_bpm", 0) if ordered else 0

    # Apply BPM window (user overrides), fall back to seed-proximity
    filtered = _filter_by_bpm(ordered, user_min, user_max)
    if seed_bpm > 0 and user_min <= 0 and user_max >= 200:
        filtered = [t for t in filtered if abs(t.get("_bpm", seed_bpm) - seed_bpm) <= 20 or t.get("id") == seed_id]
    if len(filtered) < max(3, count // 2):
        filtered = ordered
    label = f'{seed.get("title", title)} · {(seed.get("artist") or {}).get("name", artist or "")}'
    return filtered[:count], {"label": label.strip(" ·")}


def _branch_vibe(query: str, intent: dict, count: int, exclude_ids: set,
                 user_min: int, user_max: int) -> tuple[list, dict]:
    """Vibe branch → the existing playlist-then-search flow, BPM filtered."""
    import urllib.parse
    import random

    search_q = query
    # If the LLM suggested a concrete genre we can blend it into the query
    # for better Deezer playlist matches.
    genre = intent.get("genre")
    if genre and genre.lower() not in query.lower():
        search_q = f"{query} {genre}"

    tracks: list = []

    # Try playlists first for better curation
    pd = _deezer_get(f"https://api.deezer.com/search/playlist?q={urllib.parse.quote(search_q)}&limit=5")
    playlists = pd.get("data", [])
    if playlists:
        best = max(playlists, key=lambda p: p.get("nb_tracks", 0))
        td = _deezer_get(f"https://api.deezer.com/playlist/{best['id']}/tracks?limit=100")
        playlist_tracks = td.get("data", [])
        with_preview = [t for t in playlist_tracks if t.get("preview") and t.get("id") not in exclude_ids]
        random.shuffle(with_preview)
        tracks = with_preview[:count * 2]

    # Fallback / augment with straight search
    if len(tracks) < count:
        sd = _deezer_get(f"https://api.deezer.com/search?q={urllib.parse.quote(search_q)}&limit={count * 3}")
        with_preview = [t for t in sd.get("data", []) if t.get("preview") and t.get("id") not in exclude_ids]
        existing_ids = {t.get("id") for t in tracks}
        for t in with_preview:
            if t.get("id") not in existing_ids:
                tracks.append(t)

    _attach_bpms(tracks, count * 2)
    ordered = _order_by_bpm(tracks)
    filtered = _filter_by_bpm(ordered, user_min, user_max)
    if len(filtered) < max(3, count // 2):
        filtered = ordered

    parts = [p for p in [genre, intent.get("mood")] if p]
    label = " · ".join(parts) if parts else query
    return filtered[:count], {"label": label}


@app.get("/api/vibe-playlist")
async def vibe_playlist(
    q: str,
    count: int = 15,
    exclude: str = "",
    min_bpm: int = 0,
    max_bpm: int = 200,
):
    """Smart search: routes by LLM-classified intent.
    - artist name  → top songs by that artist
    - song title   → seed song + similar via artist radio
    - vibe         → BPM-clustered playlist (existing behaviour)
    """
    import asyncio

    exclude_ids: set = set()
    if exclude:
        exclude_ids = {int(x) for x in exclude.split(",") if x.strip().isdigit()}

    # Classify (off the event loop) — falls back to vibe on any error.
    try:
        from services.intent import classify_cached
        intent = await asyncio.to_thread(classify_cached, q)
    except Exception:
        intent = {"type": "vibe", "artist": None, "title": None,
                  "genre": None, "mood": None, "bpm_min": None, "bpm_max": None}

    eff_min, eff_max = _resolve_bpm_window(
        min_bpm, max_bpm, intent.get("bpm_min"), intent.get("bpm_max"),
    )

    itype = intent.get("type", "vibe")
    if itype == "artist":
        tracks, meta = await asyncio.to_thread(
            _branch_artist, intent, count, exclude_ids, eff_min, eff_max,
        )
        if not tracks:
            # Artist not found on Deezer — degrade to vibe search.
            tracks, meta = await asyncio.to_thread(
                _branch_vibe, q, intent, count, exclude_ids, eff_min, eff_max,
            )
            itype = "vibe"
    elif itype == "song":
        tracks, meta = await asyncio.to_thread(
            _branch_song, intent, count, exclude_ids, eff_min, eff_max,
        )
        if not tracks:
            tracks, meta = await asyncio.to_thread(
                _branch_vibe, q, intent, count, exclude_ids, eff_min, eff_max,
            )
            itype = "vibe"
    else:
        tracks, meta = await asyncio.to_thread(
            _branch_vibe, q, intent, count, exclude_ids, eff_min, eff_max,
        )
        itype = "vibe"

    bpms = [t.get("_bpm", 0) for t in tracks if t.get("_bpm", 0) > 0]
    bpm_info: dict = {}
    if bpms:
        bpm_info = {
            "min_bpm": min(bpms),
            "max_bpm": max(bpms),
            "avg_bpm": round(sum(bpms) / len(bpms)),
        }

    return {
        "vibe": q,
        "count": len(tracks),
        "bpm": bpm_info,
        "detected": {
            "type": itype,
            "label": meta.get("label"),
            "bpm_min": eff_min if eff_min > 0 else None,
            "bpm_max": eff_max if eff_max < 200 else None,
        },
        "tracks": _serialize(tracks),
    }
