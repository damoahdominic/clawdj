"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, ClickAwayListener, IconButton, Paper, Popper, Slider, Stack, Tooltip, Typography, Button, useMediaQuery } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import { Turntable } from "./Turntable";
import { Crossfader } from "./Crossfader";
import { Knob } from "./Knob";
import { WaveformLane } from "./WaveformLane";
import { darkBrushedPanel, darkBrushedSub, machinedSeam, machinedButton } from "./metal";
import type { AudioEngineApi } from "../hooks/useAudioEngine";
import type { EffectDef } from "./EffectsPanel";

export interface DeckTrack {
  title: string;
  artist: string;
  cover?: string;
  bpm?: number;
  album?: string;
  audioUrl?: string;
  preview?: string;
  duration?: number;
}

interface DeckProps {
  deckId: "A" | "B";
  track: DeckTrack | null;
  isPlaying: boolean;
  isScratchActive?: boolean;
  volume?: number;
  autoScratchTrigger?: number;
  onScratchStart?: () => void;
  onScratchEnd?: () => void;
  onSeek?: (delta: number) => void;
  onPlayPause: () => void;
  onTimeUpdate?: (seconds: number, duration: number) => void;
}

interface DeckLayoutProps {
  deckA: Omit<DeckProps, "deckId">;
  deckB: Omit<DeckProps, "deckId">;
  crossfaderValue: number;
  onCrossfaderChange: (value: number) => void;
  onSkipPrev: () => void;
  onSkipNext: () => void;
  canSkipPrev: boolean;
  canSkipNext: boolean;
  isCrossfading: boolean;
  currentIndex: number;
  playlistLength: number;
  progress: number;
  /** 0–1 position where the auto-crossfade fires */
  switchPoint: number;
  onSwitchPointChange?: (v: number) => void;
  crossfadeMs: number;
  deckAProgress?: number;
  deckBProgress?: number;
  effects?: EffectDef[];
  playingEffects?: Set<string>;
  onTriggerEffect?: (name: string) => void;
}

type AccentTone = "red" | "redDark";

// ─────────────────────────────────────────────────────────────
// Per-deck control state bundle — kept in DeckLayout so EQ/tempo/etc. can be
// shared between the DeckSide (tempo/pitch/sync) and ChannelControls (EQ/cue/loop).
// ─────────────────────────────────────────────────────────────
interface DeckCtrl {
  // EQ in dB (−12 .. +12, 0 = flat)
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  setEqLow: (v: number) => void;
  setEqMid: (v: number) => void;
  setEqHigh: (v: number) => void;

  // Tempo (coarse base rate) 0.85..1.15, center 1.0
  tempo: number;
  setTempo: (v: number) => void;
  // Pitch slider (fine nudge) −1..+1 mapping to ±3%
  pitch: number;
  setPitch: (v: number) => void;

  // Cue points (seconds | null) — slots 0..3
  cues: (number | null)[];
  toggleCue: (idx: number, shift?: boolean) => void;

  // Loop
  loopIn: number | null;
  loopOut: number | null;
  loopActive: boolean;
  markLoopIn: () => void;
  markLoopOut: () => void;
  toggleLoop: () => void;

  // SYNC toggle
  sync: boolean;
  toggleSync: () => void;
}

function useDeckCtrl(
  engineRef: React.MutableRefObject<AudioEngineApi | null>,
  selfTrack: DeckTrack | null,
  otherTrack: DeckTrack | null,
  otherDeckCtrlRef: React.MutableRefObject<{ tempo: number; pitch: number } | null>,
): DeckCtrl {
  const [eqLow, setEqLow] = useState(0);
  const [eqMid, setEqMid] = useState(0);
  const [eqHigh, setEqHigh] = useState(0);
  const [tempo, setTempo] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [cues, setCues] = useState<(number | null)[]>([null, null, null, null]);
  const [loopIn, setLoopIn] = useState<number | null>(null);
  const [loopOut, setLoopOut] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);
  const [sync, setSync] = useState(false);

  // Clear cues/loop when track changes.
  const trackKey = selfTrack?.audioUrl || selfTrack?.preview || null;
  useEffect(() => {
    setCues([null, null, null, null]);
    setLoopIn(null);
    setLoopOut(null);
    setLoopActive(false);
    setSync(false);
  }, [trackKey]);

  // Push EQ → engine
  useEffect(() => {
    engineRef.current?.setEq(eqLow, eqMid, eqHigh);
  }, [eqLow, eqMid, eqHigh, engineRef]);

  // Compute & push effective base rate → engine
  useEffect(() => {
    const effective = tempo * (1 + pitch * 0.03);
    engineRef.current?.setBaseRate(effective);
  }, [tempo, pitch, engineRef]);

  // SYNC: when enabled, adjust THIS deck's tempo so its BPM matches the other's
  useEffect(() => {
    if (!sync) return;
    const selfBpm = selfTrack?.bpm ?? 0;
    const otherBpm = otherTrack?.bpm ?? 0;
    const otherCtrl = otherDeckCtrlRef.current;
    if (!selfBpm || !otherBpm || !otherCtrl) return;
    // Match effective BPM: selfBpm * selfRate = otherBpm * otherRate
    const otherEffectiveRate = otherCtrl.tempo * (1 + otherCtrl.pitch * 0.03);
    const target = (otherBpm * otherEffectiveRate) / selfBpm;
    // Clamp to tempo slider range and zero pitch.
    setTempo(Math.max(0.85, Math.min(1.15, target)));
    setPitch(0);
  }, [sync, selfTrack, otherTrack, otherDeckCtrlRef]);

  // Push loop region → engine
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (loopActive && loopIn !== null && loopOut !== null && loopOut > loopIn) {
      engine.setLoop({ inSec: loopIn, outSec: loopOut });
    } else {
      engine.setLoop(null);
    }
  }, [loopActive, loopIn, loopOut, engineRef]);

  const toggleCue = useCallback((idx: number, shift = false) => {
    const engine = engineRef.current;
    setCues((prev) => {
      const next = [...prev];
      if (shift) {
        next[idx] = null;
        return next;
      }
      const existing = next[idx];
      if (existing === null || existing === undefined) {
        // Capture current position
        next[idx] = engine?.getCurrentTime() ?? 0;
      } else {
        // Recall
        engine?.seekTo(existing);
      }
      return next;
    });
  }, [engineRef]);

  const markLoopIn = useCallback(() => {
    const t = engineRef.current?.getCurrentTime() ?? 0;
    setLoopIn(t);
    setLoopActive(false);
  }, [engineRef]);

  const markLoopOut = useCallback(() => {
    const t = engineRef.current?.getCurrentTime() ?? 0;
    setLoopOut(t);
    if (loopIn !== null && t > loopIn) setLoopActive(true);
  }, [engineRef, loopIn]);

  const toggleLoop = useCallback(() => {
    setLoopActive((a) => !a);
  }, []);

  const toggleSync = useCallback(() => {
    setSync((s) => !s);
  }, []);

  return {
    eqLow, eqMid, eqHigh,
    setEqLow, setEqMid, setEqHigh,
    tempo, setTempo,
    pitch, setPitch,
    cues, toggleCue,
    loopIn, loopOut, loopActive,
    markLoopIn, markLoopOut, toggleLoop,
    sync, toggleSync,
  };
}

