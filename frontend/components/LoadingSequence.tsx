"use client";

import { useEffect, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import CircularProgress from "@mui/material/CircularProgress";

const STEPS: { label: string; dur: number }[] = [
  { label: "Analyzing your vibe", dur: 1100 },
  { label: "Summoning matching tracks", dur: 1400 },
  { label: "Pairing BPMs and keys", dur: 1100 },
  { label: "Warming up the turntables", dur: 1000 },
  { label: "Prepping the crossfader", dur: 900 },
  { label: "Tuning the dot-matrix display", dur: 900 },
];

/**
 * Centered loading scene shown between query submission and UI ready state.
 * Cycles through a sequence of tasks, marking each as "done" with a gentle
 * checkbox animation. Loops until the host tells it to stop.
 */
export function LoadingSequence({ query }: { query?: string }) {
  const theme = useTheme();
  const red = theme.palette.primary.main;
  const redLight = theme.palette.primary.light;
  const [activeIdx, setActiveIdx] = useState(0);
  const [doneIdx, setDoneIdx] = useState(-1);

  useEffect(() => {
    let cancelled = false;
    let i = 0;
    const tick = () => {
      if (cancelled) return;
      setActiveIdx(i);
      const step = STEPS[i % STEPS.length];
      setTimeout(() => {
        if (cancelled) return;
        setDoneIdx(i);
        setTimeout(() => {
          if (cancelled) return;
          i++;
          if (i < STEPS.length) tick();
          // After we've been through them all, hold on the last one (the
          // parent un-mounts us as soon as real data arrives).
          else setActiveIdx(STEPS.length - 1);
        }, 250);
      }, step.dur);
    };
    tick();
    return () => { cancelled = true; };
  }, []);

  return (
    <Box sx={{
      position: "fixed", inset: 0, zIndex: 20,
      display: "flex", alignItems: "center", justifyContent: "center",
      px: 2,
      animation: "ls-fade 0.4s ease",
      "@keyframes ls-fade": { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
    }}>
      <Box sx={{
        width: "100%",
        maxWidth: 480,
        p: { xs: 3, sm: 4 },
        background: "transparent",
        filter: `drop-shadow(0 0 24px ${alpha(red, 0.15)})`,
      }}>
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 0.5 }}>
          <Box sx={{
            width: 8, height: 8, borderRadius: "50%",
            bgcolor: redLight,
            boxShadow: `0 0 8px ${redLight}`,
            animation: "ls-dot 1.2s ease-in-out infinite",
            "@keyframes ls-dot": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.35 } },
          }} />
          <Typography sx={{
            fontSize: 10,
            fontFamily: "monospace",
            letterSpacing: 3,
            color: alpha(redLight, 0.9),
            textTransform: "uppercase",
            fontWeight: 800,
          }}>
            Building your set
          </Typography>
        </Stack>
        {query && (
          <Typography sx={{
            mb: 2.5,
            fontSize: 13,
            color: alpha("#fff", 0.65),
            fontStyle: "italic",
            borderLeft: `2px solid ${alpha(red, 0.4)}`,
            pl: 1.25,
          }}>
            &ldquo;{query}&rdquo;
          </Typography>
        )}

        <Stack spacing={1.25}>
          {STEPS.map((s, idx) => {
            const isActive = idx === activeIdx && idx > doneIdx;
            const isDone = idx <= doneIdx;
            const isPending = idx > activeIdx;
            return (
              <Stack
                key={idx}
                direction="row"
                alignItems="center"
                spacing={1.5}
                sx={{
                  opacity: isPending ? 0.3 : 1,
                  transform: isActive ? "translateX(2px)" : "translateX(0)",
                  transition: "opacity 0.35s ease, transform 0.35s ease",
                }}
              >
                <Box sx={{
                  width: 22, height: 22, flexShrink: 0,
                  borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1.5px solid ${
                    isDone ? redLight : isActive ? alpha(redLight, 0.6) : alpha("#fff", 0.12)
                  }`,
                  bgcolor: isDone ? alpha(redLight, 0.25) : "transparent",
                  boxShadow: isDone
                    ? `0 0 10px ${alpha(redLight, 0.55)}, inset 0 0 4px ${alpha(redLight, 0.35)}`
                    : "none",
                  transition: "all 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
                }}>
                  {isDone ? (
                    <CheckIcon sx={{
                      fontSize: 14,
                      color: "#fff",
                      animation: "ls-check 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
                      "@keyframes ls-check": {
                        "0%": { transform: "scale(0) rotate(-45deg)", opacity: 0 },
                        "60%": { transform: "scale(1.3) rotate(0deg)", opacity: 1 },
                        "100%": { transform: "scale(1) rotate(0deg)", opacity: 1 },
                      },
                    }} />
                  ) : isActive ? (
                    <CircularProgress size={12} thickness={6} sx={{ color: redLight }} />
                  ) : null}
                </Box>
                <Typography sx={{
                  fontSize: 13,
                  color: isDone ? alpha("#fff", 0.55) : isActive ? "#fff" : alpha("#fff", 0.7),
                  fontWeight: isActive ? 600 : 500,
                  textDecoration: isDone ? "line-through" : "none",
                  textDecorationColor: alpha(redLight, 0.5),
                  transition: "color 0.3s ease",
                }}>
                  {s.label}
                </Typography>
                {isActive && (
                  <Typography sx={{
                    fontSize: 10,
                    color: alpha(redLight, 0.65),
                    fontFamily: "monospace",
                    letterSpacing: 1.2,
                    ml: "auto !important",
                    animation: "ls-ellipsis 1s steps(4) infinite",
                    "@keyframes ls-ellipsis": {
                      "0%": { content: "'.'" },
                      "100%": { content: "'....'" },
                    },
                    "&::after": {
                      content: '"..."',
                      animation: "ls-dots 1.4s steps(4, end) infinite",
                    },
                    "@keyframes ls-dots": {
                      "0%": { opacity: 0 },
                      "40%": { opacity: 1 },
                      "100%": { opacity: 1 },
                    },
                  }}>
                    working
                  </Typography>
                )}
              </Stack>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
}
