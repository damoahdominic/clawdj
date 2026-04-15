"use client";

import { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { AudioEngineApi } from "../hooks/useAudioEngine";

interface AudioLevelsProps {
  engineARef: React.MutableRefObject<AudioEngineApi | null>;
  engineBRef: React.MutableRefObject<AudioEngineApi | null>;
  /** Number of bars to render. */
  bars?: number;
  /** Overall height in pixels. */
  height?: number;
}

/**
 * Dual-deck FFT bar visualizer. Pulls frequency data from each deck's
 * AnalyserNode every RAF frame and paints stacked bars (deck A red from the
 * left, deck B light-blue from the right) on a single horizontal strip.
 */
export function AudioLevels({
  engineARef,
  engineBRef,
  bars = 48,
  height = 46,
}: AudioLevelsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  const red = theme.palette.primary.main;
  const redLight = theme.palette.primary.light;
  const blue = "#38bdf8";
  const blueLight = "#7dd3fc";

  // Track peaks for a brief afterglow that slowly drops.
  const peaksARef = useRef<Float32Array>(new Float32Array(bars));
  const peaksBRef = useRef<Float32Array>(new Float32Array(bars));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    // Reused typed arrays to avoid allocations each frame.
    let dataA: Uint8Array<ArrayBuffer> | null = null;
    let dataB: Uint8Array<ArrayBuffer> | null = null;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.height = `${height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const analyserA = engineARef.current?.getAnalyser() ?? null;
      const analyserB = engineBRef.current?.getAnalyser() ?? null;

      const binsA = analyserA ? analyserA.frequencyBinCount : 0;
      const binsB = analyserB ? analyserB.frequencyBinCount : 0;
      if (analyserA && (!dataA || dataA.length !== binsA)) dataA = new Uint8Array(new ArrayBuffer(binsA));
      if (analyserB && (!dataB || dataB.length !== binsB)) dataB = new Uint8Array(new ArrayBuffer(binsB));
      if (analyserA && dataA) analyserA.getByteFrequencyData(dataA);
      if (analyserB && dataB) analyserB.getByteFrequencyData(dataB);

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width;
      const h = canvas.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cssW = w / dpr;
      const cssH = h / dpr;

      // Background — dark recessed plate
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = "#050506";
      ctx.fillRect(0, 0, cssW, cssH);
      // Inner shadow
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, cssW - 1, cssH - 1);

      const gap = 2;
      const barW = Math.max(1.5, (cssW - gap * (bars + 1)) / bars);
      const mid = cssH / 2;

      // Helper to bucket analyser data into `bars` log-scaled bins.
      const bucket = (arr: Uint8Array<ArrayBuffer> | null, out: Float32Array) => {
        if (!arr) { out.fill(0); return; }
        const n = arr.length;
        if (n === 0) { out.fill(0); return; }
        for (let i = 0; i < bars; i++) {
          // Log-ish mapping so low frequencies get more bars.
          const t0 = Math.pow(i / bars, 1.6);
          const t1 = Math.pow((i + 1) / bars, 1.6);
          const i0 = Math.max(0, Math.floor(t0 * n));
          const i1 = Math.min(n, Math.max(i0 + 1, Math.ceil(t1 * n)));
          let sum = 0;
          for (let k = i0; k < i1; k++) sum += arr[k];
          out[i] = sum / (i1 - i0) / 255; // 0..1
        }
      };

      const sampleA = new Float32Array(bars);
      const sampleB = new Float32Array(bars);
      bucket(dataA, sampleA);
      bucket(dataB, sampleB);

      // Smoothly decay peaks.
      const decay = 0.88;
      for (let i = 0; i < bars; i++) {
        peaksARef.current[i] = Math.max(sampleA[i], peaksARef.current[i] * decay);
        peaksBRef.current[i] = Math.max(sampleB[i], peaksBRef.current[i] * decay);
      }

      for (let i = 0; i < bars; i++) {
        const x = gap + i * (barW + gap);
        const aH = peaksARef.current[i] * (cssH * 0.46);
        const bH = peaksBRef.current[i] * (cssH * 0.46);

        // Deck A — paint upward from centre
        if (aH > 0.5) {
          const gradA = ctx.createLinearGradient(0, mid - aH, 0, mid);
          gradA.addColorStop(0, redLight);
          gradA.addColorStop(0.6, red);
          gradA.addColorStop(1, alpha(red, 0.4));
          ctx.fillStyle = gradA;
          ctx.fillRect(x, mid - aH, barW, aH);
        }
        // Deck B — paint downward from centre
        if (bH > 0.5) {
          const gradB = ctx.createLinearGradient(0, mid, 0, mid + bH);
          gradB.addColorStop(0, alpha(blue, 0.4));
          gradB.addColorStop(0.4, blue);
          gradB.addColorStop(1, blueLight);
          ctx.fillStyle = gradB;
          ctx.fillRect(x, mid, barW, bH);
        }
      }

      // Centre divider — thin silver line
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(cssW, mid);
      ctx.stroke();
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, height]);

  return (
    <Box
      sx={{
        mt: 1,
        p: 0.75,
        borderRadius: "6px",
        position: "relative",
        background: `linear-gradient(180deg, ${alpha("#121212", 0.95)}, ${alpha("#060606", 0.98)})`,
        border: `1px solid ${alpha("#000", 0.7)}`,
        boxShadow: [
          `inset 0 2px 4px ${alpha("#000", 0.8)}`,
          `inset 0 -1px 0 ${alpha("#fff", 0.04)}`,
          `0 2px 4px ${alpha("#000", 0.4)}`,
        ].join(", "),
      }}
    >
      {/* Side labels */}
      <Box sx={{
        position: "absolute", left: 8, top: 6, fontSize: 8, letterSpacing: 1.5,
        fontFamily: "monospace", color: alpha(redLight, 0.7), pointerEvents: "none",
        textTransform: "uppercase", fontWeight: 800,
      }}>
        A · L
      </Box>
      <Box sx={{
        position: "absolute", right: 8, bottom: 6, fontSize: 8, letterSpacing: 1.5,
        fontFamily: "monospace", color: alpha(blueLight, 0.7), pointerEvents: "none",
        textTransform: "uppercase", fontWeight: 800,
      }}>
        B · R
      </Box>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height }} />
    </Box>
  );
}
