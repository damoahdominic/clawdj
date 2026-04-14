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
      }
    }).catch(() => { /* handled in engine */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  // ── Play / pause ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (isPlaying) {
      if (audioLoadedRef.current) {
        engine.resume().then(() => {
          const t = engine.getCurrentTime() ?? 0;
          engine.play(t);
        });
      }
      // If not loaded yet, loadTrack().then() handles it
    } else {
      engine.pause();
    }
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

  const isBright = accentColor === "red";
  const color = isBright ? "#ef4444" : "#b71c1c";
  const gradientEnd = isBright ? "#7f1d1d" : "#4a0505";
  const gradientMid = isBright ? "#991b1b" : "#660a0a";
  const glowColor = isBright ? "rgba(239,68,68,0.45)" : "rgba(183,28,28,0.45)";
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
            <stop offset="0%" stopColor="#080808" />
            <stop offset="13%" stopColor="#1a1a1a" />
            <stop offset="14%" stopColor="#0c0c0c" />
            <stop offset="23%" stopColor="#1a1a1a" />
            <stop offset="24%" stopColor="#0c0c0c" />
            <stop offset="33%" stopColor="#191919" />
            <stop offset="34%" stopColor="#0c0c0c" />
            <stop offset="43%" stopColor="#1a1a1a" />
            <stop offset="44%" stopColor="#0c0c0c" />
            <stop offset="53%" stopColor="#191919" />
            <stop offset="54%" stopColor="#0c0c0c" />
            <stop offset="63%" stopColor="#1a1a1a" />
            <stop offset="64%" stopColor="#0c0c0c" />
            <stop offset="73%" stopColor="#191919" />
            <stop offset="74%" stopColor="#0c0c0c" />
            <stop offset="83%" stopColor="#1a1a1a" />
            <stop offset="84%" stopColor="#111" />
            <stop offset="100%" stopColor="#0d0d0d" />
          </radialGradient>
          <radialGradient id={labelId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={gradientMid} />
            <stop offset="65%" stopColor={gradientEnd} />
            <stop offset="100%" stopColor={isBright ? "#3b0505" : "#1f0202"} />
          </radialGradient>
          <clipPath id={clipId}>
            <circle cx="100" cy="100" r="72" />
          </clipPath>
        </defs>

        <g id={`rg_${deckId}`}>
          <circle cx="100" cy="100" r="96" fill={`url(#${vinylId})`} />
          <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="0.4" />
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
          {!coverUrl && <circle cx="100" cy="100" r="3.5" fill="#030303" />}
        </g>

        {/* Tonearm (static) */}
        <line x1="182" y1="22" x2="148" y2="82" stroke="#666" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="148" cy="84" r="5" fill="#777" />
        <circle cx="148" cy="84" r="2.5" fill={color} />
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
