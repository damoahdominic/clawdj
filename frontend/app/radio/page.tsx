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
  bpm: number;
}

// ============ THREE.JS DANCING LOBSTER ============
function DancingLobster({ isPlaying, bpm }: { isPlaying: boolean; bpm: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<any>(null);
  const frameRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamically load Three.js
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    script.onload = () => initScene();
    document.head.appendChild(script);

    function initScene() {
      const THREE = (window as any).THREE;
      if (!THREE || !containerRef.current) return;

      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
      camera.position.set(0, 1.5, 5);
      camera.lookAt(0, 0.5, 0);

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      containerRef.current.appendChild(renderer.domElement);

      // Lighting
      const ambient = new THREE.AmbientLight(0xff6633, 0.6);
      scene.add(ambient);
      const spot = new THREE.SpotLight(0xff4400, 1.5, 20, Math.PI / 4);
      spot.position.set(3, 5, 3);
      scene.add(spot);
      const rim = new THREE.PointLight(0xff8800, 0.8, 10);
      rim.position.set(-3, 2, -2);
      scene.add(rim);

      // Floor glow
      const floorGeo = new THREE.CircleGeometry(2, 32);
      const floorMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.15 });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.5;
      scene.add(floor);

      // === Build the lobster from primitives ===
      const lobsterGroup = new THREE.Group();
      const lobsterMat = new THREE.MeshPhongMaterial({ color: 0xcc2200, shininess: 80, specular: 0xff6644 });
      const darkMat = new THREE.MeshPhongMaterial({ color: 0x881100, shininess: 60 });
      const eyeMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 100, specular: 0xffffff });
      const eyeWhiteMat = new THREE.MeshPhongMaterial({ color: 0xffeedd });

      // Body (main thorax)
      const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.8, 8, 16);
      const body = new THREE.Mesh(bodyGeo, lobsterMat);
      body.position.y = 0.5;
      lobsterGroup.add(body);

      // Tail segments
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.28 - i * 0.04, 0.2, 6, 12),
          i % 2 === 0 ? lobsterMat : darkMat
        );
        seg.position.set(0, 0.3 - i * 0.08, -0.5 - i * 0.25);
        seg.rotation.x = 0.15 * i;
        seg.name = `tail_${i}`;
        lobsterGroup.add(seg);
      }

      // Tail fan
      const fanGeo = new THREE.ConeGeometry(0.25, 0.3, 6);
      const fan = new THREE.Mesh(fanGeo, darkMat);
      fan.position.set(0, -0.15, -1.7);
      fan.rotation.x = Math.PI / 2;
      fan.name = "tailFan";
      lobsterGroup.add(fan);

      // Head
      const headGeo = new THREE.SphereGeometry(0.3, 12, 10);
      const head = new THREE.Mesh(headGeo, lobsterMat);
      head.position.set(0, 0.7, 0.55);
      head.scale.set(1, 0.9, 1.2);
      head.name = "head";
      lobsterGroup.add(head);

      // Eyes (on stalks)
      for (const side of [-1, 1]) {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.2, 8), lobsterMat);
        stalk.position.set(side * 0.18, 0.9, 0.6);
        stalk.rotation.z = side * 0.3;
        lobsterGroup.add(stalk);

        const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), eyeWhiteMat);
        eyeWhite.position.set(side * 0.22, 1.0, 0.6);
        lobsterGroup.add(eyeWhite);

        const eyeBall = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), eyeMat);
        eyeBall.position.set(side * 0.22, 1.0, 0.64);
        eyeBall.name = `eye_${side > 0 ? "r" : "l"}`;
        lobsterGroup.add(eyeBall);
      }

      // Claws (big pincers)
      for (const side of [-1, 1]) {
        const clawGroup = new THREE.Group();
        clawGroup.name = `claw_${side > 0 ? "r" : "l"}`;

        // Arm
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 6, 10), lobsterMat);
        arm.position.set(0, 0, 0);
        arm.rotation.z = side * 0.5;
        clawGroup.add(arm);

        // Pincer top
        const pincerTop = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 0.12), darkMat);
        pincerTop.position.set(side * 0.15, 0.28, 0);
        pincerTop.name = "pincerTop";
        clawGroup.add(pincerTop);

        // Pincer bottom
        const pincerBot = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 0.12), darkMat);
        pincerBot.position.set(side * 0.15, 0.18, 0);
        pincerBot.name = "pincerBot";
        clawGroup.add(pincerBot);

        clawGroup.position.set(side * 0.5, 0.7, 0.3);
        lobsterGroup.add(clawGroup);
      }

      // Legs (3 pairs)
      for (let i = 0; i < 3; i++) {
        for (const side of [-1, 1]) {
          const leg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.02, 0.4, 6),
            darkMat
          );
          leg.position.set(side * 0.35, 0.1, 0.1 - i * 0.25);
          leg.rotation.z = side * 0.8;
          leg.name = `leg_${i}_${side > 0 ? "r" : "l"}`;
          lobsterGroup.add(leg);
        }
      }

      // Antennae
      for (const side of [-1, 1]) {
        const ant = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.005, 0.8, 6),
          darkMat
        );
        ant.position.set(side * 0.12, 0.95, 0.85);
        ant.rotation.x = -0.4;
        ant.rotation.z = side * 0.3;
        ant.name = `antenna_${side > 0 ? "r" : "l"}`;
        lobsterGroup.add(ant);
      }

      lobsterGroup.position.y = -0.3;
      scene.add(lobsterGroup);

      sceneRef.current = { THREE, scene, camera, renderer, lobsterGroup, floor };

      // Handle resize
      const onResize = () => {
        if (!containerRef.current) return;
        const nw = containerRef.current.clientWidth;
        const nh = containerRef.current.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      window.addEventListener("resize", onResize);

      return () => window.removeEventListener("resize", onResize);
    }

    return () => {
      cancelAnimationFrame(frameRef.current);
      if (containerRef.current && sceneRef.current) {
        const canvas = containerRef.current.querySelector("canvas");
        if (canvas) containerRef.current.removeChild(canvas);
        sceneRef.current.renderer.dispose();
        sceneRef.current = null;
      }
    };
  }, []);

  // Animation loop — reacts to isPlaying and bpm
  useEffect(() => {
    if (!sceneRef.current) return;

    const { scene, camera, renderer, lobsterGroup, floor, THREE } = sceneRef.current;
    const speed = Math.max(60, bpm || 120) / 60; // BPM to beats-per-second

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      const delta = 0.016;
      timeRef.current += delta * (isPlaying ? speed : 0.15);
      const t = timeRef.current;

      const intensity = isPlaying ? 1.0 : 0.1;

      // Body bounce
      lobsterGroup.position.y = -0.3 + Math.abs(Math.sin(t * Math.PI * 2)) * 0.25 * intensity;
      lobsterGroup.rotation.y = Math.sin(t * 1.5) * 0.3 * intensity;

      // Head bob
      const head = lobsterGroup.getObjectByName("head");
      if (head) {
        head.rotation.z = Math.sin(t * Math.PI * 4) * 0.15 * intensity;
        head.rotation.x = Math.sin(t * Math.PI * 2) * 0.1 * intensity;
      }

      // Claw dance moves
      const clawL = lobsterGroup.getObjectByName("claw_l");
      const clawR = lobsterGroup.getObjectByName("claw_r");
      if (clawL && clawR) {
        // Arms pump up and down to the beat
        clawL.rotation.z = -0.5 + Math.sin(t * Math.PI * 2) * 0.6 * intensity;
        clawR.rotation.z = 0.5 - Math.sin(t * Math.PI * 2 + 1) * 0.6 * intensity;
        clawL.position.y = 0.7 + Math.sin(t * Math.PI * 2) * 0.2 * intensity;
        clawR.position.y = 0.7 + Math.sin(t * Math.PI * 2 + 1) * 0.2 * intensity;

        // Pincers snap to the beat
        const snapAngle = Math.sin(t * Math.PI * 4) > 0.3 ? 0.12 : 0;
        [clawL, clawR].forEach(claw => {
          const top = claw.getObjectByName("pincerTop");
          const bot = claw.getObjectByName("pincerBot");
          if (top) top.rotation.z = snapAngle * intensity;
          if (bot) bot.rotation.z = -snapAngle * intensity;
        });
      }

      // Tail wag
      for (let i = 0; i < 5; i++) {
        const seg = lobsterGroup.getObjectByName(`tail_${i}`);
        if (seg) {
          seg.rotation.y = Math.sin(t * 3 + i * 0.5) * 0.2 * intensity;
        }
      }
      const tailFan = lobsterGroup.getObjectByName("tailFan");
      if (tailFan) {
        tailFan.rotation.y = Math.sin(t * 4) * 0.3 * intensity;
      }

      // Legs scuttle
      for (let i = 0; i < 3; i++) {
        for (const side of ["r", "l"]) {
          const leg = lobsterGroup.getObjectByName(`leg_${i}_${side}`);
          if (leg) {
            leg.rotation.x = Math.sin(t * Math.PI * 3 + i * 1.2) * 0.4 * intensity;
          }
        }
      }

      // Antennae sway
      for (const side of ["r", "l"]) {
        const ant = lobsterGroup.getObjectByName(`antenna_${side}`);
        if (ant) {
          ant.rotation.z = (side === "r" ? 0.3 : -0.3) + Math.sin(t * 5 + (side === "r" ? 0 : 2)) * 0.2 * intensity;
        }
      }

      // Eyes look around when dancing
      for (const side of ["r", "l"]) {
        const eye = lobsterGroup.getObjectByName(`eye_${side}`);
        if (eye) {
          eye.position.x = (side === "r" ? 0.22 : -0.22) + Math.sin(t * 2) * 0.02 * intensity;
          eye.position.z = 0.64 + Math.cos(t * 3) * 0.015 * intensity;
        }
      }

      // Floor pulse
      if (floor) {
        floor.material.opacity = 0.1 + Math.abs(Math.sin(t * Math.PI * 2)) * 0.15 * intensity;
        const s = 1.8 + Math.sin(t * Math.PI * 2) * 0.3 * intensity;
        floor.scale.set(s, s, 1);
      }

      renderer.render(scene, camera);
    };

    animate();
    return () => cancelAnimationFrame(frameRef.current);
  }, [isPlaying, bpm]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[300px]"
      style={{ touchAction: "none" }}
    />
  );
}

