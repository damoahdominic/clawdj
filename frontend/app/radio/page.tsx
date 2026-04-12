"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import * as THREE from "three";
import {
  Box,
  Button,
  Chip,
  Container,
  Drawer,
  IconButton,
  Link as MuiLink,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SettingsIcon from "@mui/icons-material/Settings";
import CloseIcon from "@mui/icons-material/Close";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import TuneIcon from "@mui/icons-material/Tune";
import { DeckLayout, type DeckTrack } from "../../components/DeckLayout";
import { EffectsPanel, type EffectDef } from "../../components/EffectsPanel";
import { workerSetInterval } from "../../lib/workerInterval";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const FADE_OUT_MS = 4000;

const EFFECTS: EffectDef[] = [
  { name: "don", label: "Don", url: "/effects/don.mp3" },
  { name: "gunshot", label: "Gunshot", url: "/effects/gunshot.mp3" },
  { name: "scratch_that", label: "Scratch That", url: "/effects/scratch_that.mp3" },
];

interface PlaylistTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  cover: string;
  duration: number;
  preview: string;
  bpm: number;
  audioUrl?: string | null;
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

      const ambient = new THREE.AmbientLight(0x221111, 1.0);
      scene.add(ambient);

      const topSpot = new THREE.SpotLight(0xe53935, 4, 50, Math.PI / 4, 0.3);
      topSpot.position.set(0, 18, 0);
      scene.add(topSpot);

      const redLight = new THREE.PointLight(0xff2200, 3, 30);
      redLight.position.set(-8, 5, -3);
      scene.add(redLight);

      const orangeLight = new THREE.PointLight(0xab000d, 3, 30);
      orangeLight.position.set(8, 5, 3);
      scene.add(orangeLight);

      const purpleLight = new THREE.PointLight(0x660000, 2, 25);
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

      const laserColors = [0xff0022, 0xe53935, 0xab000d, 0xff6666, 0x880000, 0xff0066];
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
  const [detected, setDetected] = useState<{ type: string; label?: string | null; bpm_min?: number | null; bpm_max?: number | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [deckAProgress, setDeckAProgress] = useState(0);
  const [deckBProgress, setDeckBProgress] = useState(0);
  const [switchPoint, setSwitchPoint] = useState(0);
  const [isCrossfading, setIsCrossfading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [infinityMode, setInfinityMode] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [autoEffects, setAutoEffects] = useState(true);
  const [fullSongs, setFullSongs] = useState(true);
  const [playingEffects, setPlayingEffects] = useState<Set<string>>(() => new Set());
  const effectElsRef = useRef<Record<string, HTMLAudioElement>>({});

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
  const crossfadeTimerRef = useRef<(() => void) | null>(null);
  const fadeOutTimerRef = useRef<(() => void) | null>(null);
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
    audioUrl: t.audioUrl || undefined,
    preview: t.preview,
    duration: t.duration,
  });

  const getRandomSwitchPoint = useCallback(() => {
    const base = switchThreshold / 100;
    return Math.max(0.3, Math.min(0.95, base + (Math.random() * 0.1 - 0.05)));
  }, [switchThreshold]);

  // Fire-and-forget FX overlay. Runs on an independent <audio> element so it
  // doesn't touch the deck engines. Keeps a ref to the latest `autoEffects`
  // value so the memoized crossfade callback picks up toggles live.
  const autoEffectsRef = useRef(autoEffects);
  useEffect(() => { autoEffectsRef.current = autoEffects; }, [autoEffects]);

  const playEffect = useCallback((name: string) => {
    const eff = EFFECTS.find((e) => e.name === name);
    if (!eff) return;

    // If this effect is already playing, hard-stop the previous instance so
    // rapid clicks restart cleanly instead of stacking.
    const existing = effectElsRef.current[name];
    if (existing) {
      try {
        existing.pause();
        existing.src = "";
      } catch { /* noop */ }
      delete effectElsRef.current[name];
    }

    setPlayingEffects((prev) => {
      const next = new Set(prev);
      next.add(name);
      return next;
    });
    const clearPlaying = () => {
      if (effectElsRef.current[name]) delete effectElsRef.current[name];
      setPlayingEffects((prev) => {
        if (!prev.has(name)) return prev;
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    };
    try {
      const el = new Audio(eff.url);
      el.volume = 0.85;
      effectElsRef.current[name] = el;
      el.addEventListener("ended", clearPlaying, { once: true });
      el.addEventListener("error", clearPlaying, { once: true });
      el.play().catch(clearPlaying);
    } catch {
      clearPlaying();
    }
  }, []);

  const playRandomEffect = useCallback(() => {
    if (!autoEffectsRef.current) return;
    const eff = EFFECTS[Math.floor(Math.random() * EFFECTS.length)];
    playEffect(eff.name);
  }, [playEffect]);

  // ── Volume fade out (end of playlist) ─────────────────────────────────────

  const doFadeOut = useCallback(() => {
    const steps = 40;
    const interval = FADE_OUT_MS / steps;
    let step = 0;
    const isA = activePlayerRef.current === "a";
    fadeOutTimerRef.current = workerSetInterval(interval, () => {
      step++;
      const ratio = step / steps;
      if (isA) setDeckAVolume(Math.max(0, 1 - ratio));
      else setDeckBVolume(Math.max(0, 1 - ratio));
      if (step >= steps) {
        fadeOutTimerRef.current?.();
        fadeOutTimerRef.current = null;
        setIsPlaying(false);
        if (isA) setDeckAVolume(1);
        else setDeckBVolume(1);
      }
    });
  }, []);

  // ── Start initial playback (deck A) ───────────────────────────────────────

  const startPlayback = useCallback((index: number, tracks?: PlaylistTrack[]) => {
    const list = tracks || playlist;
    if (index >= list.length) return;
    if (fadeOutTimerRef.current) { fadeOutTimerRef.current(); fadeOutTimerRef.current = null; }
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
    crossfadeTimerRef.current?.();
    crossfadeTimerRef.current = null;
    fadeOutTimerRef.current?.();
    fadeOutTimerRef.current = null;
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
      setDetected(data.detected ?? null);
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

  // ── Background full-length batch download ──────────────────────────────────
  // A single batch_id lives for the session. Every time the playlist grows
  // (initial load or infinity-mode appends), we POST the full list to
  // /api/download-batch with the same batch_id. The backend deduplicates —
  // tracks already queued/done are skipped, new ones are appended to the
  // persistent 4-worker queue. We poll every 3s to pick up finished downloads.
  const batchIdRef = useRef<string>(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEnqueuedCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const ensurePolling = useCallback(() => {
    if (pollRef.current) return; // already polling
    const bid = batchIdRef.current;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/download-status?batch_id=${bid}`);
        const data = await res.json();
        const ready: Record<string, string | null> = data.ready || {};
        const entries = Object.entries(ready);
        if (entries.length === 0) return;

        setPlaylist((prev) => {
          let changed = false;
          const next = [...prev];
          for (const [idxStr, url] of entries) {
            const idx = Number(idxStr);
            if (url && next[idx] && !next[idx].audioUrl) {
              next[idx] = { ...next[idx], audioUrl: url };
              changed = true;
            }
          }
          return changed ? next : prev;
        });

        // Stop polling when every enqueued track has a result AND the server
        // queue is drained.
        if (entries.length >= lastEnqueuedCountRef.current && (data.queue_size ?? 0) === 0) {
          stopPolling();
        }
      } catch { /* noop */ }
    }, 3000);
  }, [stopPolling]);

  // Enqueue whenever playlist grows (or fullSongs flips on).
  useEffect(() => {
    if (!fullSongs || playlist.length === 0) { stopPolling(); return; }

    const bid = batchIdRef.current;
    lastEnqueuedCountRef.current = playlist.length;

    // POST full list — backend skips already-queued indices via _dl_seen.
    fetch(`${API_URL}/api/download-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batch_id: bid,
        tracks: playlist.map((t) => ({ artist: t.artist, title: t.title })),
      }),
    }).catch(() => { /* noop */ });

    ensurePolling();
    return stopPolling;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullSongs, playlist.length]);

  // ── Crossfade with auto-scratch ────────────────────────────────────────────

  const doCrossfade = useCallback((nextIndex: number) => {
    if (isCrossfadingRef.current) return;
    if (nextIndex >= playlist.length) return;
    isCrossfadingRef.current = true;
    setIsCrossfading(true);

    // FX overlay on every transition (if Auto Effects is on)
    playRandomEffect();

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

    // Start volume crossfade immediately so the incoming deck ramps up
    // *while* the outgoing deck does its auto-scratch — gives real overlap
    // with equal-power curves, not a slow-down-then-pick-up.
    const steps = 60;
    const interval = crossfadeMs / steps;
    const startCross = currentDeck === "a" ? 0 : 1;
    const endCross = currentDeck === "a" ? 1 : 0;
    let step = 0;

    crossfadeTimerRef.current = workerSetInterval(interval, () => {
      step++;
      const ratio = step / steps;
      // Equal-power crossfade: keeps perceived loudness constant mid-fade
      const outVol = Math.cos(ratio * Math.PI / 2);
      const inVol = Math.sin(ratio * Math.PI / 2);
      if (currentDeck === "a") {
        setDeckAVolume(outVol);
        setDeckBVolume(inVol);
      } else {
        setDeckBVolume(outVol);
        setDeckAVolume(inVol);
      }
      setCrossfaderValue(startCross + (endCross - startCross) * ratio);

      if (step >= steps) {
        crossfadeTimerRef.current?.();
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
    });
  }, [playlist, crossfadeMs, getRandomSwitchPoint, playRandomEffect]);

  // Manual crossfader override
  const handleCrossfaderChange = useCallback((value: number) => {
    if (isCrossfadingRef.current && crossfadeTimerRef.current) {
      crossfadeTimerRef.current();
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

      // Per-deck waveform progress (0–1) — independent of active deck
      const durA = deckADurationRef.current || 1;
      const durB = deckBDurationRef.current || 1;
      setDeckAProgress(Math.max(0, Math.min(1, deckASecondsRef.current / durA)));
      setDeckBProgress(Math.max(0, Math.min(1, deckBSecondsRef.current / durB)));

      if (!dur) return;
      const pct = seconds / dur;
      setProgress(pct * 100);

      if (infinityMode && !loadingMore && playlist.length > 0) {
        const playlistProgress = (currentIndex + 1) / playlist.length;
        if (playlistProgress >= 0.7) loadMoreTracks();
      }

      // Pre-roll the next track: fire the crossfade at 90% of switchPoint so
      // the incoming song fades in *against* the current one rather than
      // taking over at the handoff instant.
      const triggerAt = switchPoint * 0.9;
      if (pct >= triggerAt && !isCrossfadingRef.current) {
        const isLastTrack = currentIndex >= playlist.length - 1;
        if (!isLastTrack || infinityMode) {
          if (currentIndex + 1 < playlist.length) doCrossfade(currentIndex + 1);
          else if (!infinityMode && !fadeOutTimerRef.current) doFadeOut();
        } else if (isLastTrack && !fadeOutTimerRef.current) {
          doFadeOut();
        }
      }
    };
    const dispose = workerSetInterval(60, checkProgress);
    return dispose;
  }, [switchPoint, currentIndex, playlist.length, isCrossfading, doCrossfade, doFadeOut, infinityMode, loadingMore, loadMoreTracks]);

  // ── Transport controls ─────────────────────────────────────────────────────

  const togglePlay = () => {
    if (playlist.length === 0) return;
    if (isPlaying) {
      if (fadeOutTimerRef.current) { fadeOutTimerRef.current(); fadeOutTimerRef.current = null; }
      setIsPlaying(false);
    } else {
      if (currentIndex < 0) startPlayback(0);
      else setIsPlaying(true);
    }
  };

  const skipToTrack = (index: number) => {
    if (crossfadeTimerRef.current) { crossfadeTimerRef.current(); crossfadeTimerRef.current = null; }
    if (fadeOutTimerRef.current) { fadeOutTimerRef.current(); fadeOutTimerRef.current = null; }
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

  return <RadioView
    vibeQuery={vibeQuery} setVibeQuery={setVibeQuery}
    detected={detected}
    loading={loading} loadPlaylist={loadPlaylist}
    playlist={playlist} currentIndex={currentIndex} isPlaying={isPlaying}
    progress={progress} switchPoint={switchPoint} setSwitchPoint={setSwitchPoint}
    deckAProgress={deckAProgress} deckBProgress={deckBProgress}
    isCrossfading={isCrossfading}
    showSettings={showSettings} setShowSettings={setShowSettings}
    infinityMode={infinityMode} setInfinityMode={setInfinityMode}
    autoEffects={autoEffects} setAutoEffects={setAutoEffects}
    fullSongs={fullSongs} setFullSongs={setFullSongs}
    playingEffects={playingEffects} playEffect={playEffect}
    loadingMore={loadingMore}
    crossfadeMs={crossfadeMs} setCrossfadeMs={setCrossfadeMs}
    switchThreshold={switchThreshold} setSwitchThreshold={setSwitchThreshold}
    minBpm={minBpm} setMinBpm={setMinBpm}
    maxBpm={maxBpm} setMaxBpm={setMaxBpm}
    deckATrack={deckATrack} deckBTrack={deckBTrack}
    isDeckAPlaying={isDeckAPlaying} isDeckBPlaying={isDeckBPlaying}
    scratchActiveA={scratchActiveA} scratchActiveB={scratchActiveB}
    deckAVolume={deckAVolume} deckBVolume={deckBVolume}
    autoScratchA={autoScratchA} autoScratchB={autoScratchB}
    handleDeckAScratchStart={handleDeckAScratchStart} handleDeckAScratchEnd={handleDeckAScratchEnd}
    handleDeckBScratchStart={handleDeckBScratchStart} handleDeckBScratchEnd={handleDeckBScratchEnd}
    handleDeckATimeUpdate={handleDeckATimeUpdate} handleDeckBTimeUpdate={handleDeckBTimeUpdate}
    togglePlay={togglePlay} skipToTrack={skipToTrack} skipPrev={skipPrev} skipNext={skipNext}
    crossfaderValue={crossfaderValue} handleCrossfaderChange={handleCrossfaderChange}
    currentBpm={currentBpm}
  />;
}

// ============ MUI VIEW ============
interface RadioViewProps {
  vibeQuery: string; setVibeQuery: (v: string) => void;
  detected: { type: string; label?: string | null; bpm_min?: number | null; bpm_max?: number | null } | null;
  loading: boolean; loadPlaylist: () => void;
  playlist: PlaylistTrack[]; currentIndex: number; isPlaying: boolean;
  progress: number; switchPoint: number; setSwitchPoint: (v: number) => void;
  deckAProgress: number; deckBProgress: number;
  isCrossfading: boolean;
  showSettings: boolean; setShowSettings: (v: boolean) => void;
  infinityMode: boolean; setInfinityMode: (v: boolean) => void;
  autoEffects: boolean; setAutoEffects: (v: boolean) => void;
  fullSongs: boolean; setFullSongs: (v: boolean) => void;
  playingEffects: Set<string>;
  playEffect: (name: string) => void;
  loadingMore: boolean;
  crossfadeMs: number; setCrossfadeMs: (v: number) => void;
  switchThreshold: number; setSwitchThreshold: (v: number) => void;
  minBpm: number; setMinBpm: (v: number) => void;
  maxBpm: number; setMaxBpm: (v: number) => void;
  deckATrack: DeckTrack | null; deckBTrack: DeckTrack | null;
  isDeckAPlaying: boolean; isDeckBPlaying: boolean;
  scratchActiveA: boolean; scratchActiveB: boolean;
  deckAVolume: number; deckBVolume: number;
  autoScratchA: number; autoScratchB: number;
  handleDeckAScratchStart: () => void; handleDeckAScratchEnd: () => void;
  handleDeckBScratchStart: () => void; handleDeckBScratchEnd: () => void;
  handleDeckATimeUpdate: (s: number, d: number) => void;
  handleDeckBTimeUpdate: (s: number, d: number) => void;
  togglePlay: () => void; skipToTrack: (i: number) => void;
  skipPrev: () => void; skipNext: () => void;
  crossfaderValue: number; handleCrossfaderChange: (v: number) => void;
  currentBpm: number;
}

function RadioView(props: RadioViewProps) {
  const theme = useTheme();
  const red = theme.palette.primary.main;
  const redLight = theme.palette.primary.light;
  const {
    vibeQuery, setVibeQuery, detected, loading, loadPlaylist,
    playlist, currentIndex, isPlaying, progress, switchPoint, isCrossfading,
    showSettings, setShowSettings, infinityMode, setInfinityMode,
    autoEffects, setAutoEffects, fullSongs, setFullSongs, playingEffects, playEffect, loadingMore,
    crossfadeMs, setCrossfadeMs, switchThreshold, setSwitchThreshold,
    minBpm, setMinBpm, maxBpm, setMaxBpm,
    deckATrack, deckBTrack, isDeckAPlaying, isDeckBPlaying,
    scratchActiveA, scratchActiveB, deckAVolume, deckBVolume,
    autoScratchA, autoScratchB,
    handleDeckAScratchStart, handleDeckAScratchEnd,
    handleDeckBScratchStart, handleDeckBScratchEnd,
    handleDeckATimeUpdate, handleDeckBTimeUpdate,
    togglePlay, skipToTrack, skipPrev, skipNext,
    crossfaderValue, handleCrossfaderChange, currentBpm,
  } = props;

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        color: "text.primary",
        position: "relative",
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      <LobsterBackground isPlaying={isPlaying} bpm={currentBpm} />

      <Box sx={{ position: "fixed", inset: 0, bgcolor: alpha("#000", 0.25), zIndex: 1, pointerEvents: "none" }} />

      <Drawer
        anchor="right"
        open={showSettings}
        onClose={() => setShowSettings(false)}
        PaperProps={{
          sx: {
            width: 340,
            bgcolor: alpha("#0e0e10", 0.98),
            borderLeft: `1px solid ${alpha(red, 0.35)}`,
            backgroundImage: "none",
          },
        }}
      >
        <Stack spacing={3} sx={{ p: 3, height: "100%", overflowY: "auto" }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography
              variant="h6"
              sx={{
                fontWeight: 800,
                background: `linear-gradient(90deg, ${redLight}, ${red})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              DJ Settings
            </Typography>
            <IconButton onClick={() => setShowSettings(false)} sx={{ color: "text.secondary" }}>
              <CloseIcon />
            </IconButton>
          </Stack>

          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>Crossfade Duration</Typography>
            <Slider
              value={crossfadeMs}
              min={500}
              max={8000}
              step={500}
              onChange={(_, v) => setCrossfadeMs(v as number)}
              sx={{ color: "primary.main" }}
            />
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" sx={{ color: "text.disabled" }}>0.5s</Typography>
              <Typography variant="caption" sx={{ color: "primary.light", fontFamily: "monospace", fontWeight: 700 }}>
                {(crossfadeMs / 1000).toFixed(1)}s
              </Typography>
              <Typography variant="caption" sx={{ color: "text.disabled" }}>8s</Typography>
            </Stack>
          </Box>

          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>Switch Threshold</Typography>
            <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mb: 1 }}>
              How far into the track before crossfading
            </Typography>
            <Slider
              value={switchThreshold}
              min={30}
              max={95}
              step={5}
              onChange={(_, v) => setSwitchThreshold(v as number)}
              sx={{ color: "primary.main" }}
            />
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="caption" sx={{ color: "text.disabled" }}>30%</Typography>
              <Typography variant="caption" sx={{ color: "primary.light", fontFamily: "monospace", fontWeight: 700 }}>
                {switchThreshold}%
              </Typography>
              <Typography variant="caption" sx={{ color: "text.disabled" }}>95%</Typography>
            </Stack>
          </Box>

          <Box sx={{ borderTop: `1px solid ${alpha(red, 0.2)}`, pt: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>BPM Range</Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 0.5 }}>
              Minimum BPM
            </Typography>
            <Slider
              value={minBpm}
              min={0}
              max={200}
              step={5}
              onChange={(_, v) => setMinBpm(v as number)}
              sx={{ color: "primary.dark" }}
            />
            <Typography variant="caption" sx={{ color: "primary.light", fontFamily: "monospace" }}>
              {minBpm === 0 ? "No minimum" : `${minBpm} BPM`}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 2, mb: 0.5 }}>
              Maximum BPM
            </Typography>
            <Slider
              value={maxBpm}
              min={60}
              max={200}
              step={5}
              onChange={(_, v) => setMaxBpm(v as number)}
              sx={{ color: "primary.dark" }}
            />
            <Typography variant="caption" sx={{ color: "primary.light", fontFamily: "monospace" }}>
              {maxBpm >= 200 ? "No maximum" : `${maxBpm} BPM`}
            </Typography>
          </Box>

          <Box sx={{ borderTop: `1px solid ${alpha(red, 0.2)}`, pt: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Infinity Mode</Typography>
                <Typography variant="caption" sx={{ color: "text.disabled" }}>
                  Auto-loads new tracks so it never ends
                </Typography>
              </Box>
              <Switch
                checked={infinityMode}
                onChange={(_, v) => setInfinityMode(v)}
                color="primary"
              />
            </Stack>
          </Box>

          <Box sx={{ borderTop: `1px solid ${alpha(red, 0.2)}`, pt: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>Full Songs</Typography>
                <Typography variant="caption" sx={{ color: "text.disabled" }}>
                  Download full-length via YouTube (AnySong)
                </Typography>
              </Box>
              <Switch
                checked={fullSongs}
                onChange={(_, v) => setFullSongs(v)}
                color="primary"
              />
            </Stack>
          </Box>

          <Box sx={{ borderTop: `1px solid ${alpha(red, 0.2)}`, pt: 2 }}>
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              Drag each vinyl record to scratch it while playing. The crossfader blends between Deck A and Deck B.
            </Typography>
          </Box>

          <Box sx={{ borderTop: `1px solid ${alpha(red, 0.2)}`, pt: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5 }}>Open Source</Typography>
            <Stack spacing={1}>
              {[
                { href: "https://github.com/damoahdominic/clawdj", letter: "C", title: "ClawDJ", sub: "AI-powered DJ mixing & radio" },
                { href: "https://github.com/damoahdominic/anysong", letter: "A", title: "AnySong", sub: "Universal music search API" },
              ].map(link => (
                <MuiLink
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  underline="none"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: alpha("#000", 0.4),
                    border: `1px solid ${alpha(red, 0.15)}`,
                    transition: "all 0.15s",
                    "&:hover": { bgcolor: alpha(red, 0.12), borderColor: alpha(red, 0.4) },
                  }}
                >
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      color: "#fff",
                    }}
                  >
                    {link.letter}
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{link.title}</Typography>
                    <Typography variant="caption" sx={{ color: "text.disabled" }}>{link.sub}</Typography>
                  </Box>
                </MuiLink>
              ))}
            </Stack>
          </Box>
        </Stack>
      </Drawer>

      <Container maxWidth="md" sx={{ position: "relative", zIndex: 10, py: 4 }}>
        <Stack spacing={3}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <MuiLink
              href="/"
              underline="none"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                color: "text.secondary",
                fontSize: 14,
                "&:hover": { color: "primary.light" },
              }}
            >
              <ArrowBackIcon fontSize="small" /> Home
            </MuiLink>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                background: `linear-gradient(90deg, ${theme.palette.primary.dark}, ${red}, ${redLight})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              ClawDJ Radio
            </Typography>
            <IconButton
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
              sx={{ color: "text.secondary", "&:hover": { color: "primary.light" } }}
            >
              <SettingsIcon />
            </IconButton>
          </Stack>

          <Stack spacing={1}>
            <Stack direction="row" spacing={1}>
              <TextField
                fullWidth
                value={vibeQuery}
                onChange={(e) => setVibeQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadPlaylist()}
                placeholder="Artist, song, or vibe..."
                variant="outlined"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    bgcolor: alpha("#000", 0.55),
                    backdropFilter: "blur(6px)",
                    "& fieldset": { borderColor: alpha(red, 0.3) },
                    "&:hover fieldset": { borderColor: alpha(red, 0.5) },
                    "&.Mui-focused fieldset": { borderColor: red },
                  },
                }}
              />
              <Button
                onClick={loadPlaylist}
                disabled={loading || !vibeQuery.trim()}
                variant="contained"
                sx={{
                  px: 4,
                  background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
                  boxShadow: `0 6px 18px ${alpha(red, 0.45)}`,
                  "&:hover": {
                    background: `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})`,
                  },
                }}
              >
                {loading ? "..." : "Go"}
              </Button>
            </Stack>
            {detected && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 0.5 }}>
                <Box
                  sx={{
                    px: 1, py: 0.25, borderRadius: 1,
                    fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
                    textTransform: "uppercase",
                    color: "#fff",
                    bgcolor: alpha(red, 0.55),
                    border: `1px solid ${alpha(red, 0.8)}`,
                  }}
                >
                  {detected.type}
                </Box>
                {detected.label && (
                  <Typography variant="caption" sx={{ color: "text.secondary", fontSize: 11 }}>
                    {detected.label}
                  </Typography>
                )}
                {(detected.bpm_min != null || detected.bpm_max != null) && (
                  <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: "monospace", fontSize: 10 }}>
                    · {detected.bpm_min ?? 0}–{detected.bpm_max ?? 200} BPM
                  </Typography>
                )}
              </Stack>
            )}
          </Stack>

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
              onSwitchPointChange={props.setSwitchPoint}
              deckAProgress={props.deckAProgress}
              deckBProgress={props.deckBProgress}
              crossfadeMs={crossfadeMs}
            />
          )}

          <EffectsPanel
            effects={EFFECTS}
            playing={playingEffects}
            onTrigger={playEffect}
            autoEffects={autoEffects}
            onAutoChange={setAutoEffects}
          />

          {playlist.length > 0 && (
            <Stack spacing={1.5}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 0.5 }}>
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  Up next · {playlist.length} tracks
                  {infinityMode && (
                    <Box component="span" sx={{ color: "primary.light", ml: 0.5 }}>· ∞</Box>
                  )}
                  {loadingMore && (
                    <Box
                      component="span"
                      sx={{
                        color: "primary.light",
                        ml: 0.5,
                        fontSize: 11,
                        animation: "mui-pulse 1.2s ease-in-out infinite",
                        "@keyframes mui-pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.5 } },
                      }}
                    >
                      loading more...
                    </Box>
                  )}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.disabled" }}>
                  {(crossfadeMs / 1000).toFixed(1)}s crossfade
                </Typography>
              </Stack>
              <Box
                sx={{
                  bgcolor: alpha("#000", 0.55),
                  backdropFilter: "blur(6px)",
                  borderRadius: 3,
                  overflow: "hidden",
                  border: `1px solid ${alpha(red, 0.15)}`,
                }}
              >
                {playlist.map((track, i) => {
                  const isCurrent = i === currentIndex;
                  const isPast = i < currentIndex;
                  return (
                    <Box
                      key={`${track.id}-${i}`}
                      onClick={() => skipToTrack(i)}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        p: 1.75,
                        cursor: "pointer",
                        borderBottom: `1px solid ${alpha("#fff", 0.04)}`,
                        opacity: isPast ? 0.4 : 1,
                        background: isCurrent
                          ? `linear-gradient(90deg, ${alpha(red, 0.25)}, ${alpha(red, 0.05)})`
                          : "transparent",
                        borderLeft: isCurrent ? `2px solid ${redLight}` : "2px solid transparent",
                        transition: "all 0.15s",
                        "&:hover": { bgcolor: alpha("#fff", 0.04), opacity: isPast ? 0.7 : 1 },
                        "&:last-of-type": { borderBottom: "none" },
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          width: 24,
                          textAlign: "right",
                          color: isCurrent ? "primary.light" : "text.disabled",
                          fontWeight: isCurrent ? 700 : 400,
                        }}
                      >
                        {isCurrent && isPlaying ? "~" : i + 1}
                      </Typography>
                      {track.cover && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <Box
                          component="img"
                          src={track.cover}
                          alt=""
                          sx={{ width: 40, height: 40, borderRadius: 1, boxShadow: 1 }}
                        />
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color: isCurrent ? "text.primary" : "text.secondary",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {track.title}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.disabled",
                            display: "block",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {track.artist}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          textAlign: "right",
                          flexShrink: 0,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          minWidth: 48,
                          gap: 0.25,
                        }}
                      >
                        {/* FULL indicator — LED light in a recessed casing */}
                        <Box
                          sx={{
                            height: 18,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                              px: 0.75,
                              py: 0.25,
                              borderRadius: "4px",
                              bgcolor: "rgba(0,0,0,0.5)",
                              border: "1px solid rgba(60,60,60,0.6)",
                              boxShadow: "inset 0 1px 3px rgba(0,0,0,0.7), 0 0.5px 0 rgba(255,255,255,0.05)",
                              opacity: track.audioUrl ? 1 : 0,
                              transition: "opacity 0.3s ease",
                              pointerEvents: "none",
                            }}
                          >
                            {/* LED bulb */}
                            <Box
                              sx={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                bgcolor: track.audioUrl ? "#ef4444" : "#3a1111",
                                boxShadow: track.audioUrl
                                  ? "0 0 4px 1px rgba(239,68,68,0.8), 0 0 10px 2px rgba(239,68,68,0.4), inset 0 -1px 2px rgba(0,0,0,0.3)"
                                  : "inset 0 1px 2px rgba(0,0,0,0.5)",
                                border: "0.5px solid rgba(0,0,0,0.4)",
                                transition: "all 0.3s ease",
                              }}
                            />
                            <Typography
                              sx={{
                                fontSize: 7,
                                fontWeight: 800,
                                letterSpacing: 1.2,
                                lineHeight: 1,
                                color: track.audioUrl ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.25)",
                                transition: "color 0.3s ease",
                                userSelect: "none",
                              }}
                            >
                              FULL
                            </Typography>
                          </Box>
                        </Box>
                        {/* BPM — show if available */}
                        {track.bpm > 0 && (
                          <Typography
                            variant="caption"
                            sx={{ color: alpha(redLight, 0.8), fontFamily: "monospace", fontSize: 11, lineHeight: 1 }}
                          >
                            {track.bpm} BPM
                          </Typography>
                        )}
                        {/* Duration — always shown */}
                        <Typography variant="caption" sx={{ color: "text.disabled", lineHeight: 1 }}>
                          {Math.floor(track.duration / 60)}:
                          {(track.duration % 60).toString().padStart(2, "0")}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Stack>
          )}

          {!playlist.length && !loading && (
            <Box sx={{ textAlign: "center", py: 10 }}>
              <TuneIcon sx={{ fontSize: 64, color: "primary.dark", mb: 1 }} />
              <Typography variant="body1" sx={{ color: "text.secondary" }}>
                Type a vibe and hit Go
              </Typography>
              <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 1 }}>
                Two decks, a crossfader, and scratch-enabled turntables
              </Typography>
              <Typography variant="caption" sx={{ color: "text.disabled", display: "block" }}>
                Tap settings for BPM range, crossfade settings &amp; more
              </Typography>
            </Box>
          )}

          <Stack spacing={1} sx={{ textAlign: "center", pb: 5 }}>
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              Previews powered by Deezer · clawdj.com
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center">
              <MuiLink
                href="https://github.com/damoahdominic/clawdj"
                target="_blank"
                rel="noopener noreferrer"
                underline="none"
                sx={{ color: "text.disabled", fontSize: 11, "&:hover": { color: "primary.light" } }}
              >
                ClawDJ on GitHub
              </MuiLink>
              <Typography variant="caption" sx={{ color: "text.disabled" }}>·</Typography>
              <MuiLink
                href="https://github.com/damoahdominic/anysong"
                target="_blank"
                rel="noopener noreferrer"
                underline="none"
                sx={{ color: "text.disabled", fontSize: 11, "&:hover": { color: "primary.light" } }}
              >
                AnySong on GitHub
              </MuiLink>
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
