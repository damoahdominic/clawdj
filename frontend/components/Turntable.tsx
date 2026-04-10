"use client";

import { useRef, useEffect } from "react";
import { useScratch } from "../hooks/useScratch";
import { useAudioEngine } from "../hooks/useAudioEngine";

export interface TurntableProps {
  deckId: "A" | "B";
  isPlaying: boolean;
  coverUrl?: string;
  bpm?: number;
  accentColor?: "red" | "orange";
  onScratchStart?: () => void;
  onScratchEnd?: () => void;
  onSeek?: (timeDelta: number) => void;
}

/**
 * Scratchable vinyl turntable component.
 *
 * Renders an SVG record that:
 * - Auto-spins at BPM-scaled speed while playing (via RAF, no React state updates)
 * - Lets the user drag to scratch when playing (pointer events via useScratch)
 * - Plays vinyl noise + sawtooth scratch sounds via Web Audio API (useAudioEngine)
 */
export function Turntable({
  deckId,
  isPlaying,
  coverUrl,
  bpm = 120,
  accentColor = "red",
  onScratchStart,
  onScratchEnd,
  onSeek,
}: TurntableProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const angleRef = useRef(0);
  const rafRef = useRef<number>(0);
  const { initVinylNoise, startScratch, updateScratch, stopScratch, resumeContext, dispose } =
    useAudioEngine();

  // Clean up AudioContext on unmount
  useEffect(() => () => dispose(), [dispose]);

  const handleScratchStart = () => {
    resumeContext();
    initVinylNoise();
    startScratch(0);
    onScratchStart?.();
  };

  const handleScratchMove = (velocity: number) => {
    updateScratch(velocity);
  };

  const handleScratchEnd = () => {
    stopScratch();
    onScratchEnd?.();
  };

  const { isDragging } = useScratch(svgRef as React.RefObject<SVGSVGElement>, {
    isActive: isPlaying,
    onScratchStart: handleScratchStart,
    onScratchMove: handleScratchMove,
    onScratchEnd: handleScratchEnd,
    onSeek,
  });

  // Auto-spin via RAF — updates DOM directly, no React state, no re-renders
  useEffect(() => {
    if (!isPlaying || isDragging) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    const bpmRate = bpm > 0 ? bpm / 120 : 1;
    const degreesPerFrame = 1.8 * bpmRate;

    const spin = () => {
      angleRef.current = (angleRef.current + degreesPerFrame) % 360;
      const group = svgRef.current?.getElementById("rg_" + deckId);
      if (group) {
        group.setAttribute("transform", `rotate(${angleRef.current}, 100, 100)`);
      }
      rafRef.current = requestAnimationFrame(spin);
    };
    rafRef.current = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, isDragging, bpm, deckId]);

  // When scratching: sync SVG rotation with pointer angle (set by useScratch)
  // useScratch drives the DOM directly via the returned angle; we just sync angleRef.
  // (The SVG transform during dragging is updated by the handlePointerMove via setAngle,
  //  but since we manage the DOM directly in auto-spin, we need to also update during drag.)
  // We use a separate effect to keep it clean.
  const dragAngleRef = useRef(0);
  const prevDraggingRef = useRef(false);

  useEffect(() => {
    if (isDragging) {
      prevDraggingRef.current = true;
    } else if (prevDraggingRef.current) {
      // Just released — restore spin from current DOM angle
      prevDraggingRef.current = false;
    }
  }, [isDragging]);

  // Wire up pointer-move during drag to directly rotate the SVG group
  useEffect(() => {
    if (!isDragging) return;
    const svg = svgRef.current;
    if (!svg) return;

    const handleMove = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
      const displayAngle = angle - dragAngleRef.current;
      const group = svg.getElementById("rg_" + deckId);
      if (group) {
        group.setAttribute("transform", `rotate(${displayAngle}, 100, 100)`);
        angleRef.current = displayAngle;
      }
    };

    // Set the drag start offset
    const handleDown = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
      dragAngleRef.current = angle - angleRef.current;
    };

    window.addEventListener("pointermove", handleMove);
    return () => window.removeEventListener("pointermove", handleMove);
  }, [isDragging, deckId]);

  const color = accentColor === "red" ? "#ef4444" : "#f97316";
  const gradientEnd = accentColor === "red" ? "#7f1d1d" : "#7c2d12";
  const gradientMid = accentColor === "red" ? "#991b1b" : "#9a3412";
  const glowColor =
    accentColor === "red" ? "rgba(239,68,68,0.45)" : "rgba(249,115,22,0.45)";
  const vinylId = `vinyl-${deckId}`;
  const labelId = `label-${deckId}`;
  const clipId = `lclip-${deckId}`;

  return (
    <div className="relative flex items-center justify-center">
      <svg
        ref={svgRef}
        viewBox="0 0 200 200"
        width="200"
        height="200"
        className={`select-none ${
          isPlaying
            ? isDragging
              ? "cursor-grabbing"
              : "cursor-grab"
            : "cursor-default"
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

        {/* Record group — rotates */}
        <g id={`rg_${deckId}`}>
          {/* Vinyl body */}
          <circle cx="100" cy="100" r="96" fill={`url(#${vinylId})`} />
          {/* Subtle sheen overlay */}
          <circle
            cx="100"
            cy="100"
            r="96"
            fill="none"
            stroke="rgba(255,255,255,0.025)"
            strokeWidth="0.4"
          />

          {/* Label */}
          <circle cx="100" cy="100" r="26" fill={`url(#${labelId})`} />

          {/* Cover art clipped to label circle */}
          {coverUrl && (
            <image
              href={coverUrl}
              x="74"
              y="74"
              width="52"
              height="52"
              clipPath={`url(#${clipId})`}
              preserveAspectRatio="xMidYMid slice"
              style={{ opacity: 0.85 }}
            />
          )}

          {/* Deck letter */}
          <text
            x="100"
            y={coverUrl ? "108" : "106"}
            textAnchor="middle"
            fontSize={coverUrl ? "10" : "16"}
            fontWeight="bold"
            fill={coverUrl ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.85)"}
            fontFamily="monospace"
            style={{ userSelect: "none" }}
          >
            {deckId}
          </text>

          {/* Center spindle hole */}
          <circle cx="100" cy="100" r="3.5" fill="#030303" />
        </g>

        {/* Tonearm (static) */}
        <line
          x1="182"
          y1="22"
          x2="148"
          y2="82"
          stroke="#666"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="148" cy="84" r="5" fill="#777" />
        <circle cx="148" cy="84" r="2.5" fill={color} />
      </svg>

      {/* Scratch glow ring when active */}
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
