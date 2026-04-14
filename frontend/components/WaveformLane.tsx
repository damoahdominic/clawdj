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
  /** Actual track duration in seconds (used for cue alignment). */
  durationSec?: number;
  /** Loop region in seconds (drawn as a shaded band). */
  loopRegion?: { inSec: number; outSec: number } | null;
  /** Whether the deck is currently playing — drives time extrapolation. */
  isPlaying?: boolean;
  /** Enable drag-to-scratch on this lane. When all three are provided the
   *  canvas becomes an interactive scratch surface. */
  onScratchStart?: (seconds: number) => void;
  onScratchMove?: (speed: number, isReversed: boolean, seconds: number) => void;
  onScratchEnd?: (seconds: number) => void;
}

// ── Module-level peak cache so switching back to a track is instant ───────
const peakCache = new Map<string, number[]>();

interface DrawParams {
  offscreenPlayed: HTMLCanvasElement | null;
  offscreenMain: HTMLCanvasElement | null;
  offscreenLogicalWidth: number;
  width: number;
  height: number;
  windowSeconds: number;
  durationSec: number;
  loopRegion: { inSec: number; outSec: number } | null;
  red: string;
}

/**
 * Build a single offscreen canvas with the full waveform rendered once at a
 * high pixel-per-second rate so that scrolling it each frame via drawImage
 * scales linearly with sub-pixel precision.
 */