// ============ MAIN RADIO COMPONENT ============
export default function Radio() {
  const [vibeQuery, setVibeQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [switchPoint, setSwitchPoint] = useState(0);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);

  // Settings
  const [crossfadeMs, setCrossfadeMs] = useState(3000);
  const [switchThreshold, setSwitchThreshold] = useState(70);
  const [minBpm, setMinBpm] = useState(0);
  const [maxBpm, setMaxBpm] = useState(200);

  // Vinyl scratch state
  const [vinylAngle, setVinylAngle] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [scratchActive, setScratchActive] = useState(false);
  const vinylRef = useRef<HTMLDivElement>(null);
  const dragStartAngle = useRef(0);
  const lastAngle = useRef(0);

  // Two audio elements for crossfade
  const audioARef = useRef<HTMLAudioElement>(null);
  const audioBRef = useRef<HTMLAudioElement>(null);
  const activePlayerRef = useRef<"a" | "b">("a");
  const crossfadeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const vinylSpinRef = useRef<number>(0);

  const getActiveAudio = () => activePlayerRef.current === "a" ? audioARef.current : audioBRef.current;
  const getNextAudio = () => activePlayerRef.current === "a" ? audioBRef.current : audioARef.current;

  const getRandomSwitchPoint = useCallback(() => {
    const base = switchThreshold / 100;
    return Math.max(0.3, Math.min(0.95, base + (Math.random() * 0.1 - 0.05)));
  }, [switchThreshold]);

  // Start playback of a specific track
  const startPlayback = useCallback((index: number, tracks?: PlaylistTrack[]) => {
    const audio = getActiveAudio();
    const list = tracks || playlist;
    if (!audio || index >= list.length) return;
    audio.src = list[index].preview;
    audio.volume = 1;
    audio.load();
    audio.play().catch(() => {});
    setCurrentIndex(index);
    setSwitchPoint(getRandomSwitchPoint());
    setIsPlaying(true);
  }, [playlist, getRandomSwitchPoint]);

  const loadPlaylist = useCallback(async () => {
    if (!vibeQuery.trim()) return;
    setLoading(true);

    // Stop current playback cleanly
    if (crossfadeTimerRef.current) clearInterval(crossfadeTimerRef.current);
    setIsCrossfading(false);
    audioARef.current?.pause();
    audioBRef.current?.pause();
    if (audioARef.current) audioARef.current.volume = 1;
    if (audioBRef.current) audioBRef.current.volume = 1;
    activePlayerRef.current = "a";

    try {
      const bpmParam = (minBpm > 0 || maxBpm < 200) ? `&min_bpm=${minBpm}&max_bpm=${maxBpm}` : "";
      const res = await fetch(`${API_URL}/api/vibe-playlist?q=${encodeURIComponent(vibeQuery)}&count=15${bpmParam}`);
      const data = await res.json();
      if (data.tracks?.length > 0) {
        setPlaylist(data.tracks);
        // Auto-play first track of new playlist
        setCurrentIndex(0);
        setLoading(false);

        const audio = audioARef.current;
        if (audio && data.tracks[0]?.preview) {
          audio.src = data.tracks[0].preview;
          audio.volume = 1;
          audio.load();
          audio.play().catch(() => {});
          setSwitchPoint(getRandomSwitchPoint());
          setIsPlaying(true);
        }
        return;
      }
    } catch {}
    setLoading(false);
  }, [vibeQuery, minBpm, maxBpm, getRandomSwitchPoint]);

  // Crossfade
  const doCrossfade = useCallback((nextIndex: number) => {
    if (isCrossfading) return;
    setIsCrossfading(true);

    const current = getActiveAudio();
    const next = getNextAudio();
    if (!current || !next || nextIndex >= playlist.length) {
      setIsCrossfading(false);
      return;
    }

    next.src = playlist[nextIndex].preview;
    next.load();
    next.volume = 0;

    next.play().catch(() => {}).then(() => {
      const steps = 30;
      const interval = crossfadeMs / steps;
      let step = 0;

      crossfadeTimerRef.current = setInterval(() => {
        step++;
        const ratio = step / steps;
        if (current) current.volume = Math.max(0, 1 - ratio);
        if (next) next.volume = Math.min(1, ratio);

        if (step >= steps) {
          if (crossfadeTimerRef.current) clearInterval(crossfadeTimerRef.current);
          current.pause();
          current.volume = 1;
          activePlayerRef.current = activePlayerRef.current === "a" ? "b" : "a";
          setCurrentIndex(nextIndex);
          setSwitchPoint(getRandomSwitchPoint());
          setIsCrossfading(false);
        }
      }, interval);
    });
  }, [isCrossfading, playlist, crossfadeMs, getRandomSwitchPoint]);

  // Vinyl spin animation
  useEffect(() => {
    if (isPlaying && !isDragging) {
      const spin = () => {
        setVinylAngle(prev => prev + 1.5);
        vinylSpinRef.current = requestAnimationFrame(spin);
      };
      vinylSpinRef.current = requestAnimationFrame(spin);
      return () => cancelAnimationFrame(vinylSpinRef.current);
    }
  }, [isPlaying, isDragging]);

  // Track progress and trigger crossfade
  useEffect(() => {
    const checkProgress = () => {
      const audio = getActiveAudio();
      if (!audio || !audio.duration) return;
      const pct = audio.currentTime / audio.duration;
      setProgress(pct * 100);

      if (pct >= switchPoint && !isCrossfading && currentIndex + 1 < playlist.length) {
        doCrossfade(currentIndex + 1);
      }
    };
    const timer = setInterval(checkProgress, 100);
    return () => clearInterval(timer);
  }, [switchPoint, currentIndex, playlist.length, isCrossfading, doCrossfade]);

  // Handle track end
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

  // Vinyl scratch handlers
  const getAngleFromEvent = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const rect = vinylRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  };

  const handleVinylDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isPlaying) return;
    e.preventDefault();
    setIsDragging(true);
    setScratchActive(true);
    dragStartAngle.current = getAngleFromEvent(e) - vinylAngle;
    lastAngle.current = vinylAngle;
    const audio = getActiveAudio();
    if (audio) {
      audio.playbackRate = 0.001;
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const angle = getAngleFromEvent(e);
      const newAngle = angle - dragStartAngle.current;
      const delta = newAngle - lastAngle.current;
      lastAngle.current = newAngle;
      setVinylAngle(newAngle);

      const audio = getActiveAudio();
      if (audio && audio.duration) {
        const timeDelta = delta * 0.008;
        const newTime = Math.max(0, Math.min(audio.duration - 0.01, audio.currentTime + timeDelta));
        audio.currentTime = newTime;
      }
    };

    const handleUp = () => {
      setIsDragging(false);
      setScratchActive(false);
      const audio = getActiveAudio();
      if (audio) {
        audio.playbackRate = 1;
      }
    };

    window.addEventListener("mousemove", handleMove, { passive: false });
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [isDragging]);

  const togglePlay = () => {
    const audio = getActiveAudio();
    if (!audio || playlist.length === 0) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      if (currentIndex < 0) startPlayback(0);
      else { audio.play().catch(() => {}); setIsPlaying(true); }
    }
  };

  const skipToTrack = (index: number) => {
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
      if (isPlaying) doCrossfade(currentIndex + 1);
      else skipToTrack(currentIndex + 1);
    }
  };

  const skipPrev = () => { if (currentIndex > 0) skipToTrack(currentIndex - 1); };

  const currentTrack = currentIndex >= 0 ? playlist[currentIndex] : null;
  const currentBpm = currentTrack?.bpm || 0;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <audio ref={audioARef} preload="auto" />
      <audio ref={audioBRef} preload="auto" />

      {/* Settings Sidebar Overlay */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowSettings(false)} />
      )}
      <div className={`fixed top-0 right-0 h-full bg-gray-900/98 backdrop-blur-md border-l border-red-900/40 z-50 transition-transform duration-300 w-80 ${showSettings ? "translate-x-0" : "translate-x-full"}`}>
        <div className="p-6 space-y-6 h-full overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">⚙️ DJ Settings</h2>
            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Crossfade Duration</label>
            <input
              type="range" min={500} max={8000} step={500} value={crossfadeMs}
              onChange={e => setCrossfadeMs(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none bg-gray-700 accent-orange-500"
            />
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">0.5s</span>
              <span className="text-orange-400 font-mono font-bold">{(crossfadeMs / 1000).toFixed(1)}s</span>
              <span className="text-gray-500">8s</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Switch Threshold</label>
            <p className="text-xs text-gray-500">How far into the track before crossfading</p>
            <input
              type="range" min={30} max={95} step={5} value={switchThreshold}
              onChange={e => setSwitchThreshold(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none bg-gray-700 accent-orange-500"
            />
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">30%</span>
              <span className="text-orange-400 font-mono font-bold">{switchThreshold}%</span>
              <span className="text-gray-500">95%</span>
            </div>
          </div>

          <div className="border-t border-gray-700/50 pt-4">
            <h3 className="text-sm font-medium text-gray-300 mb-3">BPM Range</h3>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-400">Minimum BPM</label>
            <input
              type="range" min={0} max={200} step={5} value={minBpm}
              onChange={e => setMinBpm(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none bg-gray-700 accent-red-500"
            />
            <div className="text-xs text-red-400 font-mono">{minBpm === 0 ? "No minimum" : `${minBpm} BPM`}</div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-gray-400">Maximum BPM</label>
            <input
              type="range" min={60} max={200} step={5} value={maxBpm}
              onChange={e => setMaxBpm(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none bg-gray-700 accent-red-500"
            />
            <div className="text-xs text-red-400 font-mono">{maxBpm >= 200 ? "No maximum" : `${maxBpm} BPM`}</div>
          </div>

          <div className="border-t border-gray-700/50 pt-4 space-y-2">
            <p className="text-xs text-gray-500">🎚️ BPM filters apply on next search.</p>
            <p className="text-xs text-gray-500">💿 Drag the vinyl disc to scratch while playing.</p>
            <p className="text-xs text-gray-500">🦞 Lobster dances to the beat!</p>
          </div>

          <div className="border-t border-gray-700/50 pt-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-300">Open Source</h3>
            <a href="https://github.com/damoahdominic/clawdj" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center text-sm">🦞</div>
              <div>
                <div className="text-sm font-medium text-gray-200 group-hover:text-orange-300">ClawDJ</div>
                <div className="text-xs text-gray-500">AI-powered DJ mixing & radio</div>
              </div>
              <span className="ml-auto text-gray-600 text-xs">↗</span>
            </a>
            <a href="https://github.com/damoahdominic/anysong" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-sm">🎵</div>
              <div>
                <div className="text-sm font-medium text-gray-200 group-hover:text-orange-300">AnySong</div>
                <div className="text-xs text-gray-500">Universal music search API</div>
              </div>
              <span className="ml-auto text-gray-600 text-xs">↗</span>
            </a>
          </div>
        </div>
      </div>

      {/* Main Layout: Left lobster + Right content */}
      <div className="flex min-h-screen">
        {/* Dancing Lobster Panel */}
        <div className="hidden lg:flex w-80 flex-col items-center justify-center sticky top-0 h-screen border-r border-red-900/10">
          <div className="w-full h-[400px]">
            <DancingLobster isPlaying={isPlaying} bpm={currentBpm} />
          </div>
          <div className="text-center mt-2">
            <span className="text-xs text-gray-600 font-mono">
              {isPlaying ? `🦞 vibing at ${currentBpm > 0 ? `${currentBpm} BPM` : "the beat"}` : "🦞 waiting for music..."}
            </span>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 max-w-2xl mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between pt-6">
            <a href="/" className="text-gray-400 hover:text-orange-400 transition-colors">← Mashup</a>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 bg-clip-text text-transparent">🦞 ClawDJ Radio</h1>
            <button onClick={() => setShowSettings(!showSettings)} className="text-gray-400 hover:text-orange-400 transition-colors text-2xl" title="Settings">⚙️</button>
          </div>

          {/* Search */}
          <div className="flex gap-2">
            <input
              type="text"
              value={vibeQuery}
              onChange={e => setVibeQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && loadPlaylist()}
              placeholder="Describe a vibe... hip hop 2000s, chill R&B, afrobeats..."
              className="flex-1 px-4 py-3 bg-gray-900 border border-red-900/30 rounded-xl text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/30"
            />
            <button
              onClick={loadPlaylist}
              disabled={loading || !vibeQuery.trim()}
              className="px-6 py-3 bg-gradient-to-r from-red-600 to-orange-500 rounded-xl font-bold hover:from-red-500 hover:to-orange-400 disabled:opacity-50 transition-all shadow-lg shadow-red-900/30"
            >
              {loading ? "..." : "🎵 Go"}
            </button>
          </div>

          {/* Mobile/tablet lobster — visible once playlist loads */}
          {playlist.length > 0 && (
            <div className="lg:hidden w-full h-[250px] rounded-2xl overflow-hidden bg-gray-900/50 border border-red-900/20">
              <DancingLobster isPlaying={isPlaying} bpm={currentBpm} />
            </div>
          )}

          {/* Now Playing + Vinyl */}
          {currentTrack && (
            <div className="bg-gradient-to-br from-gray-900 to-gray-900/80 rounded-2xl p-6 space-y-4 border border-red-900/20 shadow-xl shadow-red-950/20">
              <div className="flex items-start gap-6">
                {/* Vinyl Disc */}
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div
                    ref={vinylRef}
                    onMouseDown={handleVinylDown}
                    onTouchStart={handleVinylDown}
                    className={`w-40 h-40 rounded-full relative select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
                    style={{
                      transform: `rotate(${vinylAngle}deg)`,
                      background: `radial-gradient(circle at center,
                        #0a0a0a 15%, #1a1a1a 16%, #111 17%, #2a2a2a 17.5%, #111 18%,
                        #1a1a1a 25%, #222 26%, #111 26.5%,
                        #1a1a1a 35%, #252525 36%, #111 36.5%,
                        #1a1a1a 45%, #222 46%, #111 46.5%,
                        #1a1a1a 55%, #252525 56%, #111 56.5%,
                        #1a1a1a 65%, #222 66%, #111 66.5%,
                        #1a1a1a 75%, #252525 76%, #111 76.5%,
                        #1a1a1a 85%, #333 90%, #222 100%)`,
                      boxShadow: scratchActive
                        ? "0 0 40px rgba(255,80,0,0.5), 0 0 80px rgba(255,40,0,0.2), inset 0 0 30px rgba(0,0,0,0.6)"
                        : isPlaying
                        ? "0 0 25px rgba(255,60,0,0.25), inset 0 0 25px rgba(0,0,0,0.5)"
                        : "0 4px 20px rgba(0,0,0,0.5), inset 0 0 25px rgba(0,0,0,0.5)",
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-600 via-orange-500 to-yellow-500 p-0.5 shadow-lg">
                        <div className="w-full h-full rounded-full overflow-hidden bg-gray-900 flex items-center justify-center">
                          {currentTrack.cover ? (
                            <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xl">🦞</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="absolute inset-0 rounded-full pointer-events-none" style={{
                      background: "conic-gradient(from 0deg, transparent 0%, rgba(255,255,255,0.04) 10%, transparent 20%, rgba(255,255,255,0.02) 40%, transparent 60%, rgba(255,255,255,0.03) 80%, transparent 100%)",
                    }} />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-2 h-2 rounded-full bg-gray-950 border border-gray-800" />
                    </div>
                  </div>
                  <div className="mt-2 text-center">
                    {scratchActive ? (
                      <span className="text-xs text-orange-400 animate-pulse font-mono">🎚️ scratching...</span>
                    ) : isPlaying ? (
                      <span className="text-xs text-gray-600">drag to scratch</span>
                    ) : null}
                  </div>
                </div>

                {/* Track Info */}
                <div className="flex-1 min-w-0 space-y-3">
                  <div>
                    <div className="text-xl font-bold truncate">{currentTrack.title}</div>
                    <div className="text-orange-300 truncate">{currentTrack.artist}</div>
                    <div className="text-gray-600 text-sm truncate">{currentTrack.album}</div>
                  </div>

                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    {currentTrack.bpm > 0 && (
                      <span className="px-2.5 py-1 bg-red-900/40 text-red-300 rounded-full font-mono text-xs border border-red-800/30">{currentTrack.bpm} BPM</span>
                    )}
                    <span className="text-gray-500">{currentIndex + 1} / {playlist.length}</span>
                    {isCrossfading && <span className="text-orange-400 animate-pulse text-xs">crossfading...</span>}
                  </div>

                  <div className="relative h-2.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="absolute h-full bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 rounded-full transition-all duration-200"
                      style={{ width: `${progress}%` }}
                    />
                    <div
                      className="absolute top-0 h-full w-0.5 bg-white/40 rounded"
                      style={{ left: `${switchPoint * 100}%` }}
                      title="Crossfade point"
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Crossfade: {(crossfadeMs / 1000).toFixed(1)}s</span>
                    <span>Switch at {Math.round(switchPoint * 100)}%</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6 pt-2">
                <button onClick={skipPrev} disabled={currentIndex <= 0} className="text-2xl disabled:opacity-30 hover:scale-110 hover:text-orange-400 transition-all">⏮</button>
                <button onClick={togglePlay} className="w-16 h-16 rounded-full bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 flex items-center justify-center text-3xl hover:scale-105 transition-transform shadow-lg shadow-orange-900/40 active:scale-95">
                  {isPlaying ? "⏸" : "▶"}
                </button>
                <button onClick={skipNext} disabled={currentIndex >= playlist.length - 1} className="text-2xl disabled:opacity-30 hover:scale-110 hover:text-orange-400 transition-all">⏭</button>
              </div>
            </div>
          )}

          {/* Playlist */}
          {playlist.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-sm text-gray-400">Up next · {playlist.length} tracks</span>
                <span className="text-xs text-gray-600">{(crossfadeMs / 1000).toFixed(1)}s crossfade</span>
              </div>
              <div className="bg-gray-900/80 rounded-xl overflow-hidden divide-y divide-gray-800/30">
                {playlist.map((track, i) => (
                  <button
                    key={track.id}
                    onClick={() => skipToTrack(i)}
                    className={`w-full flex items-center gap-3 p-3 text-left transition-all ${
                      i === currentIndex
                        ? "bg-gradient-to-r from-red-900/40 to-orange-900/20 border-l-2 border-orange-500"
                        : i < currentIndex
                        ? "opacity-40 hover:opacity-70"
                        : "hover:bg-gray-800/40"
                    }`}
                  >
                    <span className={`w-6 text-right text-sm ${i === currentIndex ? "text-orange-400 font-bold" : "text-gray-600"}`}>
                      {i === currentIndex && isPlaying ? "♫" : i + 1}
                    </span>
                    {track.cover && <img src={track.cover} alt="" className="w-10 h-10 rounded shadow-sm" />}
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium truncate ${i === currentIndex ? "text-white" : "text-gray-300"}`}>{track.title}</div>
                      <div className="text-sm text-gray-500 truncate">{track.artist}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {track.bpm > 0 && <div className="text-xs text-red-400/80 font-mono">{track.bpm} BPM</div>}
                      <div className="text-xs text-gray-600">{Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, "0")}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!playlist.length && !loading && (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🎧</div>
              <p className="text-gray-400 text-lg">Type a vibe and hit Go</p>
              <p className="text-xs mt-2 text-gray-600">Tap ⚙️ for BPM range, crossfade settings & more</p>
            </div>
          )}

          {/* Footer */}
          <div className="text-center pb-8 space-y-2">
            <p className="text-gray-600 text-sm">Previews powered by Deezer · clawdj.com</p>
            <div className="flex items-center justify-center gap-4 text-xs">
              <a href="https://github.com/damoahdominic/clawdj" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-orange-400 transition-colors">🦞 ClawDJ on GitHub</a>
              <span className="text-gray-700">·</span>
              <a href="https://github.com/damoahdominic/anysong" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-orange-400 transition-colors">🎵 AnySong on GitHub</a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
