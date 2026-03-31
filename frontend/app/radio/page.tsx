"use client";

import { useState, useRef, useCallback, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const CROSSFADE_MS = 3000; // 3 second crossfade

interface PlaylistTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  preview: string;
  bpm: number;
}

export default function Radio() {
  const [vibeQuery, setVibeQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [switchPoint, setSwitchPoint] = useState(0);
  const [isCrossfading, setIsCrossfading] = useState(false);

  // Two audio elements for crossfade
  const audioARef = useRef<HTMLAudioElement>(null);
  const audioBRef = useRef<HTMLAudioElement>(null);
  const activePlayerRef = useRef<"a" | "b">("a");
  const crossfadeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const getActiveAudio = () => activePlayerRef.current === "a" ? audioARef.current : audioBRef.current;
  const getNextAudio = () => activePlayerRef.current === "a" ? audioBRef.current : audioARef.current;

  const loadPlaylist = useCallback(async () => {
    if (!vibeQuery.trim()) return;
    setLoading(true);
    setPlaylist([]);
    setCurrentIndex(-1);
    setIsPlaying(false);
    setIsCrossfading(false);
    if (crossfadeTimerRef.current) clearInterval(crossfadeTimerRef.current);

    try {
      const res = await fetch(`${API_URL}/api/vibe-playlist?q=${encodeURIComponent(vibeQuery)}&count=15`);
      const data = await res.json();
      if (data.tracks?.length > 0) {
        setPlaylist(data.tracks);
      }
    } catch {}
    setLoading(false);
  }, [vibeQuery]);

  const getRandomSwitchPoint = () => 0.5 + Math.random() * 0.4;

  // Crossfade: fade out current, fade in next over CROSSFADE_MS
  const doCrossfade = useCallback((nextIndex: number) => {
    if (isCrossfading) return;
    setIsCrossfading(true);

    const current = getActiveAudio();
    const next = getNextAudio();
    if (!current || !next || nextIndex >= playlist.length) {
      setIsCrossfading(false);
      return;
    }

    // Load next track
    next.src = playlist[nextIndex].preview;
    next.load();
    next.volume = 0;

    next.play().catch(() => {}).then(() => {
      const steps = 30;
      const interval = CROSSFADE_MS / steps;
      let step = 0;

      crossfadeTimerRef.current = setInterval(() => {
        step++;
        const ratio = step / steps;

        // Fade out current, fade in next
        if (current) current.volume = Math.max(0, 1 - ratio);
        if (next) next.volume = Math.min(1, ratio);

        if (step >= steps) {
          if (crossfadeTimerRef.current) clearInterval(crossfadeTimerRef.current);

          // Stop old, swap active
          current.pause();
          current.volume = 1;
          activePlayerRef.current = activePlayerRef.current === "a" ? "b" : "a";

          setCurrentIndex(nextIndex);
          setSwitchPoint(getRandomSwitchPoint());
          setIsCrossfading(false);
        }
      }, interval);
    });
  }, [isCrossfading, playlist]);

  // Track progress and trigger crossfade
  useEffect(() => {
    const checkProgress = () => {
      const audio = getActiveAudio();
      if (!audio || !audio.duration) return;

      const pct = audio.currentTime / audio.duration;
      setProgress(pct * 100);

      // Trigger crossfade at switch point
      if (pct >= switchPoint && !isCrossfading && currentIndex + 1 < playlist.length) {
        doCrossfade(currentIndex + 1);
      }
    };

    const timer = setInterval(checkProgress, 100);
    return () => clearInterval(timer);
  }, [switchPoint, currentIndex, playlist.length, isCrossfading, doCrossfade]);

  // Handle track end without crossfade
  useEffect(() => {
    const handleEnded = () => {
      if (!isCrossfading) {
        if (currentIndex + 1 < playlist.length) {
          doCrossfade(currentIndex + 1);
        } else {
          setIsPlaying(false);
        }
      }
    };

    const audioA = audioARef.current;
    const audioB = audioBRef.current;
    audioA?.addEventListener("ended", handleEnded);
    audioB?.addEventListener("ended", handleEnded);
    return () => {
      audioA?.removeEventListener("ended", handleEnded);
      audioB?.removeEventListener("ended", handleEnded);
    };
  }, [currentIndex, playlist.length, isCrossfading, doCrossfade]);

  const startPlayback = (index: number) => {
    const audio = getActiveAudio();
    if (!audio || index >= playlist.length) return;

    audio.src = playlist[index].preview;
    audio.volume = 1;
    audio.load();
    audio.play().catch(() => {});

    setCurrentIndex(index);
    setSwitchPoint(getRandomSwitchPoint());
    setIsPlaying(true);
  };

  const togglePlay = () => {
    const audio = getActiveAudio();
    if (!audio || playlist.length === 0) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (currentIndex < 0) {
        startPlayback(0);
      } else {
        audio.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  const skipToTrack = (index: number) => {
    // Stop everything
    if (crossfadeTimerRef.current) clearInterval(crossfadeTimerRef.current);
    setIsCrossfading(false);
    audioARef.current?.pause();
    audioBRef.current?.pause();
    if (audioARef.current) audioARef.current.volume = 1;
    if (audioBRef.current) audioBRef.current.volume = 1;
    activePlayerRef.current = "a";

    startPlayback(index);
  };

  const skipNext = () => {
    if (currentIndex + 1 < playlist.length) {
      if (isPlaying) {
        doCrossfade(currentIndex + 1);
      } else {
        skipToTrack(currentIndex + 1);
      }
    }
  };

  const skipPrev = () => {
    if (currentIndex > 0) skipToTrack(currentIndex - 1);
  };

  const currentTrack = currentIndex >= 0 ? playlist[currentIndex] : null;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <audio ref={audioARef} preload="auto" />
      <audio ref={audioBRef} preload="auto" />

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between pt-6">
          <a href="/" className="text-gray-400 hover:text-white transition-colors">← Mashup</a>
          <h1 className="text-3xl font-bold">🦞 ClawDJ Radio</h1>
          <div className="w-20" />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={vibeQuery}
            onChange={(e) => setVibeQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadPlaylist()}
            placeholder="Describe a vibe... hip hop 2000s, chill R&B, afrobeats..."
            className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-pink-500 focus:outline-none"
          />
          <button
            onClick={loadPlaylist}
            disabled={loading || !vibeQuery.trim()}
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-bold hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 transition-all"
          >
            {loading ? "..." : "🎵 Go"}
          </button>
        </div>

        {currentTrack && (
          <div className="bg-gray-900 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-4">
              {currentTrack.cover && (
                <img src={currentTrack.cover} alt="" className="w-20 h-20 rounded-xl shadow-lg" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xl font-bold truncate">{currentTrack.title}</div>
                <div className="text-gray-400 truncate">{currentTrack.artist}</div>
                <div className="text-gray-600 text-sm truncate">{currentTrack.album}</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-gray-700">{currentIndex + 1}/{playlist.length}</div>
                {isCrossfading && <div className="text-xs text-pink-400 animate-pulse">crossfading...</div>}
              </div>
            </div>

            <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
              <div
                className="absolute top-0 h-full w-1 bg-yellow-500/60 rounded"
                style={{ left: `${switchPoint * 100}%` }}
                title="Crossfade point"
              />
            </div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>Crossfade: 3s</span>
              <span>Switch at {Math.round(switchPoint * 100)}%</span>
            </div>

            <div className="flex items-center justify-center gap-6">
              <button onClick={skipPrev} disabled={currentIndex <= 0} className="text-2xl disabled:opacity-30 hover:scale-110 transition-transform">⏮</button>
              <button onClick={togglePlay} className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center text-3xl hover:scale-105 transition-transform">
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button onClick={skipNext} disabled={currentIndex >= playlist.length - 1} className="text-2xl disabled:opacity-30 hover:scale-110 transition-transform">⏭</button>
            </div>
          </div>
        )}

        {playlist.length > 0 && (
          <div className="space-y-1">
            <div className="text-sm text-gray-400 px-1">Up next · {playlist.length} tracks · 3s crossfade at 50-90%</div>
            <div className="bg-gray-900 rounded-xl overflow-hidden divide-y divide-gray-800">
              {playlist.map((track, i) => (
                <button
                  key={track.id}
                  onClick={() => skipToTrack(i)}
                  className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
                    i === currentIndex ? "bg-purple-900/40" : i < currentIndex ? "opacity-50" : "hover:bg-gray-800"
                  }`}
                >
                  <span className={`w-6 text-right text-sm ${i === currentIndex ? "text-pink-400 font-bold" : "text-gray-500"}`}>
                    {i === currentIndex && isPlaying ? "♫" : i + 1}
                  </span>
                  {track.cover && <img src={track.cover} alt="" className="w-10 h-10 rounded" />}
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium truncate ${i === currentIndex ? "text-white" : "text-gray-300"}`}>{track.title}</div>
                    <div className="text-sm text-gray-500 truncate">{track.artist}</div>
                  </div>
                  <div className="text-right">
                    {track.bpm > 0 && <div className="text-xs text-purple-400 font-mono">{track.bpm} BPM</div>}
                    <div className="text-xs text-gray-600">{Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, "0")}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {!playlist.length && !loading && (
          <div className="text-center text-gray-600 py-12">
            <div className="text-4xl mb-3">🎧</div>
            <p>Type a vibe and hit Go to start your radio station</p>
          </div>
        )}

        <p className="text-center text-gray-600 text-sm pb-8">Previews powered by Deezer · clawdj.com</p>
      </div>
    </main>
  );
}
