"use client";

import { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

interface GameboyFrameProps {
  /** Rendered inside the LCD screen area (e.g. the lobster scene). */
  lcdContent?: ReactNode;
  /** Rendered below the hinge — the existing deck layout. */
  children: ReactNode;
  /** Drives the LCD power LED pulse. */
  isPlaying?: boolean;
  /** Current track BPM — drives the flanking speaker cone pulse. */
  bpm?: number;
  /** LCD aspect ratio; defaults to 3:2 (GBA-ish). */
  lcdAspectRatio?: number;
  /** Fraction of the frame width the LCD should occupy (0–1). */
  lcdWidthFrac?: number;
}

/** Circular speaker that pulses in time with the beat. */
function Speaker({
  side,
  isPlaying,
  bpm,
}: {
  side: "L" | "R";
  isPlaying: boolean;
  bpm: number;
}) {
  // Beat duration in seconds; pulse once per beat.
  const beat = bpm > 0 ? 60 / bpm : 0.6;
  const kf = `speaker-pulse-${side}`;
  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        minWidth: 80,
      }}
    >
      {/* Outer mounting plate with 4 screw dots */}
      <Box sx={{
        position: "relative",
        width: "min(140px, 80%)",
        aspectRatio: "1 / 1",
        borderRadius: "50%",
        background: `radial-gradient(circle at 30% 28%, #2a2b2e 0%, #141518 70%, #0a0b0d 100%)`,
        border: `1px solid ${alpha("#000", 0.8)}`,
        boxShadow: [
          `inset 0 2px 4px ${alpha("#fff", 0.06)}`,
          `inset 0 -2px 4px ${alpha("#000", 0.7)}`,
          `0 3px 6px ${alpha("#000", 0.6)}`,
        ].join(", "),
      }}>
        {/* Screw dots at the corners of a bounding square */}
        {[
          { top: "10%", left: "10%" },
          { top: "10%", right: "10%" },
          { bottom: "10%", left: "10%" },
          { bottom: "10%", right: "10%" },
        ].map((pos, i) => (
          <Box key={i} sx={{
            position: "absolute", ...pos,
            width: 5, height: 5, borderRadius: "50%",
            background: `radial-gradient(circle at 30% 30%, #555, #0d0d0e)`,
            boxShadow: `inset 0 0.5px 0 ${alpha("#fff", 0.2)}, 0 0.5px 1px ${alpha("#000", 0.6)}`,
          }} />
        ))}

        {/* Surround ring — the rubbery speaker gasket */}
        <Box sx={{
          position: "absolute", inset: "14%",
          borderRadius: "50%",
          background: `radial-gradient(circle at 30% 28%, #1a1b1e 0%, #0a0b0d 80%)`,
          boxShadow: [
            `inset 0 0 0 1px ${alpha("#000", 0.9)}`,
            `inset 0 3px 6px ${alpha("#000", 0.85)}`,
          ].join(", "),
        }}>
          {/* Cone — this is the part that pulses */}
          <Box sx={{
            position: "absolute", inset: "10%",
            borderRadius: "50%",
            background: `radial-gradient(circle at 35% 30%, #3a3b3e, #141518 55%, #060608)`,
            boxShadow: [
              `inset 0 0 0 1px ${alpha("#000", 0.9)}`,
              `inset 0 2px 3px ${alpha("#fff", 0.04)}`,
            ].join(", "),
            transformOrigin: "center",
            animation: isPlaying ? `${kf} ${beat}s cubic-bezier(0.25, 0.46, 0.45, 0.94) infinite` : "none",
            [`@keyframes ${kf}`]: {
              "0%": { transform: "scale(1)", filter: "brightness(1)" },
              "25%": { transform: "scale(1.06)", filter: "brightness(1.18)" },
              "55%": { transform: "scale(0.98)", filter: "brightness(0.95)" },
              "100%": { transform: "scale(1)", filter: "brightness(1)" },
            },
          }}>
            {/* Dust cap — central dome */}
            <Box sx={{
              position: "absolute",
              top: "50%", left: "50%",
              width: "38%", height: "38%",
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              background: `radial-gradient(circle at 30% 28%, #4a4b4f 0%, #1a1b1e 60%, #050506 100%)`,
              boxShadow: [
                `inset 0 2px 2px ${alpha("#fff", 0.12)}`,
                `inset 0 -2px 3px ${alpha("#000", 0.7)}`,
                `0 2px 3px ${alpha("#000", 0.5)}`,
              ].join(", "),
            }} />
            {/* Woofer grille holes — subtle dotted pattern */}
            <Box sx={{
              position: "absolute", inset: 0,
              borderRadius: "50%",
              backgroundImage: `radial-gradient(circle at center, ${alpha("#000", 0.35)} 0.5px, transparent 1px)`,
              backgroundSize: "6px 6px",
              opacity: 0.5,
              pointerEvents: "none",
            }} />
          </Box>

          {/* Beat glow halo — expands out when playing */}
          <Box sx={{
            position: "absolute", inset: 0,
            borderRadius: "50%",
            pointerEvents: "none",
            boxShadow: isPlaying
              ? `0 0 0 2px ${alpha("#ef4444", 0.0)}, 0 0 18px ${alpha("#ef4444", 0.25)}`
              : "none",
            animation: isPlaying ? `speaker-halo-${side} ${beat}s ease-out infinite` : "none",
            [`@keyframes speaker-halo-${side}`]: {
              "0%": { boxShadow: `0 0 0 0 ${alpha("#ef4444", 0.35)}, 0 0 12px ${alpha("#ef4444", 0.2)}` },
              "70%": { boxShadow: `0 0 0 10px ${alpha("#ef4444", 0)}, 0 0 18px ${alpha("#ef4444", 0.15)}` },
              "100%": { boxShadow: `0 0 0 0 ${alpha("#ef4444", 0)}, 0 0 12px ${alpha("#ef4444", 0.2)}` },
            },
          }} />
        </Box>
      </Box>
    </Box>
  );
}

