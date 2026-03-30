# 🦞 ClawDJ

AI-powered DJ mashup engine — mix any two songs instantly.

## Quick Start

### Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### CLI Usage
```bash
# Analyze a track
python cli.py analyze path/to/song.mp3

# Analyze by searching (auto-downloads)
python cli.py analyze "Lollipop Lil Wayne"

# Mix two songs
python cli.py mix "Lollipop Lil Wayne" "Wild Thoughts Rihanna"

# Mix local files
python cli.py mix track_a.mp3 track_b.mp3 --vocals a

# Auto DJ — describe a vibe
python cli.py auto "chill lofi beats"

# Search for tracks
python cli.py search "hip hop instrumental"
```

### Web API
```bash
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Web Frontend
```bash
cd frontend
npm install && npm run dev
```

## How It Works
1. **Upload/search** two audio tracks
2. **Stem separation** via Meta's Demucs — isolates vocals and instrumentals
3. **Audio analysis** — detects BPM, key (Camelot), beat grid, energy
4. **Tempo matching** — time-stretches to align BPMs
5. **Mashup** — layers vocals from Track A over instrumentals from Track B
6. **Download** your mashup as 320kbps MP3

## Architecture
```
clawdj/
├── backend/
│   ├── cli.py              # CLI interface (typer)
│   ├── main.py             # FastAPI web server
│   └── services/
│       ├── separator.py    # Demucs stem separation
│       ├── analyzer.py     # BPM, key, beat detection
│       ├── mixer.py        # Audio blending + export
│       └── discovery.py    # YouTube search + download
└── frontend/               # Next.js web panel (Phase 2)
```

## Vision
CLI tool → Web panel → Physical robot DJ 🦞🎧
