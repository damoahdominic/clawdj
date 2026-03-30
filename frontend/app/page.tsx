"use client";

import { useState, useRef, useCallback } from "react";

type JobStatus = "idle" | "uploading" | "separating" | "analyzing" | "mixing" | "complete" | "error";

interface Analysis {
  bpm: number;
  key: string;
  camelot: string;
  duration_sec: number;
  energy: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  const [trackA, setTrackA] = useState<File | null>(null);
  const [trackB, setTrackB] = useState<File | null>(null);
  const [status, setStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState("");
  const [analysisA, setAnalysisA] = useState<Analysis | null>(null);
  const [analysisB, setAnalysisB] = useState<Analysis | null>(null);
  const [compatibility, setCompatibility] = useState<string>("");
  const [downloadUrl, setDownloadUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleMix = useCallback(async () => {
    if (!trackA || !trackB) return;

    setStatus("uploading");
    setError("");
    setDownloadUrl("");
    setAnalysisA(null);
    setAnalysisB(null);

    const formData = new FormData();
    formData.append("track_a", trackA);
    formData.append("track_b", trackB);

    try {
      const res = await fetch(`${API_URL}/api/upload`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const { job_id } = await res.json();

      const ws = new WebSocket(`${API_URL.replace("http", "ws")}/ws/jobs/${job_id}`);

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.error) {
          setError(data.error || data.message);
          setStatus("error");
          return;
        }

        switch (data.step) {
          case "separating":
            setStatus("separating");
            setProgress(`Separating stems — Track ${data.track}...`);
            break;
          case "analyzing":
            setStatus("analyzing");
            setProgress("Analyzing BPM, key, and beats...");
            if (data.analysis) {
              setAnalysisA(data.analysis.a);
              setAnalysisB(data.analysis.b);
              setCompatibility(data.analysis.compatibility?.recommendation || "");
            }
            break;
          case "mixing":
            setStatus("mixing");
            setProgress("Creating your mashup...");
            break;
          case "complete":
            setStatus("complete");
            setProgress("Done!");
            setDownloadUrl(`${API_URL}${data.download}`);
            break;
          case "error":
            setError(data.message);
            setStatus("error");
            break;
        }
      };

      ws.onerror = () => {
        setError("WebSocket connection failed");
        setStatus("error");
      };
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    }
  }, [trackA, trackB]);

  const statusColors: Record<JobStatus, string> = {
    idle: "bg-gray-800",
    uploading: "bg-blue-900",
    separating: "bg-purple-900",
    analyzing: "bg-indigo-900",
    mixing: "bg-pink-900",
    complete: "bg-green-900",
    error: "bg-red-900",
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-6xl font-bold">🦞 ClawDJ</h1>
          <p className="text-gray-400 text-lg">AI-Powered Mashup Engine</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Track A (Vocals)</label>
            <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center hover:border-purple-500 transition-colors cursor-pointer">
              <input type="file" accept="audio/*" onChange={(e) => setTrackA(e.target.files?.[0] || null)} className="hidden" id="track-a" />
              <label htmlFor="track-a" className="cursor-pointer">
                <div className="text-3xl mb-2">🎤</div>
                <div className="text-sm text-gray-400">{trackA ? trackA.name : "Drop Track A"}</div>
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Track B (Beat)</label>
            <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center hover:border-pink-500 transition-colors cursor-pointer">
              <input type="file" accept="audio/*" onChange={(e) => setTrackB(e.target.files?.[0] || null)} className="hidden" id="track-b" />
              <label htmlFor="track-b" className="cursor-pointer">
                <div className="text-3xl mb-2">🥁</div>
                <div className="text-sm text-gray-400">{trackB ? trackB.name : "Drop Track B"}</div>
              </label>
            </div>
          </div>
        </div>

        <button
          onClick={handleMix}
          disabled={!trackA || !trackB || (status !== "idle" && status !== "complete" && status !== "error")}
          className="w-full py-4 rounded-xl text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {status === "idle" ? "🦞 Mix It!" : status === "complete" ? "🔄 Mix Again" : "⏳ Working..."}
        </button>

        {status !== "idle" && (
          <div className={`rounded-xl p-4 ${statusColors[status]} transition-colors`}>
            <div className="flex items-center gap-3">
              {status !== "complete" && status !== "error" && (
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              )}
              <span className="font-medium">{progress || status}</span>
            </div>
            {error && <p className="text-red-300 mt-2">{error}</p>}
          </div>
        )}

        {analysisA && analysisB && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900 rounded-xl p-4 space-y-2">
              <h3 className="font-bold text-purple-400">Track A</h3>
              <p>BPM: <span className="text-white font-mono">{analysisA.bpm}</span></p>
              <p>Key: <span className="text-white font-mono">{analysisA.key} ({analysisA.camelot})</span></p>
              <p>Duration: <span className="text-white font-mono">{(analysisA.duration_sec / 60).toFixed(1)}m</span></p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 space-y-2">
              <h3 className="font-bold text-pink-400">Track B</h3>
              <p>BPM: <span className="text-white font-mono">{analysisB.bpm}</span></p>
              <p>Key: <span className="text-white font-mono">{analysisB.key} ({analysisB.camelot})</span></p>
              <p>Duration: <span className="text-white font-mono">{(analysisB.duration_sec / 60).toFixed(1)}m</span></p>
            </div>
            {compatibility && (
              <div className="col-span-2 bg-gray-900 rounded-xl p-3 text-center">
                <span className="text-cyan-400 font-medium">Compatibility: {compatibility}</span>
              </div>
            )}
          </div>
        )}

        {downloadUrl && (
          <div className="bg-green-900/50 rounded-xl p-6 text-center space-y-4">
            <p className="text-green-300 text-lg font-bold">✓ Your mashup is ready!</p>
            <audio ref={audioRef} controls src={downloadUrl} className="w-full" />
            <a href={downloadUrl} download className="inline-block px-6 py-2 bg-green-600 rounded-lg font-bold hover:bg-green-500 transition-colors">
              ⬇️ Download MP3
            </a>
          </div>
        )}

        <p className="text-center text-gray-600 text-sm">Powered by Demucs + librosa • clawdj.com</p>
      </div>
    </main>
  );
}
