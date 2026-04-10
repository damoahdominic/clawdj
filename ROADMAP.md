# 🦞 ClawDJ — ScratchPad Roadmap

## Vision
**OpenClaw DJ** — a self-hosted, AI-powered DJ that runs live music events. Installable on any OpenClaw with a one-liner, it spins up a web-based DJ client with real-time intelligence, voice announcements, and interactive scratching.

---

## Install (Target)
```bash
# One-liner install
curl -fsSL https://clawd.live/install.md | bash
# Smoke test
clawdj doctor
```

---

## Initial Setup (First Launch Config Wizard)

When the user first opens ClawDJ, they configure:

| Setting | Options | Notes |
|---------|---------|-------|
| **TTS Voice** | ElevenLabs / local TTS | Voice for DJ announcements |
| **Welcome Announcement** | On/Off | Greet at start of every session |
| **LLM for Intelligence** | OpenClaw subagents | Powers real-time decisions |
| **Song Transition Effects** | Always Crossfade / Mix Crossfade & SFX / Always SFX | How songs blend |
| **Song Transition Duration** | Play Full Song / Play Threshold / Random | When to cut to next |
| **Sound Effects Library** | Built-in defaults + user uploads | SFX triggered by DJ AI |
| **Playlist Source** | Local library / YOLO (Live Mode) | Where music comes from |

---

## Session Model

A **Session** is a real-time stream of events. It starts when the user hits play and survives web refreshes.

### Session Properties
- Long-lived — persists across browser refreshes via backend state
- Independent from OpenClaw sessions (separate lifecycle)
- Emits animation events for the 3D ClawDJ character

### Timeline Architecture
```
Session Timeline (real-time, streaming)
  Audio Deck  |  SFX Deck   |   TTS Deck
  ---♫----♫-- |  🔊  🔊     |  "Welcome to..."
  ---♫----♫-- |     🔊      |     "Up next..."
  
  Events: crossfade, scratch, announce, effect
```

- Multiple tracks can cue simultaneously (e.g., SFX + TTS at same time)
- Timeline is generated in real-time by the DJ AI
- Visualized as a multi-track timeline on screen

---

## DJ Modes

### Playlist Mode
User selects from their library. DJ AI handles transitions, announcements, and effects.

### YOLO Mode (Live)
- **By Vibe**: Describe a vibe ("chill lofi beats", "2000s hip hop party")
- **By Artist**: Top hits from a specific artist
- Requires internet bandwidth check — falls back to cached playlist

### DJ Styles
- **Standard** (v1) — balanced interruptions, natural pacing
- Future: Club DJ, Radio Host, Chill Lounge, Hypeman

---

## Turntable Feature (Phase 1)

### Scratch Engine
- Based on scratchable-turntable (jefferey/scratchable-turntable) + CodePen pimskie/bGjMdxV
- SVG vinyl record with real-time mouse/touch scratch interaction
- Web Audio API for vinyl crackle + oscillator scratch sounds
- Dual decks (Deck A + Deck B) for DJ-style control
- Visual: spinning vinyl with groove texture, label art, tonearm

### Technical Implementation
```
TurntableComponent
  SVG Vinyl (rotating, scratchable)
  Web Audio Context
    Vinyl noise buffer (white noise + pops)
    Scratch oscillator (sawtooth, freq-mapped to drag)
    Crossfade node (between decks)
  Pointer Events (pointerdown/move/up)
  BPM-synced rotation
```

---

## 3D Character Integration

The session emits events that drive the 3D ClawDJ lobster:
- beat: character bounces
- transition: character reacts to song change
- scratch: character scratches with you
- announce: character "speaks" (mouth animation synced to TTS)

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, React 18, Three.js, WaveSurfer.js, Tailwind |
| Audio Engine | Web Audio API, SVG turntables |
| Backend | Python FastAPI (existing) + Go (main.go) |
| Stem Separation | Meta Demucs |
| Analysis | librosa (BPM, key, energy) |
| Discovery | yt-dlp, Deezer previews |
| TTS | ElevenLabs API |
| AI DJ Brain | OpenClaw subagents |

---

## Current State

### Already Built
- Mashup Mixer (stem separation, BPM/key analysis, vocal/instrumental blending)
- Radio DJ (vibe playlist, auto-crossfade, infinity mode)
- Basic vinyl scratch (drag to seek)
- 3D lobster scene with beat-synced animation
- Go backend binary

### Phase 1: ScratchPad (This Build)
- Replace basic vinyl with scratchable-turntable engine
- Dual deck layout (Deck A + Deck B)
- Proper vinyl crackle + scratch audio (Web Audio oscillator)
- Crossfader between decks
- Session persistence (survive refresh)
- README + ROADMAP docs

### Phase 2: AI DJ Brain
- Config wizard (first-launch setup)
- TTS integration (ElevenLabs)
- Welcome announcements
- Song transition effects engine
- Real-time timeline visualization
- SFX library (built-in + user uploads)

### Phase 3: Live Events
- One-liner install script
- Internet bandwidth detection
- DJ Style selection
- YOLO Live Mode
- OpenClaw subagent integration
- Physical robot DJ (RPi + servos)

---

*Powered by lobsters and questionable life choices.*