export function GameboyFrame({
  lcdContent,
  children,
  isPlaying = false,
  bpm = 120,
  lcdAspectRatio = 3 / 1,
  lcdWidthFrac = 0.5,
}: GameboyFrameProps) {
  const theme = useTheme();
  const red = theme.palette.primary.main;
  const redLight = theme.palette.primary.light;

  // Outer plastic casing — matte charcoal with a soft top light source.
  const casing = {
    borderRadius: 3,
    background: `linear-gradient(180deg, #2a2b2e 0%, #1c1d20 55%, #141416 100%)`,
    boxShadow: [
      `0 16px 40px ${alpha("#000", 0.75)}`,
      `inset 0 1px 0 ${alpha("#fff", 0.06)}`,
      `inset 0 -2px 0 ${alpha("#000", 0.5)}`,
      `0 0 0 1px ${alpha("#000", 0.6)}`,
    ].join(", "),
    border: `1px solid ${alpha("#000", 0.7)}`,
  } as const;

  return (
    <Box sx={{ ...casing, p: { xs: 1.5, sm: 2 }, position: "relative" }}>
      {/* ── Top half: full-width LCD bezel ──────────────────────────── */}
      {(() => { void lcdWidthFrac; return null; })()}
      <Box
          sx={{
            width: "100%",
            mb: { xs: 1.25, sm: 1.75 },
            p: { xs: 1, sm: 1.5 },
          borderRadius: 2.25,
          background: `
            linear-gradient(180deg, #1a1b1e 0%, #0d0e11 100%)
          `,
          border: `1px solid ${alpha("#000", 0.8)}`,
          boxShadow: [
            `inset 0 2px 6px ${alpha("#000", 0.8)}`,
            `inset 0 -1px 0 ${alpha("#fff", 0.04)}`,
            `0 2px 4px ${alpha("#000", 0.5)}`,
          ].join(", "),
          position: "relative",
        }}
      >
        {/* Power LED + tiny label row above the screen */}
        <Stack direction="row" alignItems="center" justifyContent="space-between"
          sx={{ mb: 0.75, px: 0.5 }}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Box sx={{
              width: 7, height: 7, borderRadius: "50%",
              bgcolor: isPlaying ? redLight : alpha(redLight, 0.25),
              boxShadow: isPlaying
                ? `0 0 6px ${redLight}, 0 0 12px ${alpha(redLight, 0.55)}, inset 0 -1px 1px ${alpha("#000", 0.6)}`
                : `inset 0 1px 1px ${alpha("#000", 0.7)}`,
              animation: isPlaying ? "gb-power 2s ease-in-out infinite" : "none",
              "@keyframes gb-power": {
                "0%,100%": { opacity: 1 },
                "50%": { opacity: 0.55 },
              },
            }} />
            <Typography sx={{
              fontFamily: "monospace", fontSize: 8, letterSpacing: 2,
              color: alpha("#fff", 0.45), textTransform: "uppercase",
            }}>
              Power
            </Typography>
          </Stack>
          <Typography sx={{
            fontFamily: "monospace", fontSize: 8, letterSpacing: 2,
            color: alpha("#fff", 0.3), textTransform: "uppercase",
          }}>
            CLAWDJ · MDL-200
          </Typography>
        </Stack>

        {/* Actual screen — aspect-ratio locked, the LCD "glass" */}
        <Box
          sx={{
            position: "relative",
            width: "100%",
            aspectRatio: `${lcdAspectRatio}`,
            borderRadius: 1.25,
            overflow: "hidden",
            background: "#040406",
            boxShadow: [
              `inset 0 2px 4px ${alpha("#000", 0.9)}`,
              `inset 0 0 0 1px ${alpha("#000", 0.9)}`,
              `0 0 0 1px ${alpha("#1a1b1e", 1)}`,
            ].join(", "),
          }}
        >
          {/* The rendered content (3D lobster, etc.) */}
          <Box sx={{ position: "absolute", inset: 0 }}>
            {lcdContent}
          </Box>

          {/* LCD tint — slightly green/teal cast like old handhelds */}
          <Box sx={{
            position: "absolute", inset: 0,
            background: `linear-gradient(180deg, ${alpha("#1a4020", 0.06)}, ${alpha("#1a2030", 0.12)})`,
            mixBlendMode: "multiply",
            pointerEvents: "none",
          }} />

          {/* Pixel grid — subtle RGB-ish sub-pixel pattern */}
          <Box sx={{
            position: "absolute", inset: 0,
            backgroundImage: `
              repeating-linear-gradient(90deg, rgba(0,0,0,0.18) 0 1px, transparent 1px 3px),
              repeating-linear-gradient(0deg, rgba(0,0,0,0.22) 0 1px, transparent 1px 3px)
            `,
            mixBlendMode: "multiply",
            pointerEvents: "none",
            opacity: 0.7,
          }} />

          {/* Scanline overlay */}
          <Box sx={{
            position: "absolute", inset: 0,
            backgroundImage: `repeating-linear-gradient(0deg, transparent 0 2px, ${alpha("#000", 0.18)} 2px 3px)`,
            mixBlendMode: "multiply",
            pointerEvents: "none",
          }} />

          {/* Reflective sheen */}
          <Box sx={{
            position: "absolute", inset: 0,
            background: `linear-gradient(125deg, ${alpha("#fff", 0.08)} 0%, ${alpha("#fff", 0.02)} 25%, transparent 55%)`,
            pointerEvents: "none",
          }} />

          {/* Corner vignette */}
          <Box sx={{
            position: "absolute", inset: 0,
            background: `radial-gradient(ellipse at center, transparent 55%, ${alpha("#000", 0.55)} 100%)`,
            pointerEvents: "none",
          }} />
        </Box>

        {/* Under-screen micro label */}
        <Typography sx={{
          mt: 0.5,
          fontFamily: "monospace",
          fontSize: 7,
          letterSpacing: 3,
          color: alpha("#fff", 0.22),
          textAlign: "center",
          textTransform: "uppercase",
        }}>
          Claw Dot Matrix With Stereo Sound
        </Typography>
      </Box>

      {/* ── Hinge spine ──────────────────────────────────────────────── */}
      <Box sx={{
        position: "relative",
        height: 14,
        mb: { xs: 1.25, sm: 1.75 },
        borderRadius: 0.5,
        background: `linear-gradient(180deg, ${alpha("#0a0a0b", 0.9)}, ${alpha("#1a1b1e", 0.9)})`,
        boxShadow: [
          `inset 0 1px 2px ${alpha("#000", 0.8)}`,
          `inset 0 -1px 0 ${alpha("#fff", 0.04)}`,
        ].join(", "),
      }}>
        {/* Hinge studs at both ends */}
        {[-1, 1].map((side) => (
          <Box key={side} sx={{
            position: "absolute",
            top: "50%",
            [side < 0 ? "left" : "right"]: 12,
            transform: "translateY(-50%)",
            width: 10, height: 10, borderRadius: "50%",
            background: `radial-gradient(circle at 30% 30%, #4a4b4e, #0d0e10)`,
            boxShadow: `inset 0 1px 1px ${alpha("#fff", 0.15)}, 0 1px 2px ${alpha("#000", 0.6)}`,
            border: `1px solid ${alpha("#000", 0.7)}`,
          }} />
        ))}
        {/* Subtle centre seam line */}
        <Box sx={{
          position: "absolute",
          top: "50%",
          left: 30, right: 30,
          height: 1,
          transform: "translateY(-50%)",
          background: `linear-gradient(90deg, transparent, ${alpha("#000", 0.7)} 20%, ${alpha("#000", 0.7)} 80%, transparent)`,
        }} />
      </Box>

      {/* ── Bottom half: the existing deck layout ───────────────────── */}
      {/* We don't wrap in extra chrome — the casing around the whole frame
          already reads as the device body. Children render directly here. */}
      <Box sx={{ position: "relative" }}>
        {children}
      </Box>
    </Box>
  );
}
