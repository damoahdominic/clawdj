"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import * as THREE from "three";
import { DeckLayout, type DeckTrack } from "../../components/DeckLayout";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const FADE_OUT_MS = 4000;

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

// ============ FULL-SCREEN 3D LOBSTER BACKGROUND ============
function LobsterBackground({ isPlaying, bpm }: { isPlaying: boolean; bpm: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const timeRef = useRef(0);
  const isPlayingRef = useRef(isPlaying);
  const bpmRef = useRef(bpm);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const container = containerRef.current;

    async function initAndAnimate() {
      if (!container || cancelled) return;

      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      if (cancelled) return;

      const w = window.innerWidth;
      const h = window.innerHeight;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x080810);

      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 500);
      camera.position.set(0, 6, 18);
      camera.lookAt(0, 0, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      container.appendChild(renderer.domElement);

      const ambient = new THREE.AmbientLight(0x332222, 1.0);
      scene.add(ambient);

      const topSpot = new THREE.SpotLight(0xff4400, 4, 50, Math.PI / 4, 0.3);
      topSpot.position.set(0, 18, 0);
      scene.add(topSpot);

      const redLight = new THREE.PointLight(0xff2200, 3, 30);
      redLight.position.set(-8, 5, -3);
      scene.add(redLight);

      const orangeLight = new THREE.PointLight(0xff6600, 3, 30);
      orangeLight.position.set(8, 5, 3);
      scene.add(orangeLight);

      const purpleLight = new THREE.PointLight(0x8833ff, 2, 25);
      purpleLight.position.set(0, 4, -8);
      scene.add(purpleLight);

      const floorGeo = new THREE.PlaneGeometry(80, 80);
      const floorMat = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.2, metalness: 0.9 });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.5;
      scene.add(floor);

      const ringGeo = new THREE.RingGeometry(4, 6, 64);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.48;
      scene.add(ring);

      const loader = new GLTFLoader();
      const lobsters: THREE.Group[] = [];

      const fitModel = (model: THREE.Group, targetHeight: number) => {
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) model.scale.setScalar(targetHeight / maxDim);
        const box2 = new THREE.Box3().setFromObject(model);
        model.position.y = -box2.min.y - 0.5;
      };

      try {
        const [gltf1, gltf2] = await Promise.all([
          loader.loadAsync("/lobster1.glb"),
          loader.loadAsync("/lobster2.glb"),
        ]);

        if (cancelled) return;

        const positions = [
          { x: 0, z: 0, rot: 0, model: gltf1, height: 3.5 },
          { x: -5, z: 2, rot: 0.5, model: gltf2, height: 2.8 },
          { x: 5, z: 2, rot: -0.5, model: gltf2, height: 2.8 },
          { x: -3, z: -4, rot: 0.8, model: gltf1, height: 2.5 },
          { x: 3, z: -4, rot: -0.8, model: gltf1, height: 2.5 },
          { x: -7, z: -2, rot: 1.0, model: gltf2, height: 2.2 },
          { x: 7, z: -2, rot: -1.0, model: gltf2, height: 2.2 },
        ];

        for (let i = 0; i < positions.length; i++) {
          const p = positions[i];
          const clone = p.model.scene.clone(true);
          fitModel(clone, p.height);
          clone.position.x = p.x;
          clone.position.z = p.z;
          clone.rotation.y = p.rot;
          clone.userData.baseY = clone.position.y;
          clone.userData.baseRotY = p.rot;
          clone.userData.index = i;
          clone.userData.phase = Math.random() * Math.PI * 2;
          clone.userData.baseScale = clone.scale.x;
          scene.add(clone);
          lobsters.push(clone);
        }
      } catch (e) {
        console.warn("GLB load failed, using fallback shapes", e);
        const positions = [
          { x: 0, z: 0 }, { x: -4, z: 2 }, { x: 4, z: 2 },
          { x: -3, z: -3 }, { x: 3, z: -3 },
        ];
        for (let i = 0; i < positions.length; i++) {
          const group = new THREE.Group();
          const body = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.5, 1.5, 8, 12),
            new THREE.MeshStandardMaterial({ color: 0xcc2200, roughness: 0.3, metalness: 0.4 })
          );
          body.rotation.x = Math.PI / 2;
          body.position.y = 1.2;
          group.add(body);
          for (const side of [-1, 1]) {
            const eye = new THREE.Mesh(
              new THREE.SphereGeometry(0.15, 8, 8),
              new THREE.MeshBasicMaterial({ color: 0xffaa00 })
            );
            eye.position.set(side * 0.3, 2, 0.4);
            group.add(eye);
            const claw = new THREE.Mesh(
              new THREE.ConeGeometry(0.2, 0.8, 6),
              new THREE.MeshStandardMaterial({ color: 0xdd3300, roughness: 0.3 })
            );
            claw.position.set(side * 0.9, 1.5, 0.3);
            claw.rotation.z = side * 0.5;
            group.add(claw);
          }
          group.position.set(positions[i].x, 0, positions[i].z);
          group.userData.baseY = 0;
          group.userData.baseRotY = 0;
          group.userData.index = i;
          group.userData.phase = Math.random() * Math.PI * 2;
          group.userData.baseScale = 1;
          scene.add(group);
          lobsters.push(group);
        }
      }

      if (cancelled) return;

      const onResize = () => {
        const nw = window.innerWidth;
        const nh = window.innerHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      window.addEventListener("resize", onResize);

      const laserColors = [0xff0022, 0xff4400, 0xff6600, 0xaa00ff, 0x00aaff, 0xff0066];
      const lasers: THREE.Mesh[] = [];
      for (let i = 0; i < 12; i++) {
        const geo = new THREE.CylinderGeometry(0.03, 0.03, 40, 4);
        const mat = new THREE.MeshBasicMaterial({ color: laserColors[i % laserColors.length], transparent: true, opacity: 0 });
        const beam = new THREE.Mesh(geo, mat);
        beam.position.set((Math.random() - 0.5) * 20, 15, (Math.random() - 0.5) * 20);
        beam.rotation.x = (Math.random() - 0.5) * 1.2;
        beam.rotation.z = (Math.random() - 0.5) * 1.2;
        beam.userData.baseRotX = beam.rotation.x;
        beam.userData.baseRotZ = beam.rotation.z;
        beam.userData.phase = Math.random() * Math.PI * 2;
        beam.userData.speed = 0.5 + Math.random() * 2;
        beam.userData.nextFlash = Math.random() * 3;
        beam.userData.flashDur = 0;
        scene.add(beam);
        lasers.push(beam);
      }

      const animate = () => {
        if (cancelled) return;
        frameRef.current = requestAnimationFrame(animate);
        const playing = isPlayingRef.current;
        const curBpm = bpmRef.current;
        const bpmRate = curBpm > 0 ? curBpm / 120 : 1;
        timeRef.current += 0.016 * (playing ? 1 : 0.2);
        const t = timeRef.current;
        const intensity = playing ? 1.0 : 0.15;

        const orbitSpeed = 0.08 * (playing ? 1 : 0.3);
        const orbitRadius = 16 + Math.sin(t * 0.1) * 3;
        const camY = 5 + Math.sin(t * 0.15) * 2;
        camera.position.x = Math.cos(t * orbitSpeed) * orbitRadius;
        camera.position.z = Math.sin(t * orbitSpeed) * orbitRadius;
        camera.position.y = camY;
        camera.lookAt(0, 1, 0);

        for (const lobster of lobsters) {
          const i = lobster.userData.index;
          const phase = lobster.userData.phase;
          const baseY = lobster.userData.baseY;
          const baseRotY = lobster.userData.baseRotY;
          const baseScale = lobster.userData.baseScale;
          const beatT = t * bpmRate * Math.PI * 2;
          const hop = Math.abs(Math.sin(beatT + phase));
          const hopHeight = i === 0 ? 0.3 : 0.8;
          lobster.position.y = baseY + hop * hopHeight * intensity;
          const sq = 1.0 - hop * 0.12 * intensity;
          const st = 1.0 + hop * 0.12 * intensity;
          lobster.scale.set(baseScale / sq, baseScale * st, baseScale / sq);
          const swaySpeed = i === 0 ? 1.2 : 1.8;
          const swayAmount = i === 0 ? 0.1 : 0.25;
          lobster.rotation.y = baseRotY + Math.sin(t * swaySpeed + phase) * swayAmount * intensity;
          lobster.rotation.z = Math.sin(t * 2.5 + phase) * 0.06 * intensity;
          lobster.rotation.x = Math.sin(t * 1.8 + phase + 1) * 0.04 * intensity;
        }

        const pulse = Math.abs(Math.sin(t * bpmRate * Math.PI * 2));
        redLight.intensity = 2 + pulse * 2 * intensity;
        redLight.position.x = -8 + Math.sin(t * 0.3) * 2;
        orangeLight.intensity = 2 + pulse * 2 * intensity;
        orangeLight.position.x = 8 + Math.cos(t * 0.3) * 2;
        purpleLight.intensity = 1.5 + pulse * 1.5 * intensity;
        purpleLight.position.z = -8 + Math.sin(t * 0.2) * 3;
        ringMat.opacity = 0.08 + pulse * 0.15 * intensity;
        const s = 1.0 + pulse * 0.15 * intensity;
        ring.scale.set(s, s, 1);

        for (const laser of lasers) {
          const mat = laser.material as THREE.MeshBasicMaterial;
          if (playing) {
            laser.rotation.x = laser.userData.baseRotX + Math.sin(t * laser.userData.speed + laser.userData.phase) * 0.4;
            laser.rotation.z = laser.userData.baseRotZ + Math.cos(t * laser.userData.speed * 0.7 + laser.userData.phase) * 0.4;
            laser.userData.nextFlash -= 0.016;
            if (laser.userData.nextFlash <= 0) {
              laser.userData.flashDur = 0.1 + Math.random() * 0.4;
              laser.userData.nextFlash = 0.3 + Math.random() * 2.5;
              mat.color.setHex(laserColors[Math.floor(Math.random() * laserColors.length)]);
            }
            if (laser.userData.flashDur > 0) {
              laser.userData.flashDur -= 0.016;
              mat.opacity = 0.4 + pulse * 0.4;
            } else {
              mat.opacity *= 0.9;
            }
          } else {
            mat.opacity *= 0.95;
          }
        }

        renderer.render(scene, camera);
      };

      animate();
    }

    initAndAnimate();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameRef.current);
      const canvas = container.querySelector("canvas");
      if (canvas) container.removeChild(canvas);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0, touchAction: "none" }}
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
  const [infinityMode, setInfinityMode] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [crossfadeMs, setCrossfadeMs] = useState(3000);
  const [switchThreshold, setSwitchThreshold] = useState(70);
  const [minBpm, setMinBpm] = useState(0);
  const [maxBpm, setMaxBpm] = useState(200);

  // Dual deck state
  const [deckATrack, setDeckATrack] = useState<DeckTrack | null>(null);
  const [deckBTrack, setDeckBTrack] = useState<DeckTrack | null>(null);
  const [crossfaderValue, setCrossfaderValue] = useState(0);
  const [activeDeck, setActiveDeck] = useState<"a" | "b">("a");
  // Per-deck volume (0-1) for crossfader control of Web Audio gain nodes
  const [deckAVolume, setDeckAVolume] = useState(1);
  const [deckBVolume, setDeckBVolume] = useState(0);
  // Auto-scratch trigger counters (increment to fire auto-scratch on a deck)
  const [scratchActiveA, setScratchActiveA] = useState(false);
  const [scratchActiveB, setScratchActiveB] = useState(false);
  const [autoScratchA, setAutoScratchA] = useState(0);
  const [autoScratchB, setAutoScratchB] = useState(0);

  const activePlayerRef = useRef<"a" | "b">("a");
  const crossfadeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fadeOutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isCrossfadingRef = useRef(false);

  // Time tracking refs updated by onTimeUpdate (avoids 60fps state updates)
  const deckASecondsRef = useRef(0);
  const deckADurationRef = useRef(30);
  const deckBSecondsRef = useRef(0);
  const deckBDurationRef = useRef(30);

  // Derive per-deck playing state
  const isDeckAPlaying = isPlaying && (activeDeck === "a" || (isCrossfading && activeDeck === "b"));
  const isDeckBPlaying = isPlaying && (activeDeck === "b" || (isCrossfading && activeDeck === "a"));

  // Convert PlaylistTrack → DeckTrack (include preview + duration for audio engine)
  const toDeckTrack = (t: PlaylistTrack): DeckTrack => ({
    title: t.title,
    artist: t.artist,
    cover: t.cover,
    bpm: t.bpm,
    album: t.album,
    preview: t.preview,
    duration: t.duration,
  });

  const getRandomSwitchPoint = useCallback(() => {
    const base = switchThreshold / 100;
    return Math.max(0.3, Math.min(0.95, base + (Math.random() * 0.1 - 0.05)));
  }, [switchThreshold]);

  // ── Volume fade out (end of playlist) ─────────────────────────────────────

  const doFadeOut = useCallback(() => {
    const steps = 40;
    const interval = FADE_OUT_MS / steps;
    let step = 0;
    const isA = activePlayerRef.current === "a";
    fadeOutTimerRef.current = setInterval(() => {
      step++;
      const ratio = step / steps;
      if (isA) setDeckAVolume(Math.max(0, 1 - ratio));
      else setDeckBVolume(Math.max(0, 1 - ratio));
      if (step >= steps) {
        if (fadeOutTimerRef.current) clearInterval(fadeOutTimerRef.current);
        fadeOutTimerRef.current = null;
        setIsPlaying(false);
        if (isA) setDeckAVolume(1);
        else setDeckBVolume(1);
      }
    }, interval);
  }, []);

  // ── Start initial playback (deck A) ───────────────────────────────────────

  const startPlayback = useCallback((index: number, tracks?: PlaylistTrack[]) => {
    const list = tracks || playlist;
    if (index >= list.length) return;
    if (fadeOutTimerRef.current) { clearInterval(fadeOutTimerRef.current); fadeOutTimerRef.current = null; }
    setCurrentIndex(index);
    setSwitchPoint(getRandomSwitchPoint());
    setIsPlaying(true);
    setDeckATrack(toDeckTrack(list[index]));
    setDeckBTrack(null);
    setDeckAVolume(1);
    setDeckBVolume(0);
    setCrossfaderValue(0);
    activePlayerRef.current = "a";
    setActiveDeck("a");
  }, [playlist, getRandomSwitchPoint]);

  // ── Load playlist ──────────────────────────────────────────────────────────

  const loadPlaylist = useCallback(async () => {
    if (!vibeQuery.trim()) return;
    setLoading(true);
    if (crossfadeTimerRef.current) clearInterval(crossfadeTimerRef.current);
    if (fadeOutTimerRef.current) clearInterval(fadeOutTimerRef.current);
    setIsCrossfading(false);
    isCrossfadingRef.current = false;
    setIsPlaying(false);
    activePlayerRef.current = "a";
    setActiveDeck("a");
    setDeckAVolume(1);
    setDeckBVolume(0);
    try {
      const bpmParam = (minBpm > 0 || maxBpm < 200) ? `&min_bpm=${minBpm}&max_bpm=${maxBpm}` : "";
      const res = await fetch(`${API_URL}/api/vibe-playlist?q=${encodeURIComponent(vibeQuery)}&count=15${bpmParam}`);
      const data = await res.json();
      if (data.tracks?.length > 0) {
        setPlaylist(data.tracks);
        setCurrentIndex(0);
        setLoading(false);
        if (data.tracks[0]?.preview) {
          setDeckATrack(toDeckTrack(data.tracks[0]));
          setDeckBTrack(null);
          setSwitchPoint(getRandomSwitchPoint());
          setIsPlaying(true);
        }
        return;
      }
    } catch {}
    setLoading(false);
  }, [vibeQuery, minBpm, maxBpm, getRandomSwitchPoint]);

  const loadMoreTracks = useCallback(async () => {
    if (loadingMore || !vibeQuery.trim()) return;
    setLoadingMore(true);
    try {
      const existingIds = playlist.map(t => t.id).join(",");
      const bpmParam = (minBpm > 0 || maxBpm < 200) ? `&min_bpm=${minBpm}&max_bpm=${maxBpm}` : "";
      const res = await fetch(`${API_URL}/api/vibe-playlist?q=${encodeURIComponent(vibeQuery)}&count=15&exclude=${existingIds}${bpmParam}`);
      const data = await res.json();
      if (data.tracks?.length > 0) setPlaylist(prev => [...prev, ...data.tracks]);
    } catch {}
    setLoadingMore(false);
  }, [loadingMore, vibeQuery, playlist, minBpm, maxBpm]);

  // ── Crossfade with auto-scratch ────────────────────────────────────────────

  const doCrossfade = useCallback((nextIndex: number) => {
    if (isCrossfadingRef.current) return;
    if (nextIndex >= playlist.length) return;
    isCrossfadingRef.current = true;
    setIsCrossfading(true);

    const currentDeck = activePlayerRef.current;
    const nextDeck = currentDeck === "a" ? "b" : "a";
    const nextTrack = playlist[nextIndex];

    // Trigger auto-scratch on the outgoing deck
    if (currentDeck === "a") setAutoScratchA(n => n + 1);
    else setAutoScratchB(n => n + 1);

    // Load the incoming deck's track (volume=0 initially)
    if (nextDeck === "b") {
      setDeckBTrack(toDeckTrack(nextTrack));
      setDeckBVolume(0);
    } else {
      setDeckATrack(toDeckTrack(nextTrack));
      setDeckAVolume(0);
    }

    // Brief delay for auto-scratch effect, then start volume crossfade
    setTimeout(() => {
      const steps = 30;
      const interval = crossfadeMs / steps;
      const startCross = currentDeck === "a" ? 0 : 1;
      const endCross = currentDeck === "a" ? 1 : 0;
      let step = 0;

      crossfadeTimerRef.current = setInterval(() => {
        step++;
        const ratio = step / steps;
        if (currentDeck === "a") {
          setDeckAVolume(Math.max(0, 1 - ratio));
          setDeckBVolume(Math.min(1, ratio));
        } else {
          setDeckBVolume(Math.max(0, 1 - ratio));
          setDeckAVolume(Math.min(1, ratio));
        }
        setCrossfaderValue(startCross + (endCross - startCross) * ratio);

        if (step >= steps) {
          if (crossfadeTimerRef.current) clearInterval(crossfadeTimerRef.current);
          crossfadeTimerRef.current = null;
          activePlayerRef.current = nextDeck;
          setActiveDeck(nextDeck);
          setCrossfaderValue(endCross);
          if (currentDeck === "a") { setDeckAVolume(0); setDeckBVolume(1); }
          else { setDeckBVolume(0); setDeckAVolume(1); }
          setCurrentIndex(nextIndex);
          setSwitchPoint(getRandomSwitchPoint());
          setIsCrossfading(false);
          isCrossfadingRef.current = false;
        }
      }, interval);
    }, 700); // 700ms = 500ms ramp-down + 200ms reverse
  }, [playlist, crossfadeMs, getRandomSwitchPoint]);

  // Manual crossfader override
  const handleCrossfaderChange = useCallback((value: number) => {
    if (isCrossfadingRef.current && crossfadeTimerRef.current) {
      clearInterval(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
      setIsCrossfading(false);
      isCrossfadingRef.current = false;
    }
    setCrossfaderValue(value);
    setDeckAVolume(Math.max(0, 1 - value));
    setDeckBVolume(Math.min(1, value));
  }, []);

  // ── Deck scratch callbacks (visual state only) ─────────────────────────────

  const handleDeckAScratchStart = useCallback(() => setScratchActiveA(true), []);
  const handleDeckAScratchEnd = useCallback(() => setScratchActiveA(false), []);
  const handleDeckBScratchStart = useCallback(() => setScratchActiveB(true), []);
  const handleDeckBScratchEnd = useCallback(() => setScratchActiveB(false), []);

  // ── Time update callbacks (write to refs, no state churn) ─────────────────

  const handleDeckATimeUpdate = useCallback((seconds: number, duration: number) => {
    deckASecondsRef.current = seconds;
    deckADurationRef.current = duration;
  }, []);

  const handleDeckBTimeUpdate = useCallback((seconds: number, duration: number) => {
    deckBSecondsRef.current = seconds;
    deckBDurationRef.current = duration;
  }, []);

  // ── Progress + auto-crossfade ──────────────────────────────────────────────

  useEffect(() => {
    const checkProgress = () => {
      const isA = activePlayerRef.current === "a";
      const seconds = isA ? deckASecondsRef.current : deckBSecondsRef.current;
      const dur = isA ? deckADurationRef.current : deckBDurationRef.current;
      if (!dur) return;
      const pct = seconds / dur;
      setProgress(pct * 100);

      if (infinityMode && !loadingMore && playlist.length > 0) {
        const playlistProgress = (currentIndex + 1) / playlist.length;
        if (playlistProgress >= 0.7) loadMoreTracks();
      }

      if (pct >= switchPoint && !isCrossfadingRef.current) {
        const isLastTrack = currentIndex >= playlist.length - 1;
        if (!isLastTrack || infinityMode) {
          if (currentIndex + 1 < playlist.length) doCrossfade(currentIndex + 1);
          else if (!infinityMode && !fadeOutTimerRef.current) doFadeOut();
        } else if (isLastTrack && !fadeOutTimerRef.current) {
          doFadeOut();
        }
      }
    };
    const timer = setInterval(checkProgress, 100);
    return () => clearInterval(timer);
  }, [switchPoint, currentIndex, playlist.length, isCrossfading, doCrossfade, doFadeOut, infinityMode, loadingMore, loadMoreTracks]);

  // ── Transport controls ─────────────────────────────────────────────────────

  const togglePlay = () => {
    if (playlist.length === 0) return;
    if (isPlaying) {
      if (fadeOutTimerRef.current) { clearInterval(fadeOutTimerRef.current); fadeOutTimerRef.current = null; }
      setIsPlaying(false);
    } else {
      if (currentIndex < 0) startPlayback(0);
      else setIsPlaying(true);
    }
  };

  const skipToTrack = (index: number) => {
    if (crossfadeTimerRef.current) { clearInterval(crossfadeTimerRef.current); crossfadeTimerRef.current = null; }
    if (fadeOutTimerRef.current) { clearInterval(fadeOutTimerRef.current); fadeOutTimerRef.current = null; }
    setIsCrossfading(false);
    isCrossfadingRef.current = false;
    activePlayerRef.current = "a";
    setActiveDeck("a");
    setDeckAVolume(1);
    setDeckBVolume(0);
    setCrossfaderValue(0);
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

  // ---- Session persistence ----
  useEffect(() => {
    const restore = async () => {
      let session: { vibeQuery?: string; playlist?: PlaylistTrack[]; currentIndex?: number } | null = null;
      try {
        const res = await fetch(`${API_URL}/api/session`);
        if (res.ok) {
          const data = await res.json();
          if (data.playlist?.length > 0) session = data;
        }
      } catch {}
      if (!session) {
        try {
          const raw = localStorage.getItem("clawdj_session");
          if (raw) session = JSON.parse(raw);
        } catch {}
      }
      if (session?.vibeQuery) setVibeQuery(session.vibeQuery);
      if (session?.playlist && session.playlist.length > 0) {
        setPlaylist(session.playlist);
        const idx = Math.max(0, Math.min(session.currentIndex || 0, session.playlist.length - 1));
        setCurrentIndex(idx);
        setDeckATrack(toDeckTrack(session.playlist[idx]));
      }
    };
    restore();
  }, []);

  useEffect(() => {
    if (playlist.length === 0) return;
    const timer = setTimeout(() => {
      const sessionData = { vibeQuery, playlist, currentIndex };
      try { localStorage.setItem("clawdj_session", JSON.stringify(sessionData)); } catch {}
      fetch(`${API_URL}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vibe_query: vibeQuery, playlist, current_index: currentIndex, playback_position: 0 }),
      }).catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [vibeQuery, playlist, currentIndex]);

  return (
    <main className="min-h-screen text-white relative overflow-hidden">
      {/* Full-screen 3D lobster background */}
      <LobsterBackground isPlaying={isPlaying} bpm={currentBpm} />

      {/* Dark overlay */}
      <div className="fixed inset-0 bg-black/20" style={{ zIndex: 1 }} />

      {/* Settings Sidebar */}
      {showSettings && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowSettings(false)} />}
      <div className={`fixed top-0 right-0 h-full bg-gray-900/98 backdrop-blur-md border-l border-red-900/40 z-50 transition-transform duration-300 w-80 ${showSettings ? "translate-x-0" : "translate-x-full"}`}>
        <div className="p-6 space-y-6 h-full overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">DJ Settings</h2>
            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Crossfade Duration</label>
            <input type="range" min={500} max={8000} step={500} value={crossfadeMs} onChange={e => setCrossfadeMs(Number(e.target.value))} className="w-full h-2 rounded-full appearance-none bg-gray-700 accent-orange-500" />
            <div className="flex justify-between text-xs"><span className="text-gray-500">0.5s</span><span className="text-orange-400 font-mono font-bold">{(crossfadeMs / 1000).toFixed(1)}s</span><span className="text-gray-500">8s</span></div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Switch Threshold</label>
            <p className="text-xs text-gray-500">How far into the track before crossfading</p>
            <input type="range" min={30} max={95} step={5} value={switchThreshold} onChange={e => setSwitchThreshold(Number(e.target.value))} className="w-full h-2 rounded-full appearance-none bg-gray-700 accent-orange-500" />
            <div className="flex justify-between text-xs"><span className="text-gray-500">30%</span><span className="text-orange-400 font-mono font-bold">{switchThreshold}%</span><span className="text-gray-500">95%</span></div>
          </div>
          <div className="border-t border-gray-700/50 pt-4"><h3 className="text-sm font-medium text-gray-300 mb-3">BPM Range</h3></div>
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Minimum BPM</label>
            <input type="range" min={0} max={200} step={5} value={minBpm} onChange={e => setMinBpm(Number(e.target.value))} className="w-full h-2 rounded-full appearance-none bg-gray-700 accent-red-500" />
            <div className="text-xs text-red-400 font-mono">{minBpm === 0 ? "No minimum" : `${minBpm} BPM`}</div>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-gray-400">Maximum BPM</label>
            <input type="range" min={60} max={200} step={5} value={maxBpm} onChange={e => setMaxBpm(Number(e.target.value))} className="w-full h-2 rounded-full appearance-none bg-gray-700 accent-red-500" />
            <div className="text-xs text-red-400 font-mono">{maxBpm >= 200 ? "No maximum" : `${maxBpm} BPM`}</div>
          </div>
          <div className="border-t border-gray-700/50 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-300">Infinity Mode</label>
                <p className="text-xs text-gray-500 mt-0.5">Auto-loads new tracks so it never ends</p>
              </div>
              <button
                onClick={() => setInfinityMode(!infinityMode)}
                className={`w-12 h-6 rounded-full transition-colors relative ${infinityMode ? "bg-orange-500" : "bg-gray-600"}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-0.5 transition-transform ${infinityMode ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>
          <div className="border-t border-gray-700/50 pt-4 space-y-2">
            <p className="text-xs text-gray-500">
              Drag each vinyl record to scratch it while playing. The crossfader blends between Deck A and Deck B.
            </p>
          </div>
          <div className="border-t border-gray-700/50 pt-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-300">Open Source</h3>
            <a href="https://github.com/damoahdominic/clawdj" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center text-sm font-bold">C</div>
              <div><div className="text-sm font-medium text-gray-200 group-hover:text-orange-300">ClawDJ</div><div className="text-xs text-gray-500">AI-powered DJ mixing &amp; radio</div></div>
            </a>
            <a href="https://github.com/damoahdominic/anysong" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-sm font-bold">A</div>
              <div><div className="text-sm font-medium text-gray-200 group-hover:text-orange-300">AnySong</div><div className="text-xs text-gray-500">Universal music search API</div></div>
            </a>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 max-w-4xl mx-auto p-4 pt-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <a href="/" className="text-gray-400 hover:text-orange-400 transition-colors text-sm">&larr; Home</a>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 bg-clip-text text-transparent">ClawDJ Radio</h1>
          <button onClick={() => setShowSettings(!showSettings)} className="text-gray-400 hover:text-orange-400 transition-colors text-xl" title="Settings">⚙</button>
        </div>

        {/* Search */}
        <div className="flex gap-2">
          <input
            type="text"
            value={vibeQuery}
            onChange={e => setVibeQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && loadPlaylist()}
            placeholder="Describe a vibe... hip hop 2000s, chill R&B, afrobeats..."
            className="flex-1 px-4 py-3 bg-gray-900/80 backdrop-blur-sm border border-red-900/30 rounded-xl text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/30"
          />
          <button
            onClick={loadPlaylist}
            disabled={loading || !vibeQuery.trim()}
            className="px-6 py-3 bg-gradient-to-r from-red-600 to-orange-500 rounded-xl font-bold hover:from-red-500 hover:to-orange-400 disabled:opacity-50 transition-all shadow-lg shadow-red-900/30"
          >
            {loading ? "..." : "Go"}
          </button>
        </div>

        {/* Dual Deck Layout */}
        {(deckATrack || deckBTrack || playlist.length > 0) && (
          <DeckLayout
            deckA={{
              track: deckATrack,
              isPlaying: isDeckAPlaying,
              isScratchActive: scratchActiveA,
              volume: deckAVolume,
              autoScratchTrigger: autoScratchA,
              onScratchStart: handleDeckAScratchStart,
              onScratchEnd: handleDeckAScratchEnd,
              onPlayPause: togglePlay,
              onTimeUpdate: handleDeckATimeUpdate,
            }}
            deckB={{
              track: deckBTrack,
              isPlaying: isDeckBPlaying,
              isScratchActive: scratchActiveB,
              volume: deckBVolume,
              autoScratchTrigger: autoScratchB,
              onScratchStart: handleDeckBScratchStart,
              onScratchEnd: handleDeckBScratchEnd,
              onPlayPause: togglePlay,
              onTimeUpdate: handleDeckBTimeUpdate,
            }}
            crossfaderValue={crossfaderValue}
            onCrossfaderChange={handleCrossfaderChange}
            onSkipPrev={skipPrev}
            onSkipNext={skipNext}
            canSkipPrev={currentIndex > 0}
            canSkipNext={currentIndex < playlist.length - 1}
            isCrossfading={isCrossfading}
            currentIndex={currentIndex}
            playlistLength={playlist.length}
            progress={progress}
            switchPoint={switchPoint}
            crossfadeMs={crossfadeMs}
          />
        )}

        {/* Playlist */}
        {playlist.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-gray-400">
                Up next &middot; {playlist.length} tracks
                {infinityMode && <span className="text-orange-400 ml-1">&middot; ∞</span>}
                {loadingMore && <span className="text-orange-300 ml-1 animate-pulse text-xs">loading more...</span>}
              </span>
              <span className="text-xs text-gray-600">{(crossfadeMs / 1000).toFixed(1)}s crossfade</span>
            </div>
            <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl overflow-hidden divide-y divide-gray-800/30">
              {playlist.map((track, i) => (
                <button
                  key={`${track.id}-${i}`}
                  onClick={() => skipToTrack(i)}
                  className={`w-full flex items-center gap-3 p-3.5 text-left transition-all ${
                    i === currentIndex
                      ? "bg-gradient-to-r from-red-900/40 to-orange-900/20 border-l-2 border-orange-500"
                      : i < currentIndex
                      ? "opacity-40 hover:opacity-70"
                      : "hover:bg-gray-800/40"
                  }`}
                >
                  <span className={`w-6 text-right text-sm ${i === currentIndex ? "text-orange-400 font-bold" : "text-gray-600"}`}>
                    {i === currentIndex && isPlaying ? "~" : i + 1}
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
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🎛</div>
            <p className="text-gray-300 text-lg">Type a vibe and hit Go</p>
            <p className="text-xs mt-2 text-gray-500">Two decks, a crossfader, and scratch-enabled turntables</p>
            <p className="text-xs mt-1 text-gray-600">Tap ⚙ for BPM range, crossfade settings &amp; more</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pb-10 space-y-2">
          <p className="text-gray-600 text-sm">Previews powered by Deezer &middot; clawdj.com</p>
          <div className="flex items-center justify-center gap-4 text-xs">
            <a href="https://github.com/damoahdominic/clawdj" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-orange-400 transition-colors">ClawDJ on GitHub</a>
            <span className="text-gray-700">&middot;</span>
            <a href="https://github.com/damoahdominic/anysong" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-orange-400 transition-colors">AnySong on GitHub</a>
          </div>
        </div>
      </div>
    </main>
  );
}
