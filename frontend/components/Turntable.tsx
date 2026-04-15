"use client";

import { useRef, useEffect } from "react";
import { Box } from "@mui/material";
import { useScratch } from "../hooks/useScratch";
import { useAudioEngine, type AudioEngineApi } from "../hooks/useAudioEngine";

export interface TurntableProps {
  deckId: "A" | "B";
  isPlaying: boolean;
  audioUrl?: string;
  /** 0–1; controlled externally by the crossfader. */
  volume?: number;
  coverUrl?: string;
  bpm?: number;
  /** Expected track duration in seconds (used for physics before audio loads). */
  duration?: number;
  accentColor?: "red" | "redDark";
  /** SVG viewport size in px; defaults to 200. */
  size?: number;
  onScratchStart?: () => void;
  onScratchEnd?: () => void;
  /** Fires every RAF frame with the current playback position. */
  onTimeUpdate?: (secondsPlayed: number, duration: number) => void;
  /** Increment to trigger an auto-scratch effect (for crossfade transitions). */
  autoScratchTrigger?: number;
  /** Parent captures the audio engine instance here for EQ/tempo/cue/loop access. */
  engineRef?: React.MutableRefObject<AudioEngineApi | null>;
}

export function Turntable({
  deckId,
  isPlaying,
  audioUrl,
  volume = 1,
  coverUrl,
  bpm = 120,
  duration = 30,
  accentColor = "red",
  size = 200,
  onScratchStart,
  onScratchEnd,
  onTimeUpdate,
  autoScratchTrigger = 0,
  engineRef,
}: TurntableProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const engine = useAudioEngine();

  // Publish engine to parent exactly once (methods are stable via useCallback).
  useEffect(() => {
    if (engineRef) engineRef.current = engine;
    return () => {
      if (engineRef && engineRef.current === engine) engineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable refs so closures in the RAF loop always see latest values
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const onTimeUpdateRef = useRef(onTimeUpdate);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);

  const audioLoadedRef = useRef(false);
  const trackDurationRef = useRef(duration);
  useEffect(() => { trackDurationRef.current = duration; }, [duration]);

  const autoScratchingRef = useRef(false);
  const prevAutoScratchTrigger = useRef(0);
  const isDraggingRef = useRef(false);
  /** True for the whole scratch lifetime: from onDragStart through the
   *  post-release coast, until onCoastEnd fires. */
  const isScratchingRef = useRef(false);

  // ── useScratch ─────────────────────────────────────────────────────────────

  const { isDragging, angleRef, resetPosition } = useScratch(
    svgRef as React.RefObject<SVGSVGElement | HTMLElement | null>,
    {
      isActive: isPlaying,
      duration,
      getCurrentTime: engine.getCurrentTime,
      onLoop: ({ playbackSpeed, isReversed, secondsPlayed }) => {
        // 1. Update SVG rotation directly (no React state, no re-render)
        const group = svgRef.current?.getElementById("rg_" + deckId);
        if (group) {
          const deg = ((angleRef.current * 180) / Math.PI) % 360;
          group.setAttribute("transform", `rotate(${deg}, 100, 100)`);
        }

        // 2. Drive the audio engine — use the scratch path for the full
        //    drag + coast window so inertia stays authentic.
        if (isPlayingRef.current && audioLoadedRef.current && !autoScratchingRef.current) {
          if (isScratchingRef.current) {
            engine.updateScratch(playbackSpeed, isReversed, secondsPlayed);
          } else {
            engine.updateSpeed(playbackSpeed, isReversed, secondsPlayed);
          }
        }

        // 3. Report position upstream
        const dur = trackDurationRef.current;
        onTimeUpdateRef.current?.(secondsPlayed, dur);
      },
      onDragStart: () => {
        onScratchStart?.();
        isDraggingRef.current = true;
        isScratchingRef.current = true;
        // Compute current seconds from the drag angle and enter scratch mode.
        const maxAngle = Math.max(1, trackDurationRef.current) * 0.75 * Math.PI * 2;
        const clamped = Math.max(0, Math.min(maxAngle, angleRef.current));
        const seconds = maxAngle > 0 ? (clamped / maxAngle) * trackDurationRef.current : 0;
        if (isPlayingRef.current && audioLoadedRef.current) {
          engine.beginScratch(seconds);
        }
      },
      onDragEnd: () => {
        // Stop tracking the pointer but leave scratch audio engaged — the
        // coast phase below keeps feeding updateScratch until inertia dies.
        onScratchEnd?.();
        isDraggingRef.current = false;
      },
      onCoastEnd: (seconds) => {
        isScratchingRef.current = false;
        if (isPlayingRef.current && audioLoadedRef.current) {
          engine.endScratch(seconds);
        }
      },
    },
  );

  const spinTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load track ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!audioUrl) return;
    audioLoadedRef.current = false;
    resetPosition();
    engine.loadTrack(audioUrl).then(async () => {
      const actualDur = engine.durationRef.current;
      if (actualDur > 0) trackDurationRef.current = actualDur;
      audioLoadedRef.current = true;
      if (isPlayingRef.current) {
        await engine.resume();
        await engine.play(0);
        // Spin-up ramp on fresh track load
        const el = engine.audioElRef?.current;
        if (el) {
          if (spinTimerRef.current) { clearInterval(spinTimerRef.current); spinTimerRef.current = null; }
          const target = Math.max(0.0625, el.playbackRate);
          el.playbackRate = 0.0625;
          let rate = 0.0625;
          const step = (target - 0.0625) / 20;
          spinTimerRef.current = setInterval(() => {
            rate = Math.min(target, rate + step);
            el.playbackRate = rate;
            if (rate >= target) {
              if (spinTimerRef.current) { clearInterval(spinTimerRef.current); spinTimerRef.current = null; }
            }
          }, 33);
        }
      }
    }).catch(() => { /* handled in engine */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  // ── Play / pause with vinyl spin-down / spin-up ─────────────────────────

  useEffect(() => {
    if (spinTimerRef.current) { clearInterval(spinTimerRef.current); spinTimerRef.current = null; }

    const el = engine.audioElRef?.current;

    if (isPlaying) {
      if (audioLoadedRef.current) {
        engine.resume().then(() => {
          const t = engine.getCurrentTime() ?? 0;
          // Snapshot the intended target rate BEFORE engine.play overwrites it,
          // then kick off engine.play without awaiting. engine.play sets
          // playbackRate = baseRate synchronously at the top of its body, so
          // we synchronously override right after — this lands before the
          // audio element's play() promise resolves, preventing a brief
          // full-speed burst.
          const target = el ? Math.max(0.0625, el.playbackRate || 1) : 1;
          const playPromise = engine.play(t);
          if (el) {
            el.playbackRate = 0.0625;
            const startRate = 0.0625;
            const durMs = 900;
            const startTs = performance.now();
            const tick = () => {
              const elapsed = performance.now() - startTs;
              const u = Math.min(1, elapsed / durMs);
              // easeOutCubic — starts slow, accelerates, settles at target
              const eased = 1 - Math.pow(1 - u, 3);
              const rate = startRate + (target - startRate) * eased;
              el.playbackRate = rate;
              if (u >= 1) {
                if (spinTimerRef.current) { clearInterval(spinTimerRef.current); spinTimerRef.current = null; }
              }
            };
            spinTimerRef.current = setInterval(tick, 16);
          }
          playPromise.catch(() => { /* noop */ });
        });
      }
    } else {
      // Spin-down: ramp playbackRate to minimum over ~600ms, then pause
      if (el && !el.paused) {
        let rate = el.playbackRate || 1;
        const decrement = rate / 18;
        spinTimerRef.current = setInterval(() => {
          rate = Math.max(0.0625, rate - decrement);
          el.playbackRate = rate;
          if (rate <= 0.0625) {
            if (spinTimerRef.current) { clearInterval(spinTimerRef.current); spinTimerRef.current = null; }
            engine.pause();
          }
        }, 33);
      } else {
        engine.pause();
      }
    }

    return () => {
      if (spinTimerRef.current) { clearInterval(spinTimerRef.current); spinTimerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // ── Volume (crossfader) ────────────────────────────────────────────────────

  useEffect(() => {
    engine.setVolume(volume);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume]);

  // ── Auto-scratch (called before crossfade transitions) ────────────────────

  useEffect(() => {
    if (autoScratchTrigger === 0) return;
    if (autoScratchTrigger === prevAutoScratchTrigger.current) return;
    prevAutoScratchTrigger.current = autoScratchTrigger;
    if (!audioLoadedRef.current) return;

    autoScratchingRef.current = true;

    // Step 1: ramp down speed to 0 over 500ms
    const STEPS = 10;
    const INTERVAL = 50;
    let step = 0;
    const rampDown = setInterval(() => {
      step++;
      const spd = 1 - step / STEPS;
      const maxAngle = Math.max(1, trackDurationRef.current) * 0.75 * Math.PI * 2;
      const seconds = maxAngle > 0
        ? (Math.max(0, Math.min(maxAngle, angleRef.current)) / maxAngle) * trackDurationRef.current
        : 0;
      engine.updateSpeed(Math.max(0.0625, spd), false, seconds);
      if (step >= STEPS) {
        clearInterval(rampDown);
        // Step 2: brief reverse scratch (200ms)
        const maxA = Math.max(1, trackDurationRef.current) * 0.75 * Math.PI * 2;
        const secs = maxA > 0
          ? (Math.max(0, Math.min(maxA, angleRef.current)) / maxA) * trackDurationRef.current
          : 0;
        engine.updateSpeed(1, true, secs);
        setTimeout(() => {
          autoScratchingRef.current = false;
        }, 200);
      }
    }, INTERVAL);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScratchTrigger]);

  // ── Background-tab-safe time polling ──────────────────────────────────────
  // RAF in useScratch stops firing when the tab is backgrounded, but <audio>
  // keeps playing. Poll the engine's currentTime on an interval so the parent
  // component's progress check still sees time advancing.
  useEffect(() => {
    const poll = () => {
      if (!audioLoadedRef.current) return;
      // During scratch (drag or coast) the RAF loop is authoritative — the
      // poll would overwrite drag position with stale audioEl.currentTime.
      if (isScratchingRef.current) return;
      const t = engine.getCurrentTime();
      const dur = engine.durationRef.current || trackDurationRef.current;
      if (t > 0) onTimeUpdateRef.current?.(t, dur);
    };
    const id = setInterval(poll, 100);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => engine.dispose(), []);

  // ── Render ─────────────────────────────────────────────────────────────────

  // Side A → red, Side B → light blue. Keeps the two decks visually distinct.
  const isSideA = deckId === "A";
  const color = isSideA ? "#ef4444" : "#38bdf8";
  const gradientMid = isSideA ? "#991b1b" : "#0369a1";
  const gradientEnd = isSideA ? "#7f1d1d" : "#075985";
  const gradientDeep = isSideA ? "#3b0505" : "#082f49";
  const glowColor = isSideA ? "rgba(239,68,68,0.45)" : "rgba(56,189,248,0.45)";
  // accentColor kept as an input hint but deck identity drives palette.
  void accentColor;
  const vinylId = `vinyl-${deckId}`;
  const labelId = `label-${deckId}`;
  const clipId = `lclip-${deckId}`;

  // bpm is kept for future use (tonearm angle, etc.)
  void bpm;

  return (
    <Box sx={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        width={size}
        height={size}
        style={{
          userSelect: "none",
          cursor: isPlaying ? (isDragging ? "grabbing" : "grab") : "default",
          filter: isDragging
            ? `drop-shadow(0 0 14px ${glowColor}) drop-shadow(0 0 28px ${glowColor})`
            : isPlaying
            ? `drop-shadow(0 0 7px ${glowColor})`
            : "drop-shadow(0 4px 8px rgba(0,0,0,0.6))",
          touchAction: "none",
        }}
      >
        <defs>
          <radialGradient id={vinylId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a1a1a" />
            <stop offset="55%" stopColor="#141414" />
            <stop offset="92%" stopColor="#101010" />
            <stop offset="100%" stopColor="#050505" />
          </radialGradient>
          <radialGradient id={`${vinylId}-sheen`} cx="50%" cy="28%" r="65%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="55%" stopColor="rgba(255,255,255,0.02)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <radialGradient id={labelId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={gradientMid} />
            <stop offset="65%" stopColor={gradientEnd} />
            <stop offset="100%" stopColor={gradientDeep} />
          </radialGradient>
          <linearGradient id={`${vinylId}-marker`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0" />
            <stop offset="25%" stopColor={color} stopOpacity="0.9" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.95)" />
          </linearGradient>
          <clipPath id={clipId}>
            <circle cx="100" cy="100" r="72" />
          </clipPath>
        </defs>

        <g id={`rg_${deckId}`}>
          {/* Disc body */}
          <circle cx="100" cy="100" r="96" fill={`url(#${vinylId})`} />
          {/* Concentric groove hints — subtle, modern */}
          {[90, 84, 78, 72, 66, 60, 54, 48, 42, 36, 30].map((r) => (
            <circle key={r} cx="100" cy="100" r={r} fill="none"
              stroke="rgba(255,255,255,0.035)" strokeWidth="0.4" />
          ))}
          {/* Outer bevel */}
          <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
          <circle cx="100" cy="100" r="94" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="0.6" />
          {/* Top-lit sheen for a modern disc look */}
          <circle cx="100" cy="100" r="96" fill={`url(#${vinylId}-sheen)`} pointerEvents="none" />

          {!coverUrl && <circle cx="100" cy="100" r="26" fill={`url(#${labelId})`} />}
          {coverUrl && (
            <image
              href={coverUrl}
              x="28" y="28" width="144" height="144"
              clipPath={`url(#${clipId})`}
              preserveAspectRatio="xMidYMid slice"
              style={{ opacity: 0.96 }}
            />
          )}
          {coverUrl && (
            <circle
              cx="100" cy="100" r="72"
              fill="none"
              stroke={color}
              strokeWidth="1.2"
              opacity="0.5"
            />
          )}
          {!coverUrl && (
            <text
              x="100" y="106"
              textAnchor="middle"
              fontSize="16"
              fontWeight="bold"
              fill="rgba(255,255,255,0.85)"
              fontFamily="monospace"
              style={{ userSelect: "none" }}
            >
              {deckId}
            </text>
          )}
          {/* Radial index marker — sits ON TOP of the album art so the spin
               is always visible. Thick bar + glow, coloured by deck. */}
          <rect
            x="98" y="7" width="4" height="92"
            fill={`url(#${vinylId}-marker)`}
            rx="2"
            opacity="0.95"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
          {/* Spindle hub — modern chrome feel, drawn after the marker so the
               marker tapers cleanly into the hub. */}
          <circle cx="100" cy="100" r="5" fill="#1a1a1a" stroke="rgba(255,255,255,0.4)" strokeWidth="0.7" />
          <circle cx="100" cy="100" r="1.5" fill="#050505" />
        </g>
      </svg>

      {isDragging && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            borderRadius: "50%",
            width: size,
            height: size,
            boxShadow: `0 0 0 2px ${color}88, 0 0 20px 4px ${color}44`,
            animation: "mui-pulse 1.5s ease-in-out infinite",
            "@keyframes mui-pulse": {
              "0%, 100%": { opacity: 1 },
              "50%": { opacity: 0.5 },
            },
          }}
        />
      )}
    </Box>
  );
}
