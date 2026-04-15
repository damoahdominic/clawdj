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
  /** LCD aspect ratio; defaults to 3:2 (GBA-ish). */
  lcdAspectRatio?: number;
  /** Fraction of the frame width the LCD should occupy (0–1). */
  lcdWidthFrac?: number;
}

export function GameboyFrame({
  lcdContent,
  children,
  isPlaying = false,
  lcdAspectRatio = 3 / 2,
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
      {/* ── Top half: LCD bezel ─────────────────────────────────────── */}
      <Box
        sx={{
          width: `${lcdWidthFrac * 100}%`,
          mx: "auto",
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