// ─────────────────────────────────────────────────────────────
// Deck side panel — BPM readout, turntable, pitch/tempo, sync, transport
// ─────────────────────────────────────────────────────────────
function DeckSide({
  deckId,
  track,
  isPlaying,
  volume = 1,
  autoScratchTrigger = 0,
  onScratchStart,
  onScratchEnd,
  onTimeUpdate,
  onPlayPause,
  accentColor,
  mirror = false,
  ctrl,
  engineRef,
}: DeckProps & {
  accentColor: AccentTone;
  mirror?: boolean;
  ctrl: DeckCtrl;
  engineRef: React.MutableRefObject<AudioEngineApi | null>;
}) {
  const theme = useTheme();
  const red = theme.palette.primary.main;
  const redLight = theme.palette.primary.light;
  const audioSrc = track?.audioUrl || track?.preview;

  const effectiveRate = ctrl.tempo * (1 + ctrl.pitch * 0.03);
  const pitchPct = (effectiveRate - 1) * 100;

  return (
    <Stack
      spacing={1.25}
      alignItems="center"
      sx={{
        width: 190,
        p: 2,
        borderRadius: 2,
        ...darkBrushedSub,
        border: `1px solid ${alpha(red, 0.22)}`,
        flexShrink: 0,
      }}
    >
      {/* BPM readout */}
      <Stack direction="row" spacing={1} alignItems="baseline" justifyContent="center" sx={{ width: "100%" }}>
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase", fontSize: 9 }}
        >
          {deckId}
        </Typography>
        <Typography variant="h6" sx={{ fontFamily: "monospace", color: redLight, fontWeight: 800, lineHeight: 1 }}>
          {track?.bpm ? (track.bpm * effectiveRate).toFixed(1) : "---.-"}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: "monospace", fontSize: 10 }}>
          {pitchPct >= 0 ? "+" : ""}{pitchPct.toFixed(1)}%
        </Typography>
      </Stack>

      {/* Turntable */}
      <Box sx={{ position: "relative" }}>
        <Turntable
          deckId={deckId}
          size={140}
          isPlaying={isPlaying}
          coverUrl={track?.cover}
          bpm={track?.bpm ?? 120}
          duration={track?.duration}
          accentColor={accentColor}
          audioUrl={audioSrc}
          volume={volume}
          autoScratchTrigger={autoScratchTrigger}
          onScratchStart={onScratchStart}
          onScratchEnd={onScratchEnd}
          onTimeUpdate={onTimeUpdate}
          engineRef={engineRef}
        />
      </Box>

      {/* Track meta */}
      <Stack alignItems="center" spacing={0.25} sx={{ width: "100%", minHeight: 28 }}>
        {track ? (
          <>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700, width: "100%", textAlign: "center",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 11,
              }}
              title={track.title}
            >
              {track.title}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary", width: "100%", textAlign: "center",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 9,
              }}
              title={track.artist}
            >
              {track.artist}
            </Typography>
          </>
        ) : (
          <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 10 }}>
            — empty —
          </Typography>
        )}
      </Stack>

      {/* Tempo knob + pitch slider */}
      <Stack direction={mirror ? "row-reverse" : "row"} spacing={1.5} alignItems="center" sx={{ width: "100%", justifyContent: "center" }}>
        <Knob
          value={ctrl.tempo}
          onChange={ctrl.setTempo}
          min={0.85}
          max={1.15}
          label="TEMPO"
          size={38}
          centerDetent
        />
        <Box sx={{ height: 80, display: "flex", alignItems: "center", gap: 0.5 }}>
          <Slider
            orientation="vertical"
            value={ctrl.pitch}
            min={-1}
            max={1}
            step={0.01}
            onChange={(_, v) => ctrl.setPitch(v as number)}
            sx={{
              height: 76,
              color: red,
              "& .MuiSlider-thumb": {
                width: 16, height: 10, borderRadius: 0.5, bgcolor: "#eee",
                border: `1px solid ${alpha(red, 0.6)}`, boxShadow: `0 0 6px ${alpha(red, 0.4)}`,
              },
              "& .MuiSlider-rail": { opacity: 1, bgcolor: alpha("#000", 0.8) },
              "& .MuiSlider-track": { border: "none", bgcolor: alpha(red, 0.5) },
            }}
          />
          <Typography variant="caption" sx={{ fontSize: 8, color: "text.disabled", letterSpacing: 1, writingMode: "vertical-rl" }}>
            PITCH
          </Typography>
        </Box>
      </Stack>

      {/* SYNC */}
      <Button
        onClick={ctrl.toggleSync}
        size="small"
        sx={{
          minWidth: 64, height: 22, fontSize: 10, fontWeight: 800, letterSpacing: 1.5,
          color: ctrl.sync ? "#fff" : "text.secondary",
          border: `1px solid ${alpha(red, ctrl.sync ? 0.85 : 0.3)}`,
          borderRadius: 0.75,
          ...machinedButton,
          ...(ctrl.sync && {
            background: `linear-gradient(180deg, ${alpha(red, 0.55)} 0%, ${alpha(theme.palette.primary.dark, 0.9)} 100%)`,
            boxShadow: `0 0 12px ${alpha(red, 0.55)}, inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.7)`,
          }),
          "&:hover": { filter: "brightness(1.15)" },
        }}
      >
        SYNC
      </Button>

      {/* Transport */}
      <Stack direction="row" spacing={0.5}>
        <IconButton
          size="small"
          onClick={() => engineRef.current?.seekTo(0)}
          sx={{ color: "text.secondary", "&:hover": { color: redLight, bgcolor: alpha(red, 0.1) } }}
          title="Rewind to start"
        >
          <SkipPreviousIcon fontSize="small" />
        </IconButton>
        <IconButton
          onClick={onPlayPause}
          disabled={!track}
          sx={{
            width: 38, height: 38, color: "#fff",
            background: `linear-gradient(135deg, ${red}, ${theme.palette.primary.dark})`,
            boxShadow: `0 2px 10px ${alpha(red, 0.5)}`,
            "&:hover": { background: `linear-gradient(135deg, ${redLight}, ${red})` },
            "&.Mui-disabled": { opacity: 0.3, color: "#fff" },
          }}
        >
          {isPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
        </IconButton>
      </Stack>
    </Stack>
  );
}

