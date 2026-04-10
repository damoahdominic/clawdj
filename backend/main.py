"""ClawDJ Web API — Phase 2."""
import os
import sys
import uuid
import json
import asyncio
import subprocess
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
ANYSONG_BIN = HOME / "anysong" / "anysong"
BACKEND_DIR = Path(__file__).parent

SESSION_FILE = HOME / ".clawdj" / "session.json"

for d in [MUSIC_DIR, MASHUP_DIR, STEMS_DIR]:
    d.mkdir(parents=True, exist_ok=True)
(HOME / ".clawdj").mkdir(parents=True, exist_ok=True)

jobs: dict = {}


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


@app.get("/api/vibe-playlist")
async def vibe_playlist(q: str, count: int = 15, exclude: str = ""):
    """Get a BPM-matched playlist of tracks matching a vibe.
    exclude: comma-separated track IDs to skip (for infinity mode)
    """
    import urllib.request
    import urllib.parse
    import random
    import concurrent.futures

    exclude_ids = set()
    if exclude:
        exclude_ids = {int(x) for x in exclude.split(",") if x.strip().isdigit()}

    tracks = []

    # Try playlists first for better curation
    try:
        purl = f"https://api.deezer.com/search/playlist?q={urllib.parse.quote(q)}&limit=5"
        req = urllib.request.Request(purl, headers={"User-Agent": "clawdj/0.2"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            playlists = json.loads(resp.read().decode()).get("data", [])

        if playlists:
            best = max(playlists, key=lambda p: p.get("nb_tracks", 0))
            turl = f"https://api.deezer.com/playlist/{best['id']}/tracks?limit=100"
            req = urllib.request.Request(turl, headers={"User-Agent": "clawdj/0.2"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                playlist_tracks = json.loads(resp.read().decode()).get("data", [])

            with_preview = [t for t in playlist_tracks if t.get("preview") and t.get("id") not in exclude_ids]
            random.shuffle(with_preview)
            tracks = with_preview[:count * 2]  # fetch extra for BPM filtering
    except Exception:
        pass

    # Fallback to search
    if len(tracks) < count:
        try:
            surl = f"https://api.deezer.com/search?q={urllib.parse.quote(q)}&limit={count * 3}"
            req = urllib.request.Request(surl, headers={"User-Agent": "clawdj/0.2"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                search_tracks = json.loads(resp.read().decode()).get("data", [])
            with_preview = [t for t in search_tracks if t.get("preview") and t.get("id") not in exclude_ids]
            existing_ids = {t.get("id") for t in tracks}
            for t in with_preview:
                if t.get("id") not in existing_ids:
                    tracks.append(t)
        except Exception:
            pass

    # Fetch BPMs in parallel
    track_ids = [t.get("id") for t in tracks if t.get("id")]
    bpm_map = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(_fetch_track_bpm, tid): tid for tid in track_ids[:count * 2]}
        for future in concurrent.futures.as_completed(futures, timeout=10):
            tid = futures[future]
            try:
                bpm_map[tid] = future.result()
            except Exception:
                pass

    # Attach BPM to tracks
    for t in tracks:
        t["_bpm"] = bpm_map.get(t.get("id"), 0)

    # Order by BPM for consistent energy
    ordered = _order_by_bpm(tracks)[:count]

    # Get the BPM range for the response
    bpms = [t["_bpm"] for t in ordered if t.get("_bpm", 0) > 0]
    bpm_info = {}
    if bpms:
        bpm_info = {"min_bpm": min(bpms), "max_bpm": max(bpms), "avg_bpm": round(sum(bpms) / len(bpms))}

    return {
        "vibe": q,
        "count": len(ordered),
        "bpm": bpm_info,
        "tracks": [{
            "id": t.get("id"),
            "title": t.get("title", "Unknown"),
            "artist": t.get("artist", {}).get("name", "Unknown"),
            "album": t.get("album", {}).get("title", ""),
            "cover": t.get("album", {}).get("cover_medium", ""),
            "duration": t.get("duration", 0),
            "preview": t.get("preview", ""),
            "bpm": t.get("_bpm", 0),
        } for t in ordered],
    }
