"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Box } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

interface WaveformLaneProps {
  audioUrl?: string;
  /** 0–1 progress through the track */
  progress: number;
  accent?: "bright" | "dark";
  height?: number;
  /** Cue point positions in 0–1 */
  cuePoints?: number[];
  /** Seconds per viewport width (how much track is visible at once). */
  windowSeconds?: number;
  /** Actual track duration in seconds. */
  durationSec?: number;
  /** Loop region in seconds (drawn as a shaded band). */
  loopRegion?: { inSec: number; outSec: number } | null;
  /** Whether the deck is currently playing — drives time extrapolation. */
  isPlaying?: boolean;
  /** Optional direct accessor for the live audio currentTime. When provided,
   *  the RAF loop reads this every frame instead of relying on the polled
   *  `progress` prop — giving perfectly smooth motion regardless of React
   *  update cadence. Returns null if no audio is loaded. */
  getCurrentSeconds?: () => number | null;
  /** Drag-to-scratch on this lane. */
  onScratchStart?: (seconds: number) => void;
  onScratchMove?: (speed: number, isReversed: boolean, seconds: number) => void;
  onScratchEnd?: (seconds: number) => void;
}

// ── Module-level peak cache so switching back to a track is instant ───────
const peakCache = new Map<string, number[]>();

/**
 * Decode the audio file once and reduce it to a normalized array of peaks.
 * Cached by URL.
 */
async function computePeaks(url: string, bucketCount = 4000): Promise<number[]> {
  const cached = peakCache.get(url);
  if (cached) return cached;

  const res = await fetch(url);
  const arrayBuf = await res.arrayBuffer();
  const AudioCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const tmp = new AudioCtor();
  const audioBuf = await tmp.decodeAudioData(arrayBuf.slice(0));
  try { tmp.close(); } catch { /* noop */ }

  const ch0 = audioBuf.getChannelData(0);
  const bucketSize = Math.max(1, Math.floor(ch0.length / bucketCount));
  const peaks = new Array<number>(bucketCount);
  let globalMax = 0;
  for (let b = 0; b < bucketCount; b++) {
    let max = 0;
    const start = b * bucketSize;
    const end = Math.min(ch0.length, start + bucketSize);
    for (let i = start; i < end; i++) {
      const v = Math.abs(ch0[i]);
      if (v > max) max = v;
    }
    peaks[b] = max;
    if (max > globalMax) globalMax = max;
  }
  if (globalMax > 0) {
    for (let b = 0; b < bucketCount; b++) peaks[b] /= globalMax;
  }
  peakCache.set(url, peaks);
  return peaks;
}

