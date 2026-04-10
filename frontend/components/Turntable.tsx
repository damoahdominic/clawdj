"use client";

import { useRef, useEffect } from "react";
import { useScratch } from "../hooks/useScratch";
import { useAudioEngine } from "../hooks/useAudioEngine";

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
  accentColor?: "red" | "orange";
  onScratchStart?: () => void;
  onScratchEnd?: () => void;
  /** Fires every RAF frame with the current playback position. */
  onTimeUpdate?: (secondsPlayed: number, duration: number) => void;
  /** Increment to trigger an auto-scratch effect (for crossfade transitions). */
  autoScratchTrigger?: number;
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
  onScratchStart,
  onScratchEnd,
  onTimeUpdate,
  autoScratchTrigger = 0,
}: TurntableProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const engine = useAudioEngine();

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

  // ── useScratch ─────────────────────────────────────────────────────────────

  const { isDragging, angleRef, resetPosition } = useScratch(
    svgRef as React.RefObject<SVGSVGElement | HTMLElement | null>,
    {
      isActive: isPlaying,
      duration,
      onLoop: ({ playbackSpeed, isReversed, secondsPlayed }) => {
        // 1. Update SVG rotation directly (no React state, no re-render)
        const group = svgRef.current?.getElementById("rg_" + deckId);
        if (group) {
          const deg = ((angleRef.current * 180) / Math.PI) % 360;
          group.setAttribute("transform", `rotate(${deg}, 100, 100)`);
        }

        // 2. Drive the audio engine
        if (isPlayingRef.current && audioLoadedRef.current && !autoScratchingRef.current) {
          engine.updateSpeed(playbackSpeed, isReversed, secondsPlayed);
        }

        // 3. Report position upstream
        const dur = trackDurationRef.current;
        onTimeUpdateRef.current?.(secondsPlayed, dur);
      },
      onDragStart: () => onScratchStart?.(),
      onDragEnd: (seconds) => {
        onScratchEnd?.();
        if (isPlayingRef.current && audioLoadedRef.current) {
          engine.play(seconds);
        }
      },
    },
  );

  // ── Load track ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!audioUrl) return;
    audioLoadedRef.current = false;
    resetPosition();
    engine.loadTrack(audioUrl).then(() => {
      const actualDur = engine.durationRef.current;
      if (actualDur > 0) trackDurationRef.current = actualDur;
      audioLoadedRef.current = true;
      if (isPlayingRef.current) {
        engine.resume();
        engine.play(0);
      }
    }).catch(() => { /* handled in engine */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  // ── Play / pause ───────────────────────────────────────────────────────────

  useEffect(() => {
    engine.resume();
    if (isPlaying) {
      if (audioLoadedRef.current) engine.play(0);
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
      engine.updateSpeed(Math.max(0.001, spd), false, seconds);
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

  // ── Cleanup ────────────────────────────────────────────────────────────────

  useEffect(() => () => engine.dispose(), [engine]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const color = accentColor === "red" ? "#ef4444" : "#f97316";
  const gradientEnd = accentColor === "red" ? "#7f1d1d" : "#7c2d12";
  const gradientMid = accentColor === "red" ? "#991b1b" : "#9a3412";
  const glowColor = accentColor === "red" ? "rgba(239,68,68,0.45)" : "rgba(249,115,22,0.45)";
  const vinylId = `vinyl-${deckId}`;
  const labelId = `label-${deckId}`;
  const clipId = `lclip-${deckId}`;

  // bpm is kept for future use (tonearm angle, etc.)
  void bpm;

  return (
    <div className="relative flex items-center justify-center">
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        width="200"
        height="200"
        className={`select-none ${
          isPlaying ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
        }`}
        style={{
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
            <stop offset="100%" stopColor={accentColor === "red" ? "#3b0505" : "#3b1105"} />
          </radialGradient>
          <clipPath id={clipId}>
            <circle cx="100" cy="100" r="26" />
          </clipPath>
        </defs>

        <g id={`rg_${deckId}`}>
          <circle cx="100" cy="100" r="96" fill={`url(#${vinylId})`} />
          <circle cx="100" cy="100" r="96" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="0.4" />
          <circle cx="100" cy="100" r="26" fill={`url(#${labelId})`} />
          {coverUrl && (
            <image
              href={coverUrl}
              x="74" y="74" width="52" height="52"
              clipPath={`url(#${clipId})`}
              preserveAspectRatio="xMidYMid slice"
              style={{ opacity: 0.85 }}
            />
          )}
          <text
            x="100" y={coverUrl ? "108" : "106"}
            textAnchor="middle"
            fontSize={coverUrl ? "10" : "16"}
            fontWeight="bold"
            fill={coverUrl ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.85)"}
            fontFamily="monospace"
            style={{ userSelect: "none" }}
          >
            {deckId}
          </text>
          <circle cx="100" cy="100" r="3.5" fill="#030303" />
        </g>

        {/* Tonearm (static) */}
        <line x1="182" y1="22" x2="148" y2="82" stroke="#666" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="148" cy="84" r="5" fill="#777" />
        <circle cx="148" cy="84" r="2.5" fill={color} />
      </svg>

      {isDragging && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none animate-pulse"
          style={{
            boxShadow: `0 0 0 2px ${color}88, 0 0 20px 4px ${color}44`,
            borderRadius: "50%",
            width: 200,
            height: 200,
          }}
        />
      )}
    </div>
  );
}
