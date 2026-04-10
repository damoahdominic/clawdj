# Task: Upgrade Scratch Engine to Physics-Based Audio

Replace the current oscillator-based scratch engine with a physics-based system that manipulates the ACTUAL audio track's playback rate, including reversed buffer support.

## Reference Implementation Analysis

The reference code (from pimskie CodePen) has these key classes:

### VinylController (rotation physics)
- Tracks angle in radians, clamped to `duration * 0.75 * 2π` (max angle)
- On drag: calculates angle delta from pointer movement using atan2
- Maintains `playbackSpeed` as a smoothed moving average of last 10 samples
- Detects `isReversed` by comparing current angle vs previous
- Auto-rotation: `speedPerMs = (maxAngle/60) * 0.001`, applies `speedPerMs * dt * playbackSpeed` per frame
- Clamps speed to [-4, 4] range

### AudioPlayer (proper audio engine)
- Creates BOTH forward and reversed AudioBuffers from the track
- `play(seconds)`: starts BufferSource at the correct offset
- `updateSpeed(speed, isReversed, secondsPlayed)`: if direction changed, calls `changeDirection` which swaps to reversed buffer at the correct position; uses `playbackRate.linearRampToValueAtTime` for smooth speed changes
- `changeDirection(isReversed, secondsPlayed)`: pauses, creates new BufferSource with reversed buffer, starts at `duration - secondsPlayed`
- `toggleMute(muted)`: gain node on/off

### Integration Flow
```
VinylController.onLoop -> AudioPlayer.updateSpeed(speed, isReversed, secondsPlayed)
VinylController.onDragEnded -> AudioPlayer.play(secondsPlayed)
Controls.onIsplayingChanged -> VinylController.powerOn/powerOff
```

## Files to Modify

### 1. `frontend/hooks/useAudioEngine.ts` — REWRITE
Replace with a hook that:
- Takes an audio URL (the actual track, not vinyl noise)
- Creates AudioContext, decodes the track into both forward AND reversed buffers
- Exposes: `loadTrack(url)`, `play(seconds)`, `updateSpeed(speed, isReversed, seconds)`, `toggleMute(bool)`, `pause()`, `dispose()`
- No oscillator, no vinyl noise — just the real audio with playbackRate manipulation
- Keep vinyl crackle as an optional subtle background layer (low gain white noise buffer looping)

### 2. `frontend/hooks/useScratch.ts` — REWRITE  
Replace with physics-based vinyl rotation:
- Track angle in radians
- On pointerdown: record center point, start tracking
- On pointermove: calculate angle delta using atan2 from center to pointer, apply to angle
- On pointerup: release
- Maintain smoothed playbackSpeed (moving average of last 10 frame speeds)
- Detect isReversed each frame
- Auto-rotate when powered on (speedPerMs calculation from reference)
- Callbacks: onLoop({playbackSpeed, isReversed, secondsPlayed, progress}), onDragEnded(secondsPlayed)
- setAngle clamps to [0, maxAngle] where maxAngle = duration * 0.75 * 2π

### 3. `frontend/components/Turntable.tsx` — UPDATE
- Use the new hooks
- Pass actual audio URL to the audio engine
- On drag: call audioEngine.updateSpeed(speed, isReversed, seconds) every frame
- On drag end: if playing, resume normal playback
- Keep the SVG vinyl visual (it's good)
- Accept `audioUrl` prop instead of managing audio externally

### 4. `frontend/app/radio/page.tsx` — UPDATE
- The radio page already passes Deezer preview URLs to the audio elements
- Wire those URLs into the Turntable components instead of the separate audioARef/audioBRef
- The Turntable component now manages its own audio via the physics engine
- Keep crossfade logic: when crossfading, the next deck's Turntable starts playing
- Add auto-scratch on song transitions: before crossfade, briefly scratch the outgoing track (speed ramp down, reverse, then release)

## Auto-Scratch + Crossfade Feature
When transitioning between songs:
1. Outgoing deck: ramp playbackSpeed down to 0 over 0.5s
2. Brief reverse scratch (200ms)  
3. Start incoming deck at full speed
4. Crossfade audio between decks over configured duration

## Build & Commit
- `cd frontend && npx next build` must pass
- `git add -A && git commit -m "feat: physics-based scratch engine with reversed audio buffer + auto-scratch transitions"`
