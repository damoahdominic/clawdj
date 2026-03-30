"""ClawDJ Web API."""
import os
import uuid
import asyncio
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, WebSocket
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from services.separator import separate_stems
from services.analyzer import analyze_track, are_compatible
from services.mixer import create_mashup
from services.discovery import search_and_download, search_tracks

app = FastAPI(title="ClawDJ", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")
STEMS_DIR = Path("stems")
for d in [UPLOAD_DIR, OUTPUT_DIR, STEMS_DIR]:
    d.mkdir(exist_ok=True)

jobs: dict = {}


@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0"}


@app.get("/api/search")
async def api_search(q: str, limit: int = 5):
    results = await asyncio.to_thread(search_tracks, q, limit)
    return {"results": results}


@app.post("/api/upload")
async def upload_tracks(track_a: UploadFile = File(...), track_b: UploadFile = File(...)):
    job_id = str(uuid.uuid4())[:8]
    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir(exist_ok=True)

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
    await websocket.accept()
    if job_id not in jobs:
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
        output_path = str(OUTPUT_DIR / f"{job_id}_mashup.mp3")
        await asyncio.to_thread(create_mashup, stems_a, stems_b, analysis_a, analysis_b, output_path)
        await websocket.send_json({"step": "complete", "progress": 100, "download": f"/api/download/{job_id}"})

        jobs[job_id]["status"] = "complete"
        jobs[job_id]["output"] = output_path

    except Exception as e:
        await websocket.send_json({"step": "error", "message": str(e)})
    finally:
        await websocket.close()


@app.get("/api/download/{job_id}")
def download_mashup(job_id: str):
    if job_id not in jobs or jobs[job_id].get("status") != "complete":
        return JSONResponse({"error": "not ready"}, 404)
    return FileResponse(jobs[job_id]["output"], media_type="audio/mpeg", filename=f"clawdj_{job_id}.mp3")