// ─────────────────────────────────────────────────────────────
// Channel controls: CUE / LOOP / EQ
// ─────────────────────────────────────────────────────────────
function ChannelControls({ ctrl, mirror = false }: { ctrl: DeckCtrl; mirror?: boolean }) {
  const theme = useTheme();
  const red = theme.palette.primary.main;

  const cueButtons = (
    <Stack direction="row" spacing={0.5}>
      {[0, 1, 2, 3].map((i) => {
        const set = ctrl.cues[i] !== null;
        return (
          <Box
            key={i}
            onClick={(e) => ctrl.toggleCue(i, e.shiftKey)}
            title={set ? "Click to recall · Shift+click to clear" : "Click to set cue"}
            sx={{
              width: 26, height: 22,
              border: `1px solid ${alpha(red, set ? 0.8 : 0.3)}`,
              borderRadius: 0.5,
              bgcolor: set ? alpha(red, 0.35) : alpha("#000", 0.6),
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 9, fontFamily: "monospace", fontWeight: 700,
              color: set ? "#fff" : "text.disabled",
              cursor: "pointer",
              "&:hover": { borderColor: alpha(red, 0.6) },
            }}
          >
            {i + 1}
          </Box>
        );
      })}
    </Stack>
  );

  const loopButtons = (
    <Stack direction="row" spacing={0.5}>
      <LoopButton label="IN" onClick={ctrl.markLoopIn} active={ctrl.loopIn !== null} />
      <LoopButton label="OUT" onClick={ctrl.markLoopOut} active={ctrl.loopOut !== null} />
      <LoopButton
        label="LOOP"
        onClick={ctrl.toggleLoop}
        active={ctrl.loopActive}
        disabled={ctrl.loopIn === null || ctrl.loopOut === null}
      />
    </Stack>
  );

  const eqKnobs = (
    <Stack direction="row" spacing={1}>
      <Knob value={ctrl.eqHigh} onChange={ctrl.setEqHigh} min={-12} max={12} label="HIGH" size={38} centerDetent />
      <Knob value={ctrl.eqMid} onChange={ctrl.setEqMid} min={-12} max={12} label="MID" size={38} centerDetent />
      <Knob value={ctrl.eqLow} onChange={ctrl.setEqLow} min={-12} max={12} label="LOW" size={38} centerDetent />
    </Stack>
  );

  return (
    <Stack direction={mirror ? "row-reverse" : "row"} spacing={2} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
      <Stack spacing={0.75} alignItems={mirror ? "flex-end" : "flex-start"}>
        {cueButtons}
        {loopButtons}
      </Stack>
      {eqKnobs}
    </Stack>
  );
}

