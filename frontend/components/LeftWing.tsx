"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Stack, Typography, Slider } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { AudioEngineApi } from "../hooks/useAudioEngine";

interface PlaylistTrack {
  id: number;
  title: string;
  artist: string;
  duration: number;
  bpm: number;
}

interface LeftWingProps {
  open: boolean;
  onToggle: () => void;
  playlist: PlaylistTrack[];
  currentIndex: number;
  engineARef: React.MutableRefObject<AudioEngineApi | null>;
  engineBRef: React.MutableRefObject<AudioEngineApi | null>;
  activeDeck: "a" | "b";
  deckATrack: { title?: string; artist?: string } | null;
  deckBTrack: { title?: string; artist?: string } | null;
}

type TabKey = "history" | "cues" | "fx";

export function LeftWing({
  open,
  onToggle,
  playlist,
  currentIndex,
  engineARef,
  engineBRef,
  activeDeck,
  deckATrack,
  deckBTrack,
}: LeftWingProps) {
  const theme = useTheme();
  const red = theme.palette.primary.main;
  const redLight = theme.palette.primary.light;
  const blue = "#38bdf8";
  const blueLight = "#7dd3fc";
  const [tab, setTab] = useState<TabKey>("history");

  return (
    <Box
      sx={{
        position: "absolute",
        top: 0,
        bottom: 0,
        right: "100%",
        mr: 1,
        width: 244,
        zIndex: 20,
        transform: open ? "translateX(0)" : "translateX(-222px)",
        transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
        pointerEvents: "auto",
      }}
    >
      <Box sx={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        borderRadius: "12px",
        overflow: "hidden",
        background: `linear-gradient(180deg, ${alpha("#0a0a0a", 0.92)} 0%, ${alpha("#050505", 0.95)} 100%)`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: `1px solid ${alpha(blue, 0.22)}`,
        boxShadow: [
          `0 12px 32px ${alpha("#000", 0.7)}`,
          `0 0 0 1px ${alpha("#000", 0.4)}`,
          `inset 0 1px 0 ${alpha("#fff", 0.04)}`,
        ].join(", "),
      }}>
        {/* Retract tab on the right edge (points right when retracted) */}
        <Box
          onClick={onToggle}
          title={open ? "Retract panel" : "Expand panel"}
          sx={{
            position: "absolute",
            right: 0, top: "50%",
            transform: "translate(1px, -50%)",
            width: 22, height: 68,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            borderRadius: "0 6px 6px 0",
            background: `linear-gradient(270deg, ${alpha(blue, 0.35)}, ${alpha(blue, 0.15)})`,
            border: `1px solid ${alpha(blue, 0.35)}`,
            borderLeft: "none",
            boxShadow: `inset -1px 0 0 ${alpha("#fff", 0.08)}`,
            zIndex: 2,
            transition: "background 0.2s",
            "&:hover": { background: `linear-gradient(270deg, ${alpha(blue, 0.5)}, ${alpha(blue, 0.22)})` },
          }}
        >
          <Box sx={{
            color: "#fff", fontSize: 10, lineHeight: 1,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}>
            ▶
          </Box>
        </Box>

        {/* Tab bar */}
        <Stack direction="row" sx={{
          pr: 3.5,
          borderBottom: `1px solid ${alpha("#fff", 0.05)}`,
          background: `linear-gradient(90deg, transparent 40%, ${alpha(blue, 0.1)})`,
          flexShrink: 0,
        }}>
          {(["history", "cues", "fx"] as TabKey[]).map((k) => (
            <Box
              key={k}
              onClick={() => setTab(k)}
              sx={{
                flex: 1,
                py: 0.75,
                cursor: "pointer",
                textAlign: "center",
                position: "relative",
                "&:hover": { bgcolor: alpha("#fff", 0.03) },
                "&::after": tab === k ? {
                  content: '""',
                  position: "absolute",
                  left: "20%", right: "20%", bottom: 0,
                  height: 2,
                  bgcolor: blueLight,
                  boxShadow: `0 0 6px ${blueLight}`,
                } : undefined,
              }}
            >
              <Typography sx={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 2,
                color: tab === k ? blueLight : alpha("#fff", 0.45),
                textTransform: "uppercase",
              }}>
                {k === "fx" ? "FX" : k}
              </Typography>
            </Box>
          ))}
        </Stack>

        {/* Tab content */}
        <Box sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          "&::-webkit-scrollbar": { width: 4 },
          "&::-webkit-scrollbar-track": { background: "transparent" },
          "&::-webkit-scrollbar-thumb": { bgcolor: alpha(blue, 0.35), borderRadius: 2 },
        }}>
          {tab === "history" && (
            <HistoryTab playlist={playlist} currentIndex={currentIndex} redLight={redLight} />
          )}
          {tab === "cues" && (
            <CuesTab
              activeDeck={activeDeck}
              deckATrack={deckATrack}
              deckBTrack={deckBTrack}
              engineARef={engineARef}
              engineBRef={engineBRef}
              red={red} redLight={redLight} blue={blue} blueLight={blueLight}
            />
          )}
          {tab === "fx" && (
            <FxTab
              engineARef={engineARef} engineBRef={engineBRef}
              red={red} redLight={redLight} blue={blue} blueLight={blueLight}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

// ── History ──────────────────────────────────────────────────────────────
function HistoryTab({
  playlist, currentIndex, redLight,
}: { playlist: PlaylistTrack[]; currentIndex: number; redLight: string }) {
  const played = playlist.slice(0, Math.max(0, currentIndex));
  if (played.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: "center" }}>
        <Typography sx={{ fontSize: 11, color: alpha("#fff", 0.45), fontStyle: "italic" }}>
          No tracks played yet.
        </Typography>
      </Box>
    );
  }
  return (
    <Stack sx={{ py: 0.5 }}>
      {played.map((t, i) => {
        const mins = Math.floor((t.duration || 0) / 60);
        const secs = Math.floor((t.duration || 0) % 60);
        return (
          <Stack
            key={`hist-${t.id}-${i}`}
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{
              px: 1.25, py: 0.65,
              borderBottom: `1px solid ${alpha("#fff", 0.03)}`,
              opacity: 0.7,
            }}
          >
            <Typography sx={{
              width: 16, textAlign: "right", flexShrink: 0,
              fontSize: 9, fontFamily: "monospace", color: alpha("#fff", 0.3),
            }}>
              {i + 1}
            </Typography>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 500, color: alpha("#fff", 0.7), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.15 }}>
                {t.title}
              </Typography>
              <Typography sx={{ fontSize: 9, color: alpha("#fff", 0.35), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.artist}
              </Typography>
            </Stack>
            {t.bpm > 0 && (
              <Typography sx={{ fontSize: 8, fontFamily: "monospace", color: alpha(redLight, 0.55), letterSpacing: 0.5 }}>
                {Math.round(t.bpm)}
              </Typography>
            )}
            {t.duration > 0 && (
              <Typography sx={{ fontSize: 8, fontFamily: "monospace", color: alpha("#fff", 0.3) }}>
                {mins}:{secs.toString().padStart(2, "0")}
              </Typography>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

// ── Cues ─────────────────────────────────────────────────────────────────
function CuesTab({
  activeDeck, deckATrack, deckBTrack, engineARef, engineBRef,
  red, redLight, blue, blueLight,
}: {
  activeDeck: "a" | "b";
  deckATrack: { title?: string; artist?: string } | null;
  deckBTrack: { title?: string; artist?: string } | null;
  engineARef: React.MutableRefObject<AudioEngineApi | null>;
  engineBRef: React.MutableRefObject<AudioEngineApi | null>;
  red: string; redLight: string; blue: string; blueLight: string;
}) {
  const track = activeDeck === "a" ? deckATrack : deckBTrack;
  const engineRef = activeDeck === "a" ? engineARef : engineBRef;
  const accent = activeDeck === "a" ? redLight : blueLight;
  const accentDim = activeDeck === "a" ? red : blue;
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = engineRef.current?.getCurrentTime?.() ?? 0;
      const d = engineRef.current?.durationRef?.current ?? 0;
      setPos(t);
      setDur(d);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engineRef]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const rs = Math.floor(s % 60);
    return `${m}:${rs.toString().padStart(2, "0")}`;
  };

  return (
    <Stack sx={{ p: 1.25 }} spacing={1.25}>
      {/* Active deck label */}
      <Stack direction="row" alignItems="center" spacing={0.75}>
        <Box sx={{
          px: 0.75, py: 0.25, borderRadius: 0.5,
          bgcolor: alpha(accentDim, 0.25),
          border: `1px solid ${alpha(accent, 0.5)}`,
        }}>
          <Typography sx={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: accent, textTransform: "uppercase" }}>
            Deck {activeDeck.toUpperCase()}
          </Typography>
        </Box>
        <Typography sx={{
          fontSize: 10, color: alpha("#fff", 0.55),
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1,
        }}>
          {track?.title || "—"}
        </Typography>
      </Stack>

      {/* Position readout */}
      <Box sx={{
        p: 1,
        borderRadius: 0.75,
        bgcolor: alpha("#050506", 0.9),
        border: `1px solid ${alpha(accent, 0.15)}`,
      }}>
        <Typography sx={{
          fontFamily: "monospace", fontSize: 18, fontWeight: 800,
          color: accent, letterSpacing: 1,
          textAlign: "center", lineHeight: 1.1,
          textShadow: `0 0 10px ${alpha(accent, 0.5)}`,
        }}>
          {fmt(pos)} <Box component="span" sx={{ fontSize: 12, color: alpha(accent, 0.4) }}>/ {fmt(dur)}</Box>
        </Typography>
      </Box>

      {/* Hot cue grid — decorative slots. Setting cues happens on the deck itself. */}
      <Box>
        <Typography sx={{
          fontSize: 9, fontFamily: "monospace", letterSpacing: 2,
          color: alpha("#fff", 0.35), textTransform: "uppercase", mb: 0.5,
        }}>
          Hot Cues
        </Typography>
        <Box sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 0.75,
        }}>
          {[1, 2, 3, 4].map((n) => (
            <Box key={n} sx={{
              aspectRatio: "2 / 1",
              borderRadius: 1,
              position: "relative",
              background: `linear-gradient(145deg, ${alpha("#181818", 0.9)}, ${alpha("#0a0a0a", 0.95)})`,
              border: `1px solid ${alpha(accent, 0.2)}`,
              boxShadow: `inset 0 1px 2px ${alpha("#000", 0.6)}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <Typography sx={{
                fontSize: 14, fontWeight: 800, fontFamily: "monospace",
                color: alpha(accent, 0.55), letterSpacing: 1,
              }}>
                CUE {n}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography sx={{ fontSize: 8, color: alpha("#fff", 0.3), mt: 0.5, fontStyle: "italic" }}>
          Set cues from the deck controls.
        </Typography>
      </Box>
    </Stack>
  );
}

// ── FX ───────────────────────────────────────────────────────────────────
function FxTab({
  engineARef, engineBRef, red, redLight, blue, blueLight,
}: {
  engineARef: React.MutableRefObject<AudioEngineApi | null>;
  engineBRef: React.MutableRefObject<AudioEngineApi | null>;
  red: string; redLight: string; blue: string; blueLight: string;
}) {
  const [reverb, setReverb] = useState(0);
  const [delay, setDelay] = useState(0);
  const [filter, setFilter] = useState(50);

  return (
    <Stack sx={{ p: 1.25 }} spacing={1.25}>
      {/* Dual vertical VU meters */}
      <Stack direction="row" spacing={1} sx={{ height: 110 }}>
        <VuMeter label="A" color={redLight} colorDim={red} engineRef={engineARef} />
        <VuMeter label="B" color={blueLight} colorDim={blue} engineRef={engineBRef} />
      </Stack>

      {/* FX sliders */}
      <FxSlider label="Reverb" value={reverb} onChange={setReverb} color={redLight} />
      <FxSlider label="Delay" value={delay} onChange={setDelay} color={blueLight} />
      <FxSlider label="Filter" value={filter} onChange={setFilter} color={redLight} bipolar />

      <Typography sx={{ fontSize: 8, color: alpha("#fff", 0.3), mt: 0.5, fontStyle: "italic", textAlign: "center" }}>
        Global FX rack
      </Typography>
    </Stack>
  );
}

function VuMeter({
  label, color, colorDim, engineRef,
}: {
  label: string;
  color: string;
  colorDim: string;
  engineRef: React.MutableRefObject<AudioEngineApi | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peakRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let data: Uint8Array<ArrayBuffer> | null = null;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const analyser = engineRef.current?.getAnalyser?.() ?? null;
      let level = 0;
      if (analyser) {
        const bins = analyser.frequencyBinCount;
        if (!data || data.length !== bins) data = new Uint8Array(new ArrayBuffer(bins));
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        level = (sum / data.length) / 255;
      }
      peakRef.current = Math.max(level, peakRef.current * 0.9);
      const p = peakRef.current;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width, h = canvas.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cssW = w / dpr, cssH = h / dpr;
      ctx.clearRect(0, 0, cssW, cssH);

      // Segmented bar: split the column into ~18 LEDs.
      const segs = 18;
      const gap = 1.5;
      const segH = (cssH - gap * (segs + 1)) / segs;
      for (let i = 0; i < segs; i++) {
        const t = (segs - 1 - i) / (segs - 1);
        const lit = p > t * 0.95 + 0.02;
        const y = gap + i * (segH + gap);
        // Colour: green for low, yellow mid, red peak
        let c: string;
        if (t > 0.85) c = "#ff3838";
        else if (t > 0.65) c = "#ffb020";
        else c = "#34d058";
        ctx.fillStyle = lit ? c : `rgba(${t > 0.85 ? "80,25,25" : t > 0.65 ? "80,60,20" : "25,60,40"},0.5)`;
        ctx.fillRect(gap, y, cssW - gap * 2, segH);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <Box sx={{
        flex: 1,
        width: "100%",
        p: 0.5,
        borderRadius: 1,
        bgcolor: "#050506",
        border: `1px solid ${alpha(colorDim, 0.3)}`,
        boxShadow: `inset 0 2px 4px ${alpha("#000", 0.7)}`,
      }}>
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      </Box>
      <Typography sx={{
        mt: 0.5,
        fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
        fontFamily: "monospace",
        color,
      }}>
        {label}
      </Typography>
    </Box>
  );
}

function FxSlider({
  label, value, onChange, color, bipolar,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
  bipolar?: boolean;
}) {
  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.25 }}>
        <Typography sx={{
          fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
          color: alpha("#fff", 0.6), textTransform: "uppercase",
        }}>
          {label}
        </Typography>
        <Typography sx={{
          fontSize: 9, fontFamily: "monospace", color: alpha(color, 0.7),
        }}>
          {bipolar ? (value - 50).toFixed(0) : value.toFixed(0)}
        </Typography>
      </Stack>
      <Slider
        size="small"
        value={value}
        onChange={(_, v) => onChange(typeof v === "number" ? v : 0)}
        min={0} max={100}
        sx={{
          color,
          height: 4,
          "& .MuiSlider-thumb": {
            width: 12, height: 12,
            boxShadow: `0 0 8px ${alpha(color, 0.6)}`,
          },
          "& .MuiSlider-rail": { bgcolor: alpha("#fff", 0.1), opacity: 1 },
        }}
      />
    </Box>
  );
}