function buildOffscreen(
  peaks: number[],
  color: string,
  logicalWidth: number,
  height: number,
): HTMLCanvasElement {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(logicalWidth * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.lineCap = "round";
  const mid = height / 2;
  const amp = height * 0.48;
  const n = peaks.length;
  const stride = logicalWidth / n;
  // Draw one thin bar per peak bucket, centered on its slot.
  for (let i = 0; i < n; i++) {
    const x = i * stride + stride / 2;
    const h = Math.max(0.5, peaks[i] * amp);
    ctx.beginPath();
    ctx.moveTo(x, mid - h);
    ctx.lineTo(x, mid + h);
    ctx.stroke();
  }
  return canvas;
}

function drawFrame(canvas: HTMLCanvasElement | null, progress: number, params: DrawParams) {
  if (!canvas) return;
  const { offscreenPlayed, offscreenMain, offscreenLogicalWidth, width, height, windowSeconds, durationSec, loopRegion, red } = params;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  if (!offscreenPlayed || !offscreenMain) {
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, height / 2 - 1, width, 2);
    return;
  }

  const dur = durationSec > 0 ? durationSec : Math.max(1, windowSeconds * 2);
  const pxPerSec = width / windowSeconds;
  const playSec = progress * dur;
  const viewStartSec = playSec - windowSeconds / 2;

  // Map seconds → offscreen logical pixels.
  const srcPxPerSec = offscreenLogicalWidth / dur;
  const srcViewX = viewStartSec * srcPxPerSec;
  const srcViewW = windowSeconds * srcPxPerSec;
  const srcPlayheadX = playSec * srcPxPerSec;
  // Backing-store coords for the offscreen (DPR-aware).
  const srcScale = offscreenPlayed.width / offscreenLogicalWidth;

  const playheadDstX = width / 2;

  // Helper: draw a logical-x range from an offscreen into [dstX0..dstX1].
  const drawSlice = (
    src: HTMLCanvasElement,
    srcLogicalX0: number,
    srcLogicalX1: number,
    dstX0: number,
    dstX1: number,
  ) => {
    const logW = srcLogicalX1 - srcLogicalX0;
    const dstW = dstX1 - dstX0;
    if (logW <= 0 || dstW <= 0) return;
    // Clip against offscreen bounds.
    let s0 = srcLogicalX0;
    let s1 = srcLogicalX1;
    let d0 = dstX0;
    let d1 = dstX1;
    const scaleLD = dstW / logW;
    if (s0 < 0) { d0 = dstX0 + (-s0) * scaleLD; s0 = 0; }
    if (s1 > offscreenLogicalWidth) { d1 = dstX1 - (s1 - offscreenLogicalWidth) * scaleLD; s1 = offscreenLogicalWidth; }
    if (s1 <= s0 || d1 <= d0) return;
    ctx.drawImage(
      src,
      s0 * srcScale, 0, (s1 - s0) * srcScale, src.height,
      d0, 0, d1 - d0, height,
    );
  };

  // Played half (left of centre): srcViewX → srcPlayheadX mapped to 0 → playheadDstX.
  drawSlice(offscreenPlayed, srcViewX, srcPlayheadX, 0, playheadDstX);
  // Unplayed half (right of centre).
  drawSlice(offscreenMain, srcPlayheadX, srcViewX + srcViewW, playheadDstX, width);

  if (loopRegion && dur > 0) {
    const loopX1 = (loopRegion.inSec - viewStartSec) * pxPerSec;
    const loopX2 = (loopRegion.outSec - viewStartSec) * pxPerSec;
    if (loopX2 > 0 && loopX1 < width) {
      ctx.fillStyle = `${red}33`;
      ctx.fillRect(Math.max(0, loopX1), 0, Math.min(width, loopX2) - Math.max(0, loopX1), height);
      ctx.strokeStyle = red;
      ctx.lineWidth = 1;
      if (loopX1 >= 0 && loopX1 <= width) {
        ctx.beginPath(); ctx.moveTo(loopX1, 0); ctx.lineTo(loopX1, height); ctx.stroke();
      }
      if (loopX2 >= 0 && loopX2 <= width) {
        ctx.beginPath(); ctx.moveTo(loopX2, 0); ctx.lineTo(loopX2, height); ctx.stroke();
      }
    }
  }

  // Static grid overlay.
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  for (let x = (width / 2) % 40; x < width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
}

/**
 * Decode the audio file (via OfflineAudioContext) once and reduce it to a
 * normalized array of ~2000 peak samples. Cached by URL.
 */
async function computePeaks(url: string, bucketCount = 2000): Promise<number[]> {
  const cached = peakCache.get(url);
  if (cached) return cached;

  const res = await fetch(url);
  const arrayBuf = await res.arrayBuffer();
  // Use a short-lived context just for decoding.
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
  onScratchStart,
  onScratchMove,
  onScratchEnd,
}: WaveformLaneProps) {
  const scratchable = !!(onScratchStart && onScratchMove && onScratchEnd);
  const theme = useTheme();
  const red = theme.palette.primary.main;
  const waveMain = accent === "bright" ? "#c9c9c9" : "#888";
  const wavePlayed = accent === "bright" ? theme.palette.primary.light : theme.palette.primary.dark;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [width, setWidth] = useState(600);

  // Baseline progress from the parent, plus the wallclock time it arrived.
  // The RAF loop extrapolates forward from this using elapsed wallclock so
  // scrolling is buttery even though the parent only polls at ~17Hz.
  const baseProgressRef = useRef(progress);
  const baseProgressTimeRef = useRef<number>(
    typeof performance !== "undefined" ? performance.now() : Date.now()
  );
  const isPlayingRef = useRef(isPlaying);
  const durationSecRef = useRef(durationSec);

  // Drag-to-scratch local state. When dragging, overrideProgressRef takes
  // precedence in the RAF loop so the waveform scrolls with the pointer.
  const draggingRef = useRef(false);
  const overrideProgressRef = useRef<number | null>(null);
  const dragLastXRef = useRef(0);
  const dragLastTsRef = useRef(0);
  const dragSecRef = useRef(0);
  const dragLastDirRef = useRef<1 | -1>(1);

  useEffect(() => {
    // Only reset the extrapolation baseline when the incoming progress
    // differs meaningfully from what we'd have predicted. This lets the RAF
    // loop keep ticking forward smoothly instead of jumping back every poll.
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const dur = durationSecRef.current;
    const predicted = isPlayingRef.current && dur > 0
      ? baseProgressRef.current + ((now - baseProgressTimeRef.current) / 1000) / dur
      : baseProgressRef.current;
    const drift = Math.abs(progress - predicted);
    // Snap on seeks, paused updates, or significant drift; otherwise ignore
    // tiny corrections so playback motion stays uniform.
    if (!isPlayingRef.current || drift > 0.01) {
      baseProgressRef.current = progress;
      baseProgressTimeRef.current = now;
    }
  }, [progress]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    // When play state flips, re-anchor so extrapolation starts from here.
    baseProgressRef.current = progress;
    baseProgressTimeRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  useEffect(() => {
    durationSecRef.current = durationSec;
  }, [durationSec]);

  // Resize observer for the container.
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

  // Load peaks when the track changes.
  useEffect(() => {
    let cancelled = false;
    if (!audioUrl) { setPeaks(null); return; }
    computePeaks(audioUrl)
      .then((p) => { if (!cancelled) setPeaks(p); })
      .catch(() => { if (!cancelled) setPeaks(null); });
    return () => { cancelled = true; };
  }, [audioUrl]);

  // Resize the canvas backing store whenever width/height changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }, [width, height]);

  // Offscreen canvases: the full waveform pre-rendered once per track + color
  // scheme. Each frame just slices a window out via drawImage — that's what
  // gives us pixel-smooth sub-pixel scrolling instead of bucket-snapped bars.
  const offscreenPlayedRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenMainRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenLogicalWidthRef = useRef<number>(0);

  useEffect(() => {
    if (!peaks || peaks.length === 0) {
      offscreenPlayedRef.current = null;
      offscreenMainRef.current = null;
      offscreenLogicalWidthRef.current = 0;
      return;
    }
    // Render at 3 logical px per bucket — plenty of resolution for smooth
    // scaling down to whatever the visible canvas size ends up being.
    const logicalWidth = peaks.length * 3;
    offscreenPlayedRef.current = buildOffscreen(peaks, wavePlayed, logicalWidth, height);
    offscreenMainRef.current = buildOffscreen(peaks, waveMain, logicalWidth, height);
    offscreenLogicalWidthRef.current = logicalWidth;
  }, [peaks, height, wavePlayed, waveMain]);

  // Keep latest draw params in a ref so the RAF loop can read them without
  // re-subscribing on every prop change.
  const drawParamsRef = useRef({
    offscreenPlayed: null as HTMLCanvasElement | null,
    offscreenMain: null as HTMLCanvasElement | null,
    offscreenLogicalWidth: 0,
    width,
    height,
    windowSeconds,
    durationSec,
    loopRegion,
    red,
  });
  useEffect(() => {
    drawParamsRef.current = {
      offscreenPlayed: offscreenPlayedRef.current,
      offscreenMain: offscreenMainRef.current,
      offscreenLogicalWidth: offscreenLogicalWidthRef.current,
      width,
      height,
      windowSeconds,
      durationSec,
      loopRegion,
      red,
    };
  }, [peaks, width, height, windowSeconds, durationSec, loopRegion, red, wavePlayed, waveMain]);

  // Single RAF loop: redraws at the committed progress position every frame.
  // No easing — the quantized progress effect handles all smoothing.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);

      // When the user is scratching the waveform, their drag is authoritative.
      let p: number;
      if (overrideProgressRef.current !== null) {
        p = overrideProgressRef.current;
      } else if (isPlayingRef.current && durationSecRef.current > 0) {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const elapsed = (now - baseProgressTimeRef.current) / 1000;
        p = baseProgressRef.current + elapsed / durationSecRef.current;
        if (p < 0) p = 0;
        else if (p > 1) p = 1;
      } else {
        p = baseProgressRef.current;
      }

      drawFrame(canvasRef.current, p, drawParamsRef.current);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Memoized static values used by the cue-marker overlay (don't need RAF).
  const windowPctStatic = useMemo(
    () => (durationSec > 0 ? windowSeconds / durationSec : 1),
    [durationSec, windowSeconds]
  );

  // Cue point markers positioned relative to scroll window.
  // Uses prop progress (not smoothed) — cue dots don't need sub-frame easing.
  const cueMarkers = cuePoints.map((p, i) => {
    const offset = p - progress;
    const leftPct = 50 + (offset / windowPctStatic) * 50;
    if (leftPct < -2 || leftPct > 102) return null;
    return (
      <Box
        key={i}
        sx={{
          position: "absolute",
          top: 4,
          left: `${leftPct}%`,
          width: 7,
          height: 7,
          borderRadius: "50%",
          bgcolor: red,
          transform: "translateX(-50%)",
          boxShadow: `0 0 6px ${red}`,
          pointerEvents: "none",
        }}
      />
    );
  });

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
    // Positive dx (user moved the pointer left) = forward scrub because the
    // waveform normally scrolls leftward as time advances past the playhead.
    const dx = dragLastXRef.current - e.clientX;
    const pxPerSec = rect.width / windowSeconds;
    const dSec = pxPerSec > 0 ? dx / pxPerSec : 0;

    dragSecRef.current = Math.max(0, Math.min(durationSec, dragSecRef.current + dSec));
    overrideProgressRef.current = dragSecRef.current / durationSec;

    // Speed in natural-playback units (1 == normal forward rate).
    const speed = dSec / (dt / 1000);
    const isReversed = speed < 0;
    dragLastDirRef.current = isReversed ? -1 : 1;

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
      <canvas ref={canvasRef} style={{ display: "block", pointerEvents: "none" }} />
      {cueMarkers}
      {/* Fixed center playhead */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: 2,
          height: "100%",
          bgcolor: red,
          boxShadow: `0 0 8px ${red}`,
          transform: "translateX(-50%)",
          pointerEvents: "none",
        }}
      />
    </Box>
  );
}