export function WaveformLane({
  audioUrl,
  progress,
  accent = "bright",
  height = 64,
  cuePoints = [],
  windowSeconds = 20,
  durationSec = 0,
  loopRegion = null,
  isPlaying = false,
  getCurrentSeconds,
  onScratchStart,
  onScratchMove,
  onScratchEnd,
}: WaveformLaneProps) {
  const getCurrentSecondsRef = useRef(getCurrentSeconds);
  useEffect(() => { getCurrentSecondsRef.current = getCurrentSeconds; }, [getCurrentSeconds]);
  const scratchable = !!(onScratchStart && onScratchMove && onScratchEnd);
  const theme = useTheme();
  const red = theme.palette.primary.main;
  const waveMain = accent === "bright" ? "#c9c9c9" : "#888";
  const wavePlayed = accent === "bright" ? theme.palette.primary.light : theme.palette.primary.dark;

  const containerRef = useRef<HTMLDivElement>(null);
  // Two DOM canvases translated together. `played-layer` div is clipped to
  // the left half of the container (via clip-path), `main-layer` to the right
  // — so they paint the played/unplayed colors without any per-frame splicing.
  const playedCanvasRef = useRef<HTMLCanvasElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);

  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [width, setWidth] = useState(600);

  // Time extrapolation state — RAF advances progress between polls so
  // scrolling stays smooth even though audio `currentTime` updates lazily.
  const baseProgressRef = useRef(progress);
  const baseProgressTimeRef = useRef<number>(
    typeof performance !== "undefined" ? performance.now() : Date.now()
  );
  const isPlayingRef = useRef(isPlaying);
  const durationSecRef = useRef(durationSec);
  const pxPerSecRef = useRef(width / windowSeconds);
  useEffect(() => { pxPerSecRef.current = width / windowSeconds; }, [width, windowSeconds]);

  // Drag-to-scratch state.
  const draggingRef = useRef(false);
  const overrideProgressRef = useRef<number | null>(null);
  const dragLastXRef = useRef(0);
  const dragLastTsRef = useRef(0);
  const dragSecRef = useRef(0);

  useEffect(() => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const dur = durationSecRef.current;
    const predicted = isPlayingRef.current && dur > 0
      ? baseProgressRef.current + ((now - baseProgressTimeRef.current) / 1000) / dur
      : baseProgressRef.current;
    const drift = Math.abs(progress - predicted);
    if (!isPlayingRef.current || drift > 0.01) {
      baseProgressRef.current = progress;
      baseProgressTimeRef.current = now;
    }
  }, [progress]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    baseProgressRef.current = progress;
    baseProgressTimeRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => { durationSecRef.current = durationSec; }, [durationSec]);

  // Resize observer.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setWidth(Math.max(100, Math.floor(e.contentRect.width)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load peaks when track changes.
  useEffect(() => {
    let cancelled = false;
    if (!audioUrl) { setPeaks(null); return; }
    computePeaks(audioUrl)
      .then((p) => { if (!cancelled) setPeaks(p); })
      .catch(() => { if (!cancelled) setPeaks(null); });
    return () => { cancelled = true; };
  }, [audioUrl]);

  // Build the full-length pre-rendered waveforms whenever peaks/duration/
  // window/width/height change. pxPerSec is derived from width/windowSeconds;
  // we cap it to keep memory sane on very long tracks.
  const pxPerSec = useMemo(() => {
    const p = width / windowSeconds;
    // Cap so a 10 minute track doesn't try to allocate 60k×DPR pixels.
    return Math.min(p, 60);
  }, [width, windowSeconds]);

  useEffect(() => {
    const playedEl = playedCanvasRef.current;
    const mainEl = mainCanvasRef.current;
    if (!playedEl || !mainEl) return;
    if (!peaks || peaks.length === 0 || !durationSec || durationSec <= 0) {
      // Clear
      playedEl.width = 1; playedEl.height = 1;
      mainEl.width = 1; mainEl.height = 1;
      return;
    }
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const logicalWidth = Math.max(1, Math.ceil(durationSec * pxPerSec));

    // Played
    playedEl.width = Math.floor(logicalWidth * dpr);
    playedEl.height = Math.floor(height * dpr);
    playedEl.style.width = `${logicalWidth}px`;
    playedEl.style.height = `${height}px`;
    const pCtx = playedEl.getContext("2d");
    if (pCtx) {
      pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintInto(pCtx, peaks, wavePlayed, logicalWidth, durationSec, height, pxPerSec);
    }

    // Main (unplayed)
    mainEl.width = Math.floor(logicalWidth * dpr);
    mainEl.height = Math.floor(height * dpr);
    mainEl.style.width = `${logicalWidth}px`;
    mainEl.style.height = `${height}px`;
    const mCtx = mainEl.getContext("2d");
    if (mCtx) {
      mCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintInto(mCtx, peaks, waveMain, logicalWidth, durationSec, height, pxPerSec);
    }
  }, [peaks, durationSec, pxPerSec, height, wavePlayed, waveMain]);

  // RAF: compute the current playhead position, translate both canvases.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const playedEl = playedCanvasRef.current;
      const mainEl = mainCanvasRef.current;
      if (!playedEl || !mainEl) return;
      const dur = durationSecRef.current;
      if (dur <= 0) return;

      let playSec: number;
      if (overrideProgressRef.current !== null) {
        playSec = overrideProgressRef.current * dur;
      } else {
        // Prefer live audio time — it updates every frame in modern browsers
        // so there's no polling gap to smooth over. Fall back to extrapolated
        // progress if the accessor isn't wired up yet.
        const live = getCurrentSecondsRef.current?.();
        if (live != null && Number.isFinite(live) && live > 0) {
          playSec = live;
        } else if (isPlayingRef.current) {
          const now = typeof performance !== "undefined" ? performance.now() : Date.now();
          const elapsed = (now - baseProgressTimeRef.current) / 1000;
          playSec = (baseProgressRef.current + elapsed / dur) * dur;
        } else {
          playSec = baseProgressRef.current * dur;
        }
      }

      // Translate so that x=playSec*pxPerSec in the canvas lands at container
      // centre. Using translate3d to force a GPU compositor layer.
      const tx = width / 2 - playSec * pxPerSec;
      const transform = `translate3d(${tx}px, 0, 0)`;
      playedEl.style.transform = transform;
      mainEl.style.transform = transform;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, pxPerSec]);

  // Cue markers.
  const windowPctStatic = useMemo(
    () => (durationSec > 0 ? windowSeconds / durationSec : 1),
    [durationSec, windowSeconds]
  );
  const cueMarkers = cuePoints.map((p, i) => {
    const offset = p - progress;
    const leftPct = 50 + (offset / windowPctStatic) * 50;
    if (leftPct < -2 || leftPct > 102) return null;
    return (
      <Box key={i} sx={{
        position: "absolute", top: 4, left: `${leftPct}%`,
        width: 7, height: 7, borderRadius: "50%",
        bgcolor: red, transform: "translateX(-50%)",
        boxShadow: `0 0 6px ${red}`, pointerEvents: "none",
      }} />
    );
  });

  // Loop region — positioned by translating a span inside the same scroll layer.
  const loopEl = loopRegion && durationSec > 0 ? (() => {
    const tx0 = width / 2 - (baseProgressRef.current * durationSec) * pxPerSec;
    const left = tx0 + loopRegion.inSec * pxPerSec;
    const w = (loopRegion.outSec - loopRegion.inSec) * pxPerSec;
    // We draw it in a wrapper that also gets transform-animated by RAF is
    // overkill; simpler: attach to same transform by placing inside the
    // played layer. But that'd tint by clip. Easiest: render here and rely on
    // cue-marker-style positioning using `progress` prop (coarse is OK for a
    // loop band).
    const leftPct = ((loopRegion.inSec / durationSec) - progress) / windowPctStatic * 50 + 50;
    const wPct = (loopRegion.outSec - loopRegion.inSec) / durationSec / windowPctStatic * 50;
    void left; void w; void tx0;
    return (
      <Box sx={{
        position: "absolute", top: 0, height: "100%",
        left: `${leftPct}%`, width: `${wPct * 2}%`,
        bgcolor: `${red}33`,
        borderLeft: `1px solid ${red}`,
        borderRight: `1px solid ${red}`,
        pointerEvents: "none",
      }} />
    );
  })() : null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scratchable || !durationSec) return;
    e.preventDefault();
    try { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    draggingRef.current = true;
    dragLastXRef.current = e.clientX;
    dragLastTsRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
    dragSecRef.current = (baseProgressRef.current || progress) * durationSec;
    overrideProgressRef.current = Math.max(0, Math.min(1, dragSecRef.current / durationSec));
    onScratchStart?.(dragSecRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !scratchable || !durationSec) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const dt = Math.max(1, now - dragLastTsRef.current);
    const dx = dragLastXRef.current - e.clientX;
    const pps = rect.width / windowSeconds;
    const dSec = pps > 0 ? dx / pps : 0;
    dragSecRef.current = Math.max(0, Math.min(durationSec, dragSecRef.current + dSec));
    overrideProgressRef.current = dragSecRef.current / durationSec;
    const speed = dSec / (dt / 1000);
    const isReversed = speed < 0;
    dragLastXRef.current = e.clientX;
    dragLastTsRef.current = now;
    onScratchMove?.(speed, isReversed, dragSecRef.current);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    const finalSec = dragSecRef.current;
    overrideProgressRef.current = null;
    onScratchEnd?.(finalSec);
  };

  const canvasStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    height,
    willChange: "transform",
    transform: "translate3d(0,0,0)",
    pointerEvents: "none",
    imageRendering: "auto",
  };

  return (
    <Box
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      sx={{
        position: "relative",
        width: "100%",
        height,
        bgcolor: "#000",
        borderRadius: 0.5,
        overflow: "hidden",
        border: `1px solid ${alpha(red, 0.15)}`,
        cursor: scratchable ? "grab" : "default",
        touchAction: scratchable ? "none" : "auto",
        "&:active": scratchable ? { cursor: "grabbing" } : undefined,
      }}
    >
      {/* Played layer — clipped to left half of the container */}
      <Box sx={{
        position: "absolute", inset: 0,
        clipPath: "inset(0 50% 0 0)",
        WebkitClipPath: "inset(0 50% 0 0)",
      }}>
        <canvas ref={playedCanvasRef} style={canvasStyle} />
      </Box>
      {/* Unplayed layer — clipped to right half */}
      <Box sx={{
        position: "absolute", inset: 0,
        clipPath: "inset(0 0 0 50%)",
        WebkitClipPath: "inset(0 0 0 50%)",
      }}>
        <canvas ref={mainCanvasRef} style={canvasStyle} />
      </Box>

      {/* Static grid */}
      <Box sx={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 40px)",
        backgroundPosition: `${(width / 2) % 40}px 0`,
      }} />

      {loopEl}
      {cueMarkers}

      {/* Fixed centre playhead */}
      <Box sx={{
        position: "absolute", top: 0, left: "50%",
        width: 2, height: "100%",
        bgcolor: red, boxShadow: `0 0 8px ${red}`,
        transform: "translateX(-50%)",
        pointerEvents: "none",
      }} />
    </Box>
  );
}

// Helper shared by the two paint passes.
function paintInto(
  ctx: CanvasRenderingContext2D,
  peaks: number[],
  color: string,
  logicalWidth: number,
  durationSec: number,
  height: number,
  pxPerSec: number,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.lineCap = "round";
  const mid = height / 2;
  const amp = height * 0.46;
  const n = peaks.length;
  const stepPx = 1.5;
  const secPerPx = 1 / pxPerSec;
  for (let x = 0; x < logicalWidth; x += stepPx) {
    const t0 = x * secPerPx;
    const t1 = (x + stepPx) * secPerPx;
    const i0 = Math.floor((t0 / durationSec) * n);
    const i1 = Math.min(n, Math.ceil((t1 / durationSec) * n));
    let peak = 0;
    for (let i = i0; i < i1; i++) {
      const v = peaks[i];
      if (v > peak) peak = v;
    }
    const h = Math.max(0.5, peak * amp);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, mid - h);
    ctx.lineTo(x + 0.5, mid + h);
    ctx.stroke();
  }
}