function LoopButton({
  label,
  onClick,
  active,
  disabled,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const red = theme.palette.primary.main;
  return (
    <Box
      onClick={disabled ? undefined : onClick}
      sx={{
        px: 0.75, height: 22,
        border: `1px solid ${alpha(red, active ? 0.8 : 0.25)}`,
        borderRadius: 0.5,
        bgcolor: active ? alpha(red, 0.35) : alpha("#000", 0.6),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 8, fontFamily: "monospace", fontWeight: 700,
        color: active ? "#fff" : disabled ? alpha("#fff", 0.15) : "text.disabled",
        cursor: disabled ? "not-allowed" : "pointer",
        "&:hover": !disabled ? { borderColor: alpha(red, 0.6), color: "primary.light" } : undefined,
      }}
    >
      {label}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────
// Interactive switch-threshold overlay
// ─────────────────────────────────────────────────────────────
function ThresholdOverlay({
  progress,
  switchPoint,
  onSwitchPointChange,
}: {
  progress: number;
  switchPoint: number;
  onSwitchPointChange?: (v: number) => void;
}) {
  const theme = useTheme();
  const red = theme.palette.primary.main;
  const dragging = useRef(false);

  const handleFromEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    return Math.max(0.1, Math.min(0.99, x));
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onSwitchPointChange) return;
    dragging.current = true;
    onSwitchPointChange(handleFromEvent(e));
    try { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !onSwitchPointChange) return;
    onSwitchPointChange(handleFromEvent(e));
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  return (
    <Box
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      sx={{ position: "absolute", inset: 0, cursor: onSwitchPointChange ? "ew-resize" : "default", touchAction: "none" }}
    >
      <Box
        sx={{
          position: "absolute", top: 0, left: 0, height: "100%",
          width: `${progress * 100}%`,
          background: `linear-gradient(90deg, ${alpha(red, 0.05)}, ${alpha(red, 0.15)})`,
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute", top: -4, bottom: -4,
          left: `${switchPoint * 100}%`,
          width: 3, bgcolor: "#fff", transform: "translateX(-50%)",
          boxShadow: `0 0 10px ${alpha("#fff", 0.7)}, 0 0 4px ${red}`,
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          position: "absolute", top: -10,
          left: `${switchPoint * 100}%`, transform: "translateX(-50%)",
          px: 0.5, py: 0.125, bgcolor: "#fff", color: "#000",
          fontSize: 9, fontFamily: "monospace", fontWeight: 700,
          borderRadius: 0.5, pointerEvents: "none", whiteSpace: "nowrap",
        }}
      >
        {Math.round(switchPoint * 100)}%
      </Box>
      <Box
        sx={{
          position: "absolute", bottom: -10,
          left: `${switchPoint * 100}%`, transform: "translateX(-50%)",
          fontSize: 7, color: "text.disabled", fontFamily: "monospace",
          pointerEvents: "none", whiteSpace: "nowrap",
        }}
      >
        CROSSFADE
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────
// Main layout
// ─────────────────────────────────────────────────────────────
export function DeckLayout({
  deckA,
  deckB,
  crossfaderValue,
  onCrossfaderChange,
  onSkipPrev,
  onSkipNext,
  canSkipPrev,
  canSkipNext,
  isCrossfading,
  currentIndex,
  playlistLength,
  progress,
  switchPoint,
  onSwitchPointChange,
  crossfadeMs,
  deckAProgress = 0,
  deckBProgress = 0,
  effects = [],
  playingEffects,
  onTriggerEffect,
}: DeckLayoutProps) {
  const theme = useTheme();
  const red = theme.palette.primary.main;
  const redLight = theme.palette.primary.light;

  // Engine refs — written by each Turntable on mount
  const engineARef = useRef<AudioEngineApi | null>(null);
  const engineBRef = useRef<AudioEngineApi | null>(null);

  // Mutable mirrors of tempo/pitch so the SYNC effect on one deck can read
  // the other's current values without triggering re-renders on both.
  const ctrlARef = useRef<{ tempo: number; pitch: number } | null>(null);
  const ctrlBRef = useRef<{ tempo: number; pitch: number } | null>(null);

  const ctrlA = useDeckCtrl(engineARef, deckA.track, deckB.track, ctrlBRef);
  const ctrlB = useDeckCtrl(engineBRef, deckB.track, deckA.track, ctrlARef);

  // Keep the mirror refs in sync with current state.
  useEffect(() => { ctrlARef.current = { tempo: ctrlA.tempo, pitch: ctrlA.pitch }; }, [ctrlA.tempo, ctrlA.pitch]);
  useEffect(() => { ctrlBRef.current = { tempo: ctrlB.tempo, pitch: ctrlB.pitch }; }, [ctrlB.tempo, ctrlB.pitch]);

  // Keep the AudioContext alive across tab visibility changes
  // (Safari will suspend background contexts, silencing the EQ chain).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        engineARef.current?.resume();
        engineBRef.current?.resume();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, []);

  // Gain/Trim sliders (visual — no mixer stage for these yet)
  const [gainA, setGainA] = useState(0.75);
  const [gainB, setGainB] = useState(0.75);
  const [trimA, setTrimA] = useState(0.5);
  const [trimB, setTrimB] = useState(0.5);

  const isMobile = useMediaQuery("(max-width:767px)");
  const [mobileDeck, setMobileDeck] = useState<"A" | "B">("A");
  const [eqAnchor, setEqAnchor] = useState<HTMLElement | null>(null);
  const eqOpen = Boolean(eqAnchor);

  const waveformHeight = isMobile ? 52 : 68;

  // Derived track durations for waveform scroll math
  const durA = deckA.track?.duration ?? 30;
  const durB = deckB.track?.duration ?? 30;

  // Cue points as 0–1 for waveform markers
  const cuePointsA = useMemo(
    () => ctrlA.cues.filter((c): c is number => c !== null).map((s) => durA > 0 ? s / durA : 0),
    [ctrlA.cues, durA]
  );
  const cuePointsB = useMemo(
    () => ctrlB.cues.filter((c): c is number => c !== null).map((s) => durB > 0 ? s / durB : 0),
    [ctrlB.cues, durB]
  );

  const loopRegionA = ctrlA.loopActive && ctrlA.loopIn !== null && ctrlA.loopOut !== null
    ? { inSec: ctrlA.loopIn, outSec: ctrlA.loopOut }
    : null;
  const loopRegionB = ctrlB.loopActive && ctrlB.loopIn !== null && ctrlB.loopOut !== null
    ? { inSec: ctrlB.loopIn, outSec: ctrlB.loopOut }
    : null;

  // ── Shared sub-components used by both layouts ──────────────
  const waveformA = (
    <WaveformLane
      audioUrl={deckA.track?.audioUrl || deckA.track?.preview}
      progress={deckAProgress}
      accent="bright"
      height={waveformHeight}
      durationSec={durA}
      cuePoints={cuePointsA}
      loopRegion={loopRegionA}
      onScratchStart={(s) => { engineARef.current?.beginScratch(s); }}
      onScratchMove={(sp, rev, s) => { engineARef.current?.updateScratch(sp, rev, s); }}
      onScratchEnd={(s) => { engineARef.current?.endScratch(s); }}
    />
  );
  const waveformB = (
    <WaveformLane
      audioUrl={deckB.track?.audioUrl || deckB.track?.preview}
      progress={deckBProgress}
      accent="dark"
      height={waveformHeight}
      durationSec={durB}
      cuePoints={cuePointsB}
      loopRegion={loopRegionB}
      onScratchStart={(s) => { engineBRef.current?.beginScratch(s); }}
      onScratchMove={(sp, rev, s) => { engineBRef.current?.updateScratch(sp, rev, s); }}
      onScratchEnd={(s) => { engineBRef.current?.endScratch(s); }}
    />
  );

  const progressBar = playlistLength > 0 ? (
    <Box sx={{ mt: 1.5, position: "relative", height: 10 }}>
      <Box
        sx={{
          position: "absolute", inset: 0,
          bgcolor: alpha("#000", 0.75), borderRadius: 999, overflow: "hidden",
          border: `1px solid ${alpha(red, 0.15)}`,
        }}
      >
        <Box
          sx={{
            position: "absolute", top: 0, left: 0, height: "100%",
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${theme.palette.primary.dark}, ${red}, ${redLight})`,
            transition: "width 0.12s linear",
            willChange: "width",
          }}
        />
      </Box>
      <ThresholdOverlay
        progress={progress / 100}
        switchPoint={switchPoint}
        onSwitchPointChange={onSwitchPointChange}
      />
    </Box>
  ) : null;

  const skipBtnSize = isMobile ? 48 : 64;
  const skipIconSize = isMobile ? 28 : 36;
  const transportButtons = (
    <Stack direction="row" spacing={isMobile ? 2 : 4} alignItems="center" justifyContent="center" sx={{ mt: isMobile ? 2 : 4, mb: 1 }}>
      <IconButton
        onClick={onSkipPrev}
        disabled={!canSkipPrev}
        sx={{
          width: skipBtnSize, height: skipBtnSize,
          color: "text.secondary",
          ...machinedButton,
          borderRadius: 2.5,
          border: `1px solid ${alpha(red, 0.35)}`,
          "&:hover": { color: redLight, filter: "brightness(1.15)" },
          "&.Mui-disabled": { opacity: 0.25, color: "text.disabled" },
        }}
      >
        <SkipPreviousIcon sx={{ fontSize: skipIconSize }} />
      </IconButton>

      <Stack alignItems="center" spacing={0.25} sx={{ minWidth: 70 }}>
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", fontFamily: "monospace", fontSize: 11 }}
        >
          {currentIndex + 1} / {playlistLength}
        </Typography>
        {isCrossfading && (
          <Typography
            variant="caption"
            sx={{
              color: redLight, fontSize: 10,
              animation: "mui-pulse 1.2s ease-in-out infinite",
              "@keyframes mui-pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.4 } },
            }}
          >
            crossfading
          </Typography>
        )}
        {!isCrossfading && (
          <Typography variant="caption" sx={{ color: "text.disabled", fontSize: 10 }}>
            {(crossfadeMs / 1000).toFixed(1)}s xfade
          </Typography>
        )}
      </Stack>

      <IconButton
        onClick={onSkipNext}
        disabled={!canSkipNext}
        sx={{
          width: skipBtnSize, height: skipBtnSize,
          color: "text.secondary",
          ...machinedButton,
          borderRadius: 2.5,
          border: `1px solid ${alpha(red, 0.35)}`,
          "&:hover": { color: redLight, filter: "brightness(1.15)" },
          "&.Mui-disabled": { opacity: 0.25, color: "text.disabled" },
        }}
      >
        <SkipNextIcon sx={{ fontSize: skipIconSize }} />
      </IconButton>
    </Stack>
  );

  const effectsPadSize = isMobile ? 34 : 38;
  const effectsGrid = effects.length > 0 && onTriggerEffect ? (
    <Box sx={{ mt: 1.5 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(effects.length, 4)}, ${effectsPadSize}px)`,
          gap: "6px",
          justifyContent: "center",
          p: 1.25,
          borderRadius: "4px",
          background: [
            `repeating-linear-gradient(90deg, ${alpha("#fff", 0.015)} 0px, transparent 1px, transparent 3px)`,
            `repeating-linear-gradient(90deg, ${alpha("#000", 0.03)} 0px, transparent 1px, transparent 5px)`,
            `linear-gradient(175deg, ${alpha("#2a2a2a", 0.95)} 0%, ${alpha("#1e1e1e", 0.97)} 40%, ${alpha("#161616", 0.98)} 100%)`,
          ].join(", "),
          border: `1px solid ${alpha("#444", 0.5)}`,
          borderTop: `1px solid ${alpha("#555", 0.5)}`,
          borderBottom: `1px solid ${alpha("#222", 0.6)}`,
          boxShadow: [
            `inset 0 1px 0 ${alpha("#fff", 0.04)}`,
            `inset 0 -1px 0 ${alpha("#000", 0.3)}`,
            `inset 0 2px 4px ${alpha("#000", 0.25)}`,
            `0 2px 4px ${alpha("#000", 0.4)}`,
            `0 1px 0 ${alpha("#333", 0.15)}`,
          ].join(", "),
        }}
      >
        {effects.map((eff) => {
          const isActive = playingEffects?.has(eff.name) ?? false;
          return (
            <Tooltip key={eff.name} title={eff.label} placement="top" arrow
              slotProps={{
                tooltip: {
                  sx: {
                    bgcolor: alpha("#1a1a1a", 0.95),
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 1,
                    border: `1px solid ${alpha(red, 0.3)}`,
                    backdropFilter: "blur(8px)",
                  },
                },
                arrow: { sx: { color: alpha("#1a1a1a", 0.95) } },
              }}
            >
              <Box
                role="button"
                onClick={(e) => { e.stopPropagation(); onTriggerEffect(eff.name); }}
                sx={{
                  cursor: "pointer",
                  userSelect: "none",
                  width: effectsPadSize,
                  height: effectsPadSize,
                  borderRadius: "2px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  background: isActive
                    ? `linear-gradient(145deg, ${alpha("#1c1c1c", 0.9)}, ${alpha("#0e0e0e", 0.95)})`
                    : `linear-gradient(145deg, ${alpha("#181818", 0.9)}, ${alpha("#0a0a0a", 0.95)})`,
                  border: `1px solid ${alpha(isActive ? red : "#333", isActive ? 0.5 : 0.35)}`,
                  boxShadow: isActive
                    ? `0 0 14px ${alpha(red, 0.3)}, inset 0 1px 3px ${alpha("#000", 0.5)}`
                    : `inset 0 1px 3px ${alpha("#000", 0.5)}, 0 1px 0 ${alpha("#222", 0.15)}`,
                  transition: "all 0.1s ease",
                  "&:hover": {
                    border: `1px solid ${alpha(red, 0.5)}`,
                    boxShadow: `0 0 8px ${alpha(red, 0.2)}, inset 0 1px 3px ${alpha("#000", 0.5)}`,
                  },
                  "&:active": {
                    transform: "scale(0.93)",
                    boxShadow: `inset 0 2px 6px ${alpha("#000", 0.7)}`,
                  },
                }}
              >
                <Box sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  position: "relative",
                  border: `1.5px solid ${alpha("#222", 0.8)}`,
                  background: isActive
                    ? `radial-gradient(circle at 40% 35%, ${alpha("#ff6b6b", 0.95)}, ${red} 50%, ${alpha("#8b0000", 0.9)} 100%)`
                    : `radial-gradient(circle at 40% 35%, ${alpha("#3a1515", 0.8)}, ${alpha("#1a0808", 0.9)} 70%)`,
                  boxShadow: isActive
                    ? [
                        `0 0 3px 1px ${alpha(red, 0.9)}`,
                        `0 0 8px 2px ${alpha(red, 0.5)}`,
                        `0 0 16px 4px ${alpha(red, 0.25)}`,
                        `inset 0 -1px 2px ${alpha("#ff9999", 0.3)}`,
                      ].join(", ")
                    : `inset 0 1px 2px ${alpha("#000", 0.5)}`,
                  transition: "all 0.12s ease",
                  "&::after": isActive ? {
                    content: '""',
                    position: "absolute",
                    top: "15%",
                    left: "25%",
                    width: "35%",
                    height: "30%",
                    borderRadius: "50%",
                    background: `radial-gradient(ellipse, ${alpha("#fff", 0.6)}, transparent)`,
                  } : {},
                }} />
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  ) : null;

  // ── MOBILE LAYOUT ────────────────────────────────────────────
  // Both decks visible side-by-side with small discs, compact Winamp-style
  // EQ hidden behind a popup, everything fits in ~half the screen.
  if (isMobile) {
    const mobileDiscSize = 52;
    const rateA = ctrlA.tempo * (1 + ctrlA.pitch * 0.03);
    const rateB = ctrlB.tempo * (1 + ctrlB.pitch * 0.03);

    // Which deck is selected for the control strip
    const activeCtrl = mobileDeck === "A" ? ctrlA : ctrlB;

    return (
      <Paper
        elevation={8}
        sx={{
          p: 1, borderRadius: 2,
          position: "relative",
          border: `1px solid ${alpha(red, 0.3)}`,
          ...darkBrushedPanel,
          "&::after": {
            content: '""',
            position: "absolute",
            inset: 0,
            borderRadius: 2,
            pointerEvents: "none",
            boxShadow: `0 0 0 1px ${alpha(red, 0.12)}, 0 10px 30px ${alpha("#000", 0.7)}`,
          },
        }}
      >
        {/* ── Deck row: [Vinyl A] [Waveforms] [Vinyl B] ── */}
        <Stack direction="row" alignItems="center" spacing={0.75}>
          {/* Left: Deck A vinyl + meta */}
          <Stack alignItems="center" spacing={0.25} sx={{ flexShrink: 0, width: mobileDiscSize + 8 }}>
            <Typography sx={{ fontSize: 7, fontWeight: 800, letterSpacing: 2, color: alpha(redLight, 0.5) }}>
              A · <Box component="span" sx={{ color: redLight }}>{deckA.track?.bpm ? (deckA.track.bpm * rateA).toFixed(0) : "---"}</Box>
            </Typography>
            <Turntable
              deckId="A" size={mobileDiscSize}
              isPlaying={deckA.isPlaying} coverUrl={deckA.track?.cover}
              bpm={deckA.track?.bpm ?? 120} duration={deckA.track?.duration}
              accentColor="red"
              audioUrl={deckA.track?.audioUrl || deckA.track?.preview}
              volume={deckA.volume} autoScratchTrigger={deckA.autoScratchTrigger}
              onScratchStart={deckA.onScratchStart} onScratchEnd={deckA.onScratchEnd}
              onTimeUpdate={deckA.onTimeUpdate} engineRef={engineARef}
            />
            <Typography sx={{ fontSize: 8, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", textAlign: "center" }}>
              {deckA.track?.title ?? "—"}
            </Typography>
          </Stack>

          {/* Center: stacked waveforms */}
          <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
            {waveformA}
            <Box sx={{ borderBottom: `1px solid ${alpha(red, 0.15)}` }} />
            {waveformB}
          </Stack>

          {/* Right: Deck B vinyl + meta */}
          <Stack alignItems="center" spacing={0.25} sx={{ flexShrink: 0, width: mobileDiscSize + 8 }}>
            <Typography sx={{ fontSize: 7, fontWeight: 800, letterSpacing: 2, color: alpha(redLight, 0.5) }}>
              B · <Box component="span" sx={{ color: redLight }}>{deckB.track?.bpm ? (deckB.track.bpm * rateB).toFixed(0) : "---"}</Box>
            </Typography>
            <Turntable
              deckId="B" size={mobileDiscSize}
              isPlaying={deckB.isPlaying} coverUrl={deckB.track?.cover}
              bpm={deckB.track?.bpm ?? 120} duration={deckB.track?.duration}
              accentColor="redDark"
              audioUrl={deckB.track?.audioUrl || deckB.track?.preview}
              volume={deckB.volume} autoScratchTrigger={deckB.autoScratchTrigger}
              onScratchStart={deckB.onScratchStart} onScratchEnd={deckB.onScratchEnd}
              onTimeUpdate={deckB.onTimeUpdate} engineRef={engineBRef}
            />
            <Typography sx={{ fontSize: 8, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%", textAlign: "center" }}>
              {deckB.track?.title ?? "—"}
            </Typography>
          </Stack>
        </Stack>

        {progressBar}

        {/* ─ Transport row: skip + counter + effects, tight ─ */}
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1.5} sx={{ mt: 1.5, mb: 0.5 }}>
          <IconButton onClick={onSkipPrev} disabled={!canSkipPrev} size="small"
            sx={{ width: 36, height: 36, color: "text.secondary", ...machinedButton, borderRadius: 1.5, border: `1px solid ${alpha(red, 0.35)}`, "&.Mui-disabled": { opacity: 0.25 } }}
          >
            <SkipPreviousIcon sx={{ fontSize: 20 }} />
          </IconButton>

          <Stack alignItems="center" sx={{ minWidth: 50 }}>
            <Typography sx={{ color: "text.disabled", fontFamily: "monospace", fontSize: 10 }}>
              {currentIndex + 1}/{playlistLength}
            </Typography>
            {isCrossfading && (
              <Typography sx={{ color: redLight, fontSize: 8, animation: "mui-pulse 1.2s ease-in-out infinite", "@keyframes mui-pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.4 } } }}>
                xfading
              </Typography>
            )}
          </Stack>

          <IconButton onClick={onSkipNext} disabled={!canSkipNext} size="small"
            sx={{ width: 36, height: 36, color: "text.secondary", ...machinedButton, borderRadius: 1.5, border: `1px solid ${alpha(red, 0.35)}`, "&.Mui-disabled": { opacity: 0.25 } }}
          >
            <SkipNextIcon sx={{ fontSize: 20 }} />
          </IconButton>

          {/* Effect pads inline */}
          {effects.length > 0 && onTriggerEffect && (
            <Stack direction="row" spacing={0.5}>
              {effects.map((eff) => {
                const isActive = playingEffects?.has(eff.name) ?? false;
                return (
                  <Tooltip key={eff.name} title={eff.label} placement="top" arrow
                    slotProps={{ tooltip: { sx: { bgcolor: alpha("#1a1a1a", 0.95), color: "#fff", fontSize: 9, fontWeight: 700, border: `1px solid ${alpha(red, 0.3)}` } }, arrow: { sx: { color: alpha("#1a1a1a", 0.95) } } }}
                  >
                    <Box
                      role="button"
                      onClick={(e) => { e.stopPropagation(); onTriggerEffect(eff.name); }}
                      sx={{
                        cursor: "pointer", userSelect: "none", width: 28, height: 28, borderRadius: "2px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: isActive
                          ? `linear-gradient(145deg, ${alpha("#1c1c1c", 0.9)}, ${alpha("#0e0e0e", 0.95)})`
                          : `linear-gradient(145deg, ${alpha("#181818", 0.9)}, ${alpha("#0a0a0a", 0.95)})`,
                        border: `1px solid ${alpha(isActive ? red : "#333", isActive ? 0.5 : 0.35)}`,
                        boxShadow: isActive ? `0 0 10px ${alpha(red, 0.3)}` : `inset 0 1px 2px ${alpha("#000", 0.5)}`,
                        "&:active": { transform: "scale(0.9)" },
                      }}
                    >
                      <Box sx={{
                        width: 7, height: 7, borderRadius: "50%",
                        border: `1px solid ${alpha("#222", 0.8)}`,
                        background: isActive
                          ? `radial-gradient(circle at 40% 35%, #ff6b6b, ${red} 50%, #8b0000)`
                          : `radial-gradient(circle at 40% 35%, #3a1515, #1a0808 70%)`,
                        boxShadow: isActive
                          ? `0 0 3px 1px ${alpha(red, 0.9)}, 0 0 8px 2px ${alpha(red, 0.4)}`
                          : `inset 0 1px 2px ${alpha("#000", 0.5)}`,
                      }} />
                    </Box>
                  </Tooltip>
                );
              })}
            </Stack>
          )}
        </Stack>

        <Box sx={{ ...machinedSeam, my: 1 }} />

        {/* ─ Control strip: A/B selector + tempo/pitch/sync + EQ popup + cue/loop ─ */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 0.25 }}>
          {/* Deck selector for controls */}
          <Stack spacing={0.25}>
            {(["A", "B"] as const).map((d) => (
              <Box
                key={d}
                onClick={() => setMobileDeck(d)}
                sx={{
                  cursor: "pointer", width: 22, height: 18, borderRadius: "2px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, fontWeight: 800, letterSpacing: 1,
                  color: mobileDeck === d ? "#fff" : alpha("#fff", 0.3),
                  border: `1px solid ${alpha(red, mobileDeck === d ? 0.7 : 0.15)}`,
                  background: mobileDeck === d ? alpha(red, 0.35) : alpha("#000", 0.6),
                  transition: "all 0.12s",
                }}
              >
                {d}
              </Box>
            ))}
          </Stack>

          {/* Tempo knob */}
          <Knob value={activeCtrl.tempo} onChange={activeCtrl.setTempo} min={0.85} max={1.15} label="TMP" size={28} centerDetent />

          {/* Pitch micro-slider */}
          <Box sx={{ height: 44, display: "flex", alignItems: "center", gap: 0.25 }}>
            <Slider
              orientation="vertical"
              value={activeCtrl.pitch}
              min={-1} max={1} step={0.01}
              onChange={(_, v) => activeCtrl.setPitch(v as number)}
              sx={{
                height: 40, color: red,
                "& .MuiSlider-thumb": { width: 12, height: 6, borderRadius: 0.5, bgcolor: "#eee", border: `1px solid ${alpha(red, 0.6)}` },
                "& .MuiSlider-rail": { opacity: 1, bgcolor: alpha("#000", 0.8), width: 3 },
                "& .MuiSlider-track": { border: "none", bgcolor: alpha(red, 0.5), width: 3 },
              }}
            />
            <Typography sx={{ fontSize: 6, color: "text.disabled", letterSpacing: 0.5, writingMode: "vertical-rl" }}>PIT</Typography>
          </Box>

          {/* SYNC */}
          <Button
            onClick={activeCtrl.toggleSync}
            size="small"
            sx={{
              minWidth: 0, px: 0.75, height: 18, fontSize: 7, fontWeight: 800, letterSpacing: 1,
              color: activeCtrl.sync ? "#fff" : "text.secondary",
              border: `1px solid ${alpha(red, activeCtrl.sync ? 0.85 : 0.25)}`,
              borderRadius: 0.5,
              ...machinedButton,
              ...(activeCtrl.sync && {
                background: `linear-gradient(180deg, ${alpha(red, 0.55)}, ${alpha(theme.palette.primary.dark, 0.9)})`,
                boxShadow: `0 0 8px ${alpha(red, 0.5)}`,
              }),
            }}
          >
            SYN
          </Button>

          {/* EQ popup button */}
          <Button
            onClick={(e) => setEqAnchor(eqAnchor ? null : e.currentTarget)}
            size="small"
            sx={{
              minWidth: 0, px: 0.75, height: 18, fontSize: 7, fontWeight: 800, letterSpacing: 1,
              color: eqOpen ? "#fff" : "text.secondary",
              border: `1px solid ${alpha(red, eqOpen ? 0.7 : 0.25)}`,
              borderRadius: 0.5,
              ...machinedButton,
              ...(eqOpen && {
                background: `linear-gradient(180deg, ${alpha(red, 0.4)}, ${alpha(red, 0.15)})`,
              }),
            }}
          >
            EQ
          </Button>

          {/* Cue pads */}
          <Stack direction="row" spacing={0.25}>
            {[0, 1, 2, 3].map((i) => {
              const set = activeCtrl.cues[i] !== null;
              return (
                <Box key={i} onClick={(e) => activeCtrl.toggleCue(i, e.shiftKey)}
                  sx={{
                    width: 18, height: 16, borderRadius: "2px",
                    border: `1px solid ${alpha(red, set ? 0.8 : 0.2)}`,
                    bgcolor: set ? alpha(red, 0.35) : alpha("#000", 0.6),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 7, fontFamily: "monospace", fontWeight: 700,
                    color: set ? "#fff" : alpha("#fff", 0.25), cursor: "pointer",
                  }}
                >
                  {i + 1}
                </Box>
              );
            })}
          </Stack>

          {/* Loop mini buttons */}
          <Stack direction="row" spacing={0.25}>
            <LoopButton label="I" onClick={activeCtrl.markLoopIn} active={activeCtrl.loopIn !== null} />
            <LoopButton label="O" onClick={activeCtrl.markLoopOut} active={activeCtrl.loopOut !== null} />
            <LoopButton label="L" onClick={activeCtrl.toggleLoop} active={activeCtrl.loopActive} disabled={activeCtrl.loopIn === null || activeCtrl.loopOut === null} />
          </Stack>
        </Stack>

        {/* EQ Popper */}
        <Popper open={eqOpen} anchorEl={eqAnchor} placement="top" sx={{ zIndex: 1300 }}>
          <ClickAwayListener onClickAway={() => setEqAnchor(null)}>
            <Paper
              elevation={12}
              sx={{
                p: 1.5, mb: 1,
                borderRadius: 2,
                border: `1px solid ${alpha(red, 0.4)}`,
                ...darkBrushedSub,
              }}
            >
              <Typography sx={{ fontSize: 7, fontWeight: 800, letterSpacing: 2, color: alpha(redLight, 0.5), textAlign: "center", mb: 1 }}>
                EQ — DECK {mobileDeck}
              </Typography>
              <Stack direction="row" spacing={1.5} justifyContent="center">
                <Knob value={activeCtrl.eqHigh} onChange={activeCtrl.setEqHigh} min={-12} max={12} label="HI" size={32} centerDetent />
                <Knob value={activeCtrl.eqMid} onChange={activeCtrl.setEqMid} min={-12} max={12} label="MID" size={32} centerDetent />
                <Knob value={activeCtrl.eqLow} onChange={activeCtrl.setEqLow} min={-12} max={12} label="LO" size={32} centerDetent />
              </Stack>
            </Paper>
          </ClickAwayListener>
        </Popper>

        {/* ─ Crossfader row ─ */}
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1, px: 0.5 }}>
          <VerticalMini value={gainA} onChange={setGainA} label="A" />
          <Box sx={{ flex: 1 }}>
            <Crossfader value={crossfaderValue} onChange={onCrossfaderChange} />
          </Box>
          <VerticalMini value={gainB} onChange={setGainB} label="B" />
        </Stack>
      </Paper>
    );
  }

  // ── DESKTOP LAYOUT (unchanged) ───────────────────────────────
  return (
    <Paper
      elevation={8}
      sx={{
        p: 2.5, borderRadius: 3,
        position: "relative",
        border: `1px solid ${alpha(red, 0.3)}`,
        ...darkBrushedPanel,
        "&::after": {
          content: '""',
          position: "absolute",
          inset: 0,
          borderRadius: 3,
          pointerEvents: "none",
          boxShadow: `0 0 0 1px ${alpha(red, 0.12)}, 0 20px 60px ${alpha("#000", 0.7)}`,
        },
      }}
    >
      <Stack direction="row" spacing={2} alignItems="stretch">
        <DeckSide deckId="A" accentColor="red" ctrl={ctrlA} engineRef={engineARef} {...deckA} />

        <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
          {waveformA}
          <Box sx={{ borderBottom: `1px solid ${alpha(red, 0.18)}` }} />
          {waveformB}
          {progressBar}
          {transportButtons}
          {effectsGrid}
        </Stack>

        <DeckSide deckId="B" accentColor="redDark" ctrl={ctrlB} engineRef={engineBRef} {...deckB} mirror />
      </Stack>

      <Box sx={{ ...machinedSeam, mt: 2.5 }} />
      <Box sx={{ mt: 2, pt: 1 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <ChannelControls ctrl={ctrlA} />

          <Stack spacing={1} alignItems="center" sx={{ width: 260, flexShrink: 0 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: "100%" }}>
              <VerticalMini value={gainA} onChange={setGainA} label="GAIN" />
              <VerticalMini value={trimA} onChange={setTrimA} label="TRIM" />
              <Box sx={{ flex: 1 }}>
                <Crossfader value={crossfaderValue} onChange={onCrossfaderChange} />
              </Box>
              <VerticalMini value={trimB} onChange={setTrimB} label="TRIM" />
              <VerticalMini value={gainB} onChange={setGainB} label="GAIN" />
            </Stack>
          </Stack>

          <ChannelControls ctrl={ctrlB} mirror />
        </Stack>
      </Box>
    </Paper>
  );
}

function VerticalMini({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const theme = useTheme();
  const red = theme.palette.primary.main;
  return (
    <Stack alignItems="center" spacing={0.25} sx={{ height: 60 }}>
      <Slider
        orientation="vertical"
        value={value}
        min={0}
        max={1}
        step={0.01}
        onChange={(_, v) => onChange(v as number)}
        sx={{
          height: 44, color: red,
          "& .MuiSlider-thumb": {
            width: 12, height: 8, borderRadius: 0.5, bgcolor: "#ddd",
            border: `1px solid ${alpha(red, 0.6)}`,
          },
          "& .MuiSlider-rail": { opacity: 1, bgcolor: alpha("#000", 0.8) },
          "& .MuiSlider-track": { border: "none", bgcolor: alpha(red, 0.5) },
        }}
      />
      <Typography variant="caption" sx={{ fontSize: 7, color: "text.disabled", letterSpacing: 1, fontWeight: 700 }}>
        {label}
      </Typography>
    </Stack>
  );
}
