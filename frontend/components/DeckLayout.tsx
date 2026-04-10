"use client";

import { Turntable, TurntableProps } from "./Turntable";
import { Crossfader } from "./Crossfader";

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
  switchPoint: number;
  crossfadeMs: number;
}

function DeckPanel({
  deckId,
  track,
  isPlaying,
  accentColor,
  onPlayPause,
}: DeckProps & { accentColor: "red" | "orange" }) {
  const borderColor = accentColor === "red" ? "border-red-800/40" : "border-orange-800/40";
  const labelColor = accentColor === "red" ? "text-red-400" : "text-orange-400";
  const bpmBg = accentColor === "red" ? "bg-red-900/40 border-red-800/30 text-red-300" : "bg-orange-900/40 border-orange-800/30 text-orange-300";

  // Use audioUrl if provided, fall back to preview
  const audioSrc = track?.audioUrl || track?.preview;

  return (
    <div className={"flex flex-col items-center gap-3 flex-1 min-w-0 rounded-xl p-4 bg-gray-900/70 backdrop-blur-sm border " + borderColor}>
      <div className={"text-xs font-bold tracking-widest uppercase " + labelColor}>
        Deck {deckId}
      </div>

      <Turntable
        deckId={deckId}
        isPlaying={isPlaying}
        coverUrl={track?.cover}
        bpm={track?.bpm ?? 120}
        accentColor={accentColor}
        audioUrl={audioSrc}
      />

      <div className="h-4 flex items-center">
        {isPlaying && <span className="text-xs text-gray-600">drag to scratch</span>}
      </div>

      <div className="w-full text-center space-y-0.5 min-h-[52px] flex flex-col items-center justify-center">
        {track ? (
          <>
            <div className="text-sm font-bold truncate w-full text-center" title={track.title}>{track.title}</div>
            <div className={"text-xs truncate w-full text-center " + labelColor} title={track.artist}>{track.artist}</div>
            {track.bpm && (
              <div className={"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono border mt-1 " + bpmBg}>
                {track.bpm} BPM
              </div>
            )}
          </>
        ) : (
          <div className="text-gray-700 text-xs">No track loaded</div>
        )}
      </div>

      <button
        onClick={onPlayPause}
        disabled={!track}
        className={"w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all shadow-md disabled:opacity-30 hover:scale-105 active:scale-95 " +
          (accentColor === "red" ? "bg-gradient-to-br from-red-600 to-red-800 shadow-red-900/40" : "bg-gradient-to-br from-orange-500 to-orange-700 shadow-orange-900/40")}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>
    </div>
  );
}

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
  crossfadeMs,
}: DeckLayoutProps) {
  return (
    <div className="bg-gradient-to-br from-gray-900/90 to-gray-900/80 backdrop-blur-md rounded-2xl p-6 space-y-5 border border-red-900/20 shadow-xl shadow-red-950/20">
      <div className="flex items-start gap-4">
        <DeckPanel deckId="A" accentColor="red" {...deckA} />
        <div className="flex flex-col items-center justify-center gap-4 pt-8 flex-shrink-0 w-32">
          <Crossfader value={crossfaderValue} onChange={onCrossfaderChange} />
          <div className="flex items-center gap-3">
            <button onClick={onSkipPrev} disabled={!canSkipPrev} className="text-2xl disabled:opacity-30 hover:scale-110 hover:text-orange-400 transition-all text-gray-300">⏮</button>
            <button onClick={onSkipNext} disabled={!canSkipNext} className="text-2xl disabled:opacity-30 hover:scale-110 hover:text-orange-400 transition-all text-gray-300">⏭</button>
          </div>
          <div className="text-center">
            <span className="text-xs text-gray-500">{currentIndex + 1} / {playlistLength}</span>
            {isCrossfading && <div className="text-xs text-orange-400 animate-pulse mt-0.5">crossfading</div>}
          </div>
        </div>
        <DeckPanel deckId="B" accentColor="orange" {...deckB} />
      </div>
      {playlistLength > 0 && (
        <div className="space-y-1">
          <div className="relative h-2 bg-gray-800/80 rounded-full overflow-hidden">
            <div className="absolute h-full bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 rounded-full transition-all duration-200" style={{ width: progress + "%" }} />
            <div className="absolute top-0 h-full w-0.5 bg-white/40 rounded" style={{ left: (switchPoint * 100) + "%" }} />
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>Crossfade {(crossfadeMs / 1000).toFixed(1)}s</span>
            <span>Switch at {Math.round(switchPoint * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
