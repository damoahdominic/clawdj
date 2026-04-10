# ClawDJ ScratchPad Build Task

You are working on the ClawDJ project at `/home/cbot/Workspace/clawdj`.

## Context
ClawDJ is an AI-powered DJ mashup engine. It has:
- A Next.js 14 frontend with React 18, Three.js, WaveSurfer.js, Tailwind
- A Python FastAPI backend with Demucs stem separation
- A Go backend (main.go)
- Radio DJ mode at `/radio` with a basic vinyl scratch (drag to seek)
- 3D lobster scene with beat-synced animation

## What to Build: Phase 1 — ScratchPad

### 1. New Scratchable Turntable Component

Replace the basic vinyl scratch in the Radio page with a proper scratchable turntable engine. Use the scratchable-turntable approach:

**Key techniques from the reference implementation:**
- SVG vinyl record (circle with grooves, label art)
- Web Audio API:
  - Vinyl noise buffer: 2-channel buffer with white noise + random pops, looped continuously, gain-controlled
  - Scratch oscillator: sawtooth oscillator that ramps frequency based on drag velocity
  - Gain nodes to mute/unmute vinyl noise vs scratch sound
- Pointer events: pointerdown starts scratch (mutes vinyl noise), pointermove calculates rotation angle + oscillator frequency from delta X/Y, pointerup stops scratch (mutes oscillator, unmutes vinyl noise)
- SVG `record_group` and `surface_group` transform rotate for visual rotation
- Auto-rotation via requestAnimationFrame when not scratching (spinning record)

### 2. Dual Deck Layout

Create a dual deck DJ layout:
- Deck A (left) and Deck B (right) — each a scratchable turntable
- Crossfader slider between them (controls volume mix)
- BPM display for each deck
- Track info (title, artist) on each deck
- Play/pause button per deck

### 3. Integration with Existing Radio Mode

The dual decks should work WITH the existing Radio DJ flow:
- When Radio mode plays tracks, Deck A and Deck B alternate (A plays, then crossfades to B, etc.)
- The user can scratch either deck while it's playing
- Crossfader visual syncs with the auto-crossfade
- The 3D lobster background stays as-is

### 4. Session Persistence

- Create a simple session state in the backend (FastAPI endpoint)
- Save current playlist, current track index, playback position
- On frontend reload, restore session state
- Use localStorage as fallback

### 5. File Structure

```
frontend/
  app/
    radio/page.tsx          (existing — update to use new decks)
  components/
    Turntable.tsx           (new — scratchable turntable component)
    DeckLayout.tsx          (new — dual deck layout with crossfader)
    Crossfader.tsx          (new — crossfader slider component)
  hooks/
    useAudioEngine.ts       (new — Web Audio API hook for vinyl noise + scratch)
    useScratch.ts           (new — pointer event handling for scratch)
```

### 6. Docs
- ROADMAP.md is already written (don't change it)
- Update README.md with new architecture info

## Important Notes
- Keep the existing 3D lobster background (LobsterBackground component)
- Keep existing mashup mixer page (`/`) working
- Use existing CSS theme (gray-950 bg, red/orange/yellow gradients)
- The frontend is at `/home/cbot/Workspace/clawdj/frontend`
- Run `npm run build` at the end to verify it compiles
- Commit all changes with a descriptive message

## Reference: Scratchable Turntable Audio Logic

```javascript
// Vinyl noise: create 2-channel buffer at 33rpm equivalent length
const frameCount = context.sampleRate * 1.8;
let dataBuffer = context.createBuffer(2, frameCount, context.sampleRate);
// Channel 0: white noise, Channel 1: random pops
let ch0 = dataBuffer.getChannelData(0);
let ch1 = dataBuffer.getChannelData(1);
for (let i = 0; i < frameCount; i++) {
  const rVal = Math.random() * 0.05 - 0.025;
  ch0[i] = i < frameCount / 2 ? rVal * 0.8 : rVal;
  ch1[i] = popCount < 3 && Math.abs(rVal) > 0.0249975 ? (rVal < 0 ? -0.9 : 0.9) : 0.0;
}
// Loop it as vinyl source
vinylSource = context.createBufferSource();
vinylSource.buffer = dataBuffer;
vinylSource.loop = true;

// Scratch oscillator: sawtooth
oscillator = context.createOscillator();
oscillator.type = 'sawtooth';

// On scratch: mute vinyl, ramp oscillator freq based on drag velocity
// On release: mute oscillator, unmute vinyl, resume rotation
```
