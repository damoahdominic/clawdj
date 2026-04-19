"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { DeckTrack } from "./DeckLayout";

interface NowPlayingLcdProps {
  track: DeckTrack | null;
}

// Fade-out duration must stay in sync with the transition below so the swap
// happens exactly when the old card is fully invisible.
const SWAP_MS = 260;

export function NowPlayingLcd({ track }: NowPlayingLcdProps) {
  const [displayed, setDisplayed] = useState<DeckTrack | null>(track);
  const [visible, setVisible] = useState(Boolean(track));
  const firstRunRef = useRef(true);

  const trackKey = track ? `${track.title}|${track.artist}|${track.cover ?? ""}` : "";
  const displayedKey = displayed ? `${displayed.title}|${displayed.artist}|${displayed.cover ?? ""}` : "";

  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      if (track) {
        setDisplayed(track);
        const t = setTimeout(() => setVisible(true), 20);
        return () => clearTimeout(t);
      }
      return;
    }
    if (trackKey === displayedKey) return;

    setVisible(false);
    const swap = setTimeout(() => {
      setDisplayed(track);
      if (track) {
        const show = setTimeout(() => setVisible(true), 20);
        return () => clearTimeout(show);
      }
    }, SWAP_MS);
    return () => clearTimeout(swap);
  }, [trackKey, displayedKey, track]);

  if (!displayed) return null;

  return (
    <Box
      sx={{
        position: "absolute",
        left: 8,
        bottom: 8,
        maxWidth: "55%",
        display: "flex",
        alignItems: "center",
        gap: 0.85,
        padding: "5px 9px 5px 5px",
        borderRadius: 0.75,
        background: `linear-gradient(180deg, ${alpha("#020408", 0.7)} 0%, ${alpha("#000", 0.82)} 100%)`,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        border: `1px solid ${alpha("#9ef59e", 0.25)}`,
        boxShadow: [
          `0 3px 12px ${alpha("#000", 0.55)}`,
          `inset 0 1px 0 ${alpha("#fff", 0.05)}`,
          `0 0 10px ${alpha("#9ef59e", visible ? 0.15 : 0)}`,
        ].join(", "),
        opacity: visible ? 1 : 0,
        transform: visible ? "translate3d(0,0,0) scale(1)" : "translate3d(0,6px,0) scale(0.97)",
        transition: [
          `opacity ${SWAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          `transform ${SWAP_MS + 80}ms cubic-bezier(0.22, 1, 0.36, 1)`,
          `box-shadow ${SWAP_MS + 160}ms ease-out`,
        ].join(", "),
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {displayed.cover ? (
        <Box
          component="img"
          src={displayed.cover}
          alt=""
          sx={{
            width: 26,
            height: 26,
            borderRadius: 0.4,
            objectFit: "cover",
            flexShrink: 0,
            boxShadow: `0 1px 4px ${alpha("#000", 0.7)}, inset 0 0 0 1px ${alpha("#fff", 0.08)}`,
          }}
        />
      ) : (
        <Box
          sx={{
            width: 26,
            height: 26,
            borderRadius: 0.4,
            flexShrink: 0,
            background: `linear-gradient(135deg, ${alpha("#1a2a1a", 0.9)}, ${alpha("#0a140a", 0.9)})`,
            boxShadow: `inset 0 0 0 1px ${alpha("#9ef59e", 0.2)}`,
          }}
        />
      )}
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <Typography
          sx={{
            fontFamily: "monospace",
            fontSize: 7.5,
            letterSpacing: 2.5,
            textTransform: "uppercase",
            color: alpha("#9ef59e", 0.75),
            lineHeight: 1,
            mb: 0.3,
          }}
        >
          ▸ Now Playing
        </Typography>
        <Typography
          sx={{
            fontFamily: "monospace",
            fontSize: 10.5,
            fontWeight: 600,
            color: "#e8ffe8",
            lineHeight: 1.15,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textShadow: `0 0 6px ${alpha("#9ef59e", 0.35)}`,
          }}
        >
          {displayed.title}
        </Typography>
        <Typography
          sx={{
            fontFamily: "monospace",
            fontSize: 9,
            color: alpha("#c8e8c8", 0.6),
            lineHeight: 1.1,
            mt: 0.15,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {displayed.artist}
        </Typography>
      </Box>
    </Box>
  );
}
