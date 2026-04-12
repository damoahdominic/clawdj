"use client";

import { useState, useRef, useCallback, useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type Mode = "menu" | "radio" | "mix";

interface DeezerTrack {
  title: string;
  artist: { name: string };
  album: { title: string; cover_medium: string };
  duration: number;
  preview: string;
}

interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  filename: string;
  path: string;
  bpm: number;
  key: string;
  camelot: string;
  energy: number;
  duration_sec: number;
}

interface MixJob {
  status: "idle" | "uploading" | "searching" | "downloading" | "separating" | "analyzing" | "mixing" | "complete" | "error";
  progress: string;
  downloadUrl: string;
  error: string;
  analysis?: { a: any; b: any; compatibility: any };
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("menu");
  const [searchQuery, setSearchQuery] = useState("");
  const [vibeQuery, setVibeQuery] = useState("");
  const [vibeLoading, setVibeLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<DeezerTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [library, setLibrary] = useState<LibraryTrack[]>([]);
  const [trackA, setTrackA] = useState<string>("");
  const [trackB, setTrackB] = useState<string>("");
  const [trackALabel, setTrackALabel] = useState<string>("");
  const [trackBLabel, setTrackBLabel] = useState<string>("");
  const [vocalsFrom, setVocalsFrom] = useState<"a" | "b">("a");
  const [job, setJob] = useState<MixJob>({
    status: "idle", progress: "", downloadUrl: "", error: "",
  });
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/library`).then(r => r.json()).then(data => {
      setLibrary(data.tracks || []);
    }).catch(() => {});
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/search?q=${encodeURIComponent(searchQuery)}&limit=8`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  }, [searchQuery]);

  const handleVibe = useCallback(async () => {
    if (!vibeQuery.trim()) return;
    setVibeLoading(true);
    setJob({ status: "searching", progress: `Finding tracks for "${vibeQuery}"...`, downloadUrl: "", error: "" });
    try {
      const res = await fetch(`${API_URL}/api/vibe-mix?q=${encodeURIComponent(vibeQuery)}`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        setJob(j => ({ ...j, status: "error", error: err.detail || "Vibe search failed" }));
        setVibeLoading(false);
        return;
      }
      const data = await res.json();
      setTrackA(data.track_a.artist + " " + data.track_a.title);
      setTrackALabel(`${data.track_a.title} — ${data.track_a.artist}`);
      setTrackB(data.track_b.artist + " " + data.track_b.title);
      setTrackBLabel(`${data.track_b.title} — ${data.track_b.artist}`);
      setJob(j => ({ ...j, status: "downloading", progress: `Picked: ${data.track_a.title} x ${data.track_b.title}. Starting mix...` }));
      setVibeLoading(false);
      pollJob(data.job_id);
    } catch (e) {
      setJob(j => ({ ...j, status: "error", error: e instanceof Error ? e.message : "Unknown error" }));
      setVibeLoading(false);
    }
  }, [vibeQuery]);

  const selectTrack = (slot: "a" | "b", query: string, label: string) => {
    if (slot === "a") { setTrackA(query); setTrackALabel(label); }
    else { setTrackB(query); setTrackBLabel(label); }
  };

  const handleMix = useCallback(async () => {
    if (!trackA || !trackB) return;
    setJob({ status: "downloading", progress: "Preparing tracks...", downloadUrl: "", error: "" });
    try {
      const res = await fetch(`${API_URL}/api/mix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track_a: trackA, track_b: trackB, vocals_from: vocalsFrom }),
      });
      if (!res.ok) {
        const err = await res.json();
        setJob(j => ({ ...j, status: "error", error: err.detail || "Mix failed" }));
        return;
      }
      const data = await res.json();
      if (data.job_id) pollJob(data.job_id);
    } catch (e: any) {
      setJob(j => ({ ...j, status: "error", error: e.message }));
    }
  }, [trackA, trackB, vocalsFrom]);

  const pollJob = async (jobId: string) => {
    const ws = new WebSocket(`${API_URL.replace("http", "ws")}/ws/mix/${jobId}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) { setJob(j => ({ ...j, status: "error", error: data.error })); return; }
      switch (data.step) {
        case "downloading":
          setJob(j => ({ ...j, status: "downloading", progress: data.message || "Downloading tracks..." }));
          break;
        case "analyzing":
          setJob(j => ({ ...j, status: "analyzing", progress: "Analyzing BPM, key, and beats...", analysis: data.analysis }));
          break;
        case "separating":
          setJob(j => ({ ...j, status: "separating", progress: `Separating stems — ${data.message || ""}` }));
          break;
        case "mixing":
          setJob(j => ({ ...j, status: "mixing", progress: "Creating your mashup..." }));
          break;
        case "complete":
          setJob(j => ({ ...j, status: "complete", progress: "Done!", downloadUrl: `${API_URL}/api/download/${jobId}`, analysis: data.analysis }));
          fetch(`${API_URL}/api/library`).then(r => r.json()).then(d => setLibrary(d.tracks || [])).catch(() => {});
          break;
      }
    };
    ws.onerror = () => setJob(j => ({ ...j, status: "error", error: "Connection lost" }));
  };

  const formatDuration = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;

  const statusColors: Record<string, string> = {
    idle: "bg-gray-800", downloading: "bg-orange-900/50", searching: "bg-orange-900/50",
    uploading: "bg-orange-900/50", separating: "bg-red-900/50", analyzing: "bg-orange-900/50",
    mixing: "bg-red-900/50", complete: "bg-green-900", error: "bg-red-900",
  };

  // ============ LANDING MENU ============
  if (mode === "menu") {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="max-w-2xl w-full mx-auto p-6 space-y-10">
          <div className="text-center space-y-3">
            <h1 className="text-7xl font-bold bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 bg-clip-text text-transparent">ClawDJ</h1>
            <p className="text-gray-400 text-lg">AI-Powered DJ Engine</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Radio DJ — Recommended */}
            <button
              onClick={() => setMode("radio")}
              className="group relative rounded-2xl p-8 text-left transition-all hover:scale-[1.02] active:scale-[0.98] border-2 border-orange-500/50 bg-gradient-to-br from-red-900/40 to-orange-900/30 hover:border-orange-400 hover:shadow-xl hover:shadow-orange-900/30"
            >
              <div className="absolute top-3 right-3 px-2.5 py-1 bg-orange-500 rounded-full text-xs font-bold text-white">Recommended</div>
              <div className="text-5xl mb-4">&#127911;</div>
              <h2 className="text-2xl font-bold mb-2">Radio DJ</h2>
              <p className="text-gray-400 text-sm leading-relaxed">
                Type a vibe and get an instant playlist with crossfade transitions, BPM matching, and infinity mode. Just sit back and listen.
              </p>
              <div className="mt-4 flex items-center gap-2 text-orange-400 text-sm font-medium group-hover:gap-3 transition-all">
                <span>Start listening</span>
                <span>&rarr;</span>
              </div>
            </button>

            {/* Mashup Mixer */}
            <button
              onClick={() => setMode("mix")}
              className="group rounded-2xl p-8 text-left transition-all hover:scale-[1.02] active:scale-[0.98] border-2 border-gray-700 bg-gray-900/60 hover:border-red-500/50 hover:shadow-xl hover:shadow-red-900/20"
            >
              <div className="text-5xl mb-4">&#127926;</div>
              <h2 className="text-2xl font-bold mb-2">Mashup Mixer</h2>
              <p className="text-gray-400 text-sm leading-relaxed">
                Pick two songs, separate stems with AI, and blend vocals from one over the beat of another. Full creative control.
              </p>
              <div className="mt-4 flex items-center gap-2 text-red-400 text-sm font-medium group-hover:gap-3 transition-all">
                <span>Start mixing</span>
                <span>&rarr;</span>
              </div>
            </button>
          </div>

          <p className="text-center text-gray-600 text-sm">
            Powered by Demucs + librosa + anysong &middot; clawdj.live
          </p>
        </div>
      </main>
    );
  }

  // ============ RADIO MODE — redirect to /radio ============
  if (mode === "radio") {
    if (typeof window !== "undefined") window.location.href = "/radio";
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading Radio DJ...</p>
      </main>
    );
  }

  // ============ MASHUP MIXER ============
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Header with back button */}
        <div className="flex items-center justify-between pt-4">
          <button
            onClick={() => setMode("menu")}
            className="text-gray-400 hover:text-orange-400 transition-colors text-sm"
          >
            &larr; Back
          </button>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 bg-clip-text text-transparent">ClawDJ Mixer</h1>
          <div className="w-16" />
        </div>

        {/* Search */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search for a song... (e.g. Migos Hannah Montana)"
              className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-6 py-3 bg-red-600 rounded-xl font-bold hover:bg-red-500 disabled:opacity-50 transition-colors"
            >
              {searching ? "..." : "Search"}
            </button>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="bg-gray-900 rounded-xl overflow-hidden divide-y divide-gray-800">
              {searchResults.map((track, i) => (
                <div key={i} className="flex items-center gap-4 p-3 hover:bg-gray-800 transition-colors">
                  {track.album?.cover_medium && (
                    <img src={track.album.cover_medium} alt="" className="w-12 h-12 rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{track.title}</div>
                    <div className="text-sm text-gray-400 truncate">
                      {track.artist?.name} &mdash; {track.album?.title} &middot; {formatDuration(track.duration)}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => selectTrack("a", `${track.artist.name} ${track.title}`, `${track.title} — ${track.artist.name}`)}
                      className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
                        trackALabel === `${track.title} — ${track.artist.name}`
                          ? "bg-red-600"
                          : "bg-gray-700 hover:bg-red-600"
                      }`}
                    >
                      A
                    </button>
                    <button
                      onClick={() => selectTrack("b", `${track.artist.name} ${track.title}`, `${track.title} — ${track.artist.name}`)}
                      className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
                        trackBLabel === `${track.title} — ${track.artist.name}`
                          ? "bg-orange-600"
                          : "bg-gray-700 hover:bg-orange-600"
                      }`}
                    >
                      B
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Vibe Mode */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 to-orange-600/20 rounded-xl blur-xl" />
          <div className="relative bg-gray-900/80 border border-gray-700 rounded-xl p-4 space-y-3">
            <div className="text-center text-sm text-gray-400">Or describe a vibe and let ClawDJ pick for you</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={vibeQuery}
                onChange={(e) => setVibeQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleVibe()}
                placeholder="e.g. hip hop mid 2000s, chill R&B, 90s party bangers..."
                className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
              />
              <button
                onClick={handleVibe}
                disabled={vibeLoading || !vibeQuery.trim()}
                className="px-6 py-3 bg-gradient-to-r from-red-600 to-orange-500 rounded-xl font-bold hover:from-red-500 hover:to-orange-400 disabled:opacity-50 transition-all whitespace-nowrap"
              >
                {vibeLoading ? "..." : "Surprise Me"}
              </button>
            </div>
          </div>
        </div>

        {/* Track Selection */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-xl p-4 border-2 transition-colors ${
            trackA ? "border-red-500 bg-red-900/20" : "border-gray-700 bg-gray-900"
          }`}>
            <div className="text-sm text-gray-400 mb-1">Track A (Vocals)</div>
            <div className="font-bold text-lg truncate">
              {trackALabel || <span className="text-gray-600">Pick a song</span>}
            </div>
          </div>
          <div className={`rounded-xl p-4 border-2 transition-colors ${
            trackB ? "border-orange-500 bg-orange-900/20" : "border-gray-700 bg-gray-900"
          }`}>
            <div className="text-sm text-gray-400 mb-1">Track B (Beat)</div>
            <div className="font-bold text-lg truncate">
              {trackBLabel || <span className="text-gray-600">Pick a song</span>}
            </div>
          </div>
        </div>

        {/* Vocals selector */}
        <div className="flex items-center justify-center gap-4">
          <span className="text-sm text-gray-400">Vocals from:</span>
          <button
            onClick={() => setVocalsFrom("a")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              vocalsFrom === "a" ? "bg-red-600" : "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            Track A
          </button>
          <button
            onClick={() => setVocalsFrom("b")}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              vocalsFrom === "b" ? "bg-orange-600" : "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            Track B
          </button>
        </div>

        {/* Mix button */}
        <button
          onClick={handleMix}
          disabled={!trackA || !trackB || (job.status !== "idle" && job.status !== "complete" && job.status !== "error")}
          className="w-full py-4 rounded-xl text-xl font-bold bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {job.status === "idle" ? "Mix It!" : job.status === "complete" ? "Mix Again" : "Working..."}
        </button>

        {/* Progress */}
        {job.status !== "idle" && (
          <div className={`rounded-xl p-4 ${statusColors[job.status]} transition-colors`}>
            <div className="flex items-center gap-3">
              {!["complete", "error"].includes(job.status) && (
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              )}
              <span className="font-medium">{job.progress || job.status}</span>
            </div>
            {job.error && <p className="text-red-300 mt-2">{job.error}</p>}
          </div>
        )}

        {/* Analysis */}
        {job.analysis && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-xl p-4 space-y-1">
              <h3 className="font-bold text-red-400">Track A</h3>
              <p>BPM: <span className="font-mono">{job.analysis.a?.bpm}</span></p>
              <p>Key: <span className="font-mono">{job.analysis.a?.key} ({job.analysis.a?.camelot})</span></p>
              <p>Energy: <span className="font-mono">{job.analysis.a?.energy?.toFixed(3)}</span></p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 space-y-1">
              <h3 className="font-bold text-orange-400">Track B</h3>
              <p>BPM: <span className="font-mono">{job.analysis.b?.bpm}</span></p>
              <p>Key: <span className="font-mono">{job.analysis.b?.key} ({job.analysis.b?.camelot})</span></p>
              <p>Energy: <span className="font-mono">{job.analysis.b?.energy?.toFixed(3)}</span></p>
            </div>
            {job.analysis.compatibility && (
              <div className="col-span-2 bg-gray-900 rounded-xl p-3 text-center">
                <span className="text-orange-400 font-medium">
                  {job.analysis.compatibility.recommendation} &middot; BPM diff: {job.analysis.compatibility.bpm_diff}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Download */}
        {job.downloadUrl && (
          <div className="bg-green-900/50 rounded-xl p-6 text-center space-y-4">
            <p className="text-green-300 text-lg font-bold">Your mashup is ready!</p>
            <audio ref={audioRef} controls src={job.downloadUrl} className="w-full" />
            <a
              href={job.downloadUrl}
              download
              className="inline-block px-6 py-2 bg-green-600 rounded-lg font-bold hover:bg-green-500 transition-colors"
            >
              Download MP3
            </a>
          </div>
        )}

        {/* Library */}
        {library.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-gray-300">Your Library ({library.length} tracks)</h2>
            <div className="bg-gray-900 rounded-xl overflow-hidden divide-y divide-gray-800">
              {library.map((track, i) => (
                <div key={track.id} className="flex items-center gap-4 p-3 hover:bg-gray-800 transition-colors">
                  <span className="text-gray-500 w-6 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{track.title}</div>
                    <div className="text-sm text-gray-400">{track.artist}</div>
                  </div>
                  <div className="flex gap-3 text-sm text-gray-400">
                    <span className="font-mono">{track.bpm} BPM</span>
                    <span className="px-2 py-0.5 bg-gray-800 rounded text-xs font-bold">{track.camelot}</span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => selectTrack("a", track.path, `${track.title} — ${track.artist}`)}
                      className="px-2 py-1 rounded text-xs bg-gray-700 hover:bg-red-600 transition-colors"
                    >
                      A
                    </button>
                    <button
                      onClick={() => selectTrack("b", track.path, `${track.title} — ${track.artist}`)}
                      className="px-2 py-1 rounded text-xs bg-gray-700 hover:bg-orange-600 transition-colors"
                    >
                      B
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-gray-600 text-sm pb-8">
          Powered by Demucs + librosa + anysong &middot; clawdj.live
        </p>
      </div>
    </main>
  );
}
