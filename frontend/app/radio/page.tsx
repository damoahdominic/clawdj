"use client";

import { useState, useRef, useCallback, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface PlaylistTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  preview: string;
}

export default function Radio() {
  const [vibeQuery, setVibeQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [switchPoint, setSwitchPoint] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const nextAudioRef = useRef<HTMLAudioElement>(null);

  const loadPlaylist = useCallback(async () => {
    if (!vibeQuery.trim()) return;
    setLoading(true);
    setPlaylist([]);
    setCurrentIndex(-1);
    setIsPlaying(false);

    try {
      const res = await fetch(`${API_URL}/api/vibe-playlist?q=${encodeURIComponent(vibeQuery)}&count=15`);
      const data = await res.json();
      if (data.tracks?.length > 0) {
        setPlaylist(data.tracks);
        setCurrentIndex(0);
      }
    } catch {}
    setLoading(false);
  }, [vibeQuery]);

  // Generate random switch point (50-90% through the track)
  const getRandomSwitchPoint = () => 0.5 + Math.random() * 0.4;

  // Start playback when current index changes
  useEffect(() => {
    if (currentIndex >= 0 && currentIndex < playlist.length && audioRef.current) {
      audioRef.current.src = playlist[currentIndex].preview;
      audioRef.current.load();
      setSwitchPoint(getRandomSwitchPoint());
      if (isPlaying) {
        audioRef.current.play().catch(() => {});
      }

      // Preload next track
      if (nextAudioRef.current && currentIndex + 1 < playlist.length) {
        nextAudioRef.current.src = playlist[currentIndex + 1].preview;
        nextAudioRef.current.load();
      }
    }
  }, [currentIndex, playlist]);

  // Track progress and auto-switch
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) {
        const pct = audio.currentTime / audio.duration;
        setProgress(pct * 100);

        // Auto-switch at random point
        if (pct >= switchPoint && currentIndex + 1 < playlist.length) {
          setCurrentIndex(i => i + 1);
        }
      }
    };

    const onEnded = () => {
      if (currentIndex + 1 < playlist.length) {
        setCurrentIndex(i => i + 1);
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [switchPoint, currentIndex, playlist.length]);

  const togglePlay = () => {
    if (!audioRef.current || playlist.length === 0) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      if (currentIndex < 0) setCurrentIndex(0);
      audioRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  const skipToTrack = (index: number) => {
    setCurrentIndex(index);
    setIsPlaying(true);
    setTimeout(() => audioRef.current?.play().catch(() => {}), 100);
  };

  const skipNext = () => {
    if (currentIndex + 1 < playlist.length) {
      skipToTrack(currentIndex + 1);
    }
  };

  const skipPrev = () => {
    if (currentIndex > 0) {
      skipToTrack(currentIndex - 1);
    }
  };

  const currentTrack = currentIndex >= 0 ? playlist[currentIndex] : null;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <audio ref={audioRef} preload="auto" />
      <audio ref={nextAudioRef} preload="auto" className="hidden" />

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-6">
          <a href="/" className="text-gray-400 hover:text-white transition-colors">← Mashup</a>
          <h1 className="text-3xl font-bold">🦞 ClawDJ Radio</h1>
          <div className="w-20" />
        </div>

        {/* Vibe Input */}
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

        {/* Now Playing */}
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
              <div className="text-4xl font-bold text-gray-700">
                {currentIndex + 1}/{playlist.length}
              </div>
            </div>

            {/* Progress bar */}
            <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
              {/* Switch point indicator */}
              <div
                className="absolute top-0 h-full w-0.5 bg-yellow-500/50"
                style={{ left: `${switchPoint * 100}%` }}
              />
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={skipPrev}
                disabled={currentIndex <= 0}
                className="text-2xl disabled:opacity-30 hover:scale-110 transition-transform"
              >
                ⏮
              </button>
              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center text-3xl hover:scale-105 transition-transform"
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button
                onClick={skipNext}
                disabled={currentIndex >= playlist.length - 1}
                className="text-2xl disabled:opacity-30 hover:scale-110 transition-transform"
              >
                ⏭
              </button>
            </div>
          </div>
        )}

        {/* Playlist */}
        {playlist.length > 0 && (
          <div className="space-y-1">
            <div className="text-sm text-gray-400 px-1">
              Up next · {playlist.length} tracks · switches randomly at 50-90%
            </div>
            <div className="bg-gray-900 rounded-xl overflow-hidden divide-y divide-gray-800">
              {playlist.map((track, i) => (
                <button
                  key={track.id}
                  onClick={() => skipToTrack(i)}
                  className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
                    i === currentIndex
                      ? "bg-purple-900/40"
                      : i < currentIndex
                      ? "opacity-50"
                      : "hover:bg-gray-800"
                  }`}
                >
                  <span className={`w-6 text-right text-sm ${i === currentIndex ? "text-pink-400 font-bold" : "text-gray-500"}`}>
                    {i === currentIndex && isPlaying ? "♫" : i + 1}
                  </span>
                  {track.cover && (
                    <img src={track.cover} alt="" className="w-10 h-10 rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium truncate ${i === currentIndex ? "text-white" : "text-gray-300"}`}>
                      {track.title}
                    </div>
                    <div className="text-sm text-gray-500 truncate">{track.artist}</div>
                  </div>
                  <span className="text-xs text-gray-600">
                    {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, "0")}
                  </span>
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

        <p className="text-center text-gray-600 text-sm pb-8">
          Previews powered by Deezer · clawdj.com
        </p>
      </div>
    </main>
  );
}
