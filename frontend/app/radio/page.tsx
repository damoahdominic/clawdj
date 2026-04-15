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
import SearchIcon from "@mui/icons-material/Search";
import { GameboyFrame } from "../../components/GameboyFrame";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import CircularProgress from "@mui/material/CircularProgress";
import useMediaQuery from "@mui/material/useMediaQuery";
import { DeckLayout, type DeckTrack } from "../../components/DeckLayout";
import type { EffectDef } from "../../components/EffectsPanel";
import { workerSetInterval } from "../../lib/workerInterval";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";
const FADE_OUT_MS = 4000;

const EFFECTS: EffectDef[] = [
  // Original set
  { name: "glass_siren", label: "Glass Siren", url: "/effects/glass_siren.mp3" },
  { name: "laser_gun", label: "Laser Gun", url: "/effects/laser_gun.mp3" },
  { name: "stutter_siren", label: "Stutter Siren", url: "/effects/stutter_siren.mp3" },
  { name: "sharp_siren", label: "Sharp Siren", url: "/effects/sharp_siren.mp3" },
  { name: "gun_cocked", label: "Gun Cocked", url: "/effects/gun_cocked.mp3" },
  { name: "airhorn", label: "Airhorn", url: "/effects/airhorn.mp3" },
  { name: "prolonged_siren", label: "Prolonged Siren", url: "/effects/prolonged_siren.mp3" },
  { name: "laser_cut", label: "Laser Cut", url: "/effects/laser_cut.wav" },
  { name: "passing_truck", label: "Passing Truck", url: "/effects/passing_truck.mp3" },
  { name: "bomb", label: "Bomb", url: "/effects/bomb.mp3" },
  { name: "stutter_airhorn", label: "Stutter Airhorn", url: "/effects/stutter_airhorn.mp3" },
  { name: "damn_son", label: "Damn Son", url: "/effects/damn_son.mp3" },
  // New additions
  { name: "vocal_hit_stab", label: "Vocal Hit Stab", url: "/effects/vocal_hit_stab.mp3" },
  { name: "siren_type_i", label: "Siren Type I", url: "/effects/siren_type_i.mp3" },
  { name: "scratch_180", label: "Scratch 180", url: "/effects/scratch_180.mp3" },
  { name: "vocal_yelp_ieo", label: "Yelp Ieo", url: "/effects/vocal_yelp_ieo.mp3" },
  { name: "count_30", label: "Count 30", url: "/effects/count_30.mp3" },
  { name: "vocal_4nee_v", label: "4nee Variant", url: "/effects/vocal_4nee_v.mp3" },
  { name: "vocal_4nee", label: "4nee", url: "/effects/vocal_4nee.mp3" },
  { name: "anhaa_blast", label: "Anhaa Blast", url: "/effects/anhaa_blast.mp3" },
  { name: "bomb_short", label: "Bomb Short", url: "/effects/bomb_short.mp3" },
  { name: "dirty_sample_12", label: "Dirty 12", url: "/effects/dirty_sample_12.mp3" },
  { name: "dirty_sample_1", label: "Dirty 1", url: "/effects/dirty_sample_1.mp3" },
  { name: "dj_rewind", label: "DJ Rewind", url: "/effects/dj_rewind.mp3" },
  { name: "dj_x111", label: "DJ x111 Stab", url: "/effects/dj_x111.mp3" },
  { name: "dore_imbogo", label: "Dore Imbogo", url: "/effects/dore_imbogo.mp3" },
  { name: "effect_1", label: "Effect 1", url: "/effects/effect_1.mp3" },
  { name: "effect_1_short", label: "Effect 1 Short", url: "/effects/effect_1_short.mp3" },
  { name: "effect_2", label: "Effect 2", url: "/effects/effect_2.mp3" },
  { name: "effect_3", label: "Effect 3", url: "/effects/effect_3.mp3" },
  { name: "effect_4", label: "Effect 4", url: "/effects/effect_4.mp3" },
  { name: "effect_4b", label: "Effects 4", url: "/effects/effect_4b.mp3" },
  { name: "effect_5", label: "Effect 5", url: "/effects/effect_5.mp3" },
  { name: "effect_6", label: "Effect 6", url: "/effects/effect_6.mp3" },
  { name: "effect_7", label: "Effect 7", url: "/effects/effect_7.mp3" },
  { name: "effect_8", label: "Effect 8", url: "/effects/effect_8.mp3" },
  { name: "effect_9", label: "Effect 9", url: "/effects/effect_9.mp3" },
  { name: "effect_blast", label: "Effect Blast", url: "/effects/effect_blast.mp3" },
  { name: "everybody", label: "Everybody", url: "/effects/everybody.mp3" },
  { name: "fire_yeee", label: "Fire Yeee", url: "/effects/fire_yeee.mp3" },
  { name: "glass_breaking", label: "Glass Breaking", url: "/effects/glass_breaking.mp3" },
  { name: "glaudes_laser_1", label: "Glaudes Drop 1", url: "/effects/glaudes_laser_1.mp3" },
  { name: "glaudes_laser_2", label: "Glaudes Drop 2", url: "/effects/glaudes_laser_2.mp3" },
  { name: "glaudes_laser_5", label: "Glaudes Drop 5", url: "/effects/glaudes_laser_5.mp3" },
  { name: "crazy_laugh", label: "Crazy Laugh", url: "/effects/crazy_laugh.mp3" },
  { name: "long_horn", label: "Long Horn", url: "/effects/long_horn.mp3" },
  { name: "iiyeee", label: "Iiyeee", url: "/effects/iiyeee.mp3" },
  { name: "mbana", label: "Mbana", url: "/effects/mbana.mp3" },
  { name: "oh_my_god", label: "Oh My God", url: "/effects/oh_my_god.mp3" },
  { name: "ok", label: "Ok", url: "/effects/ok.mp3" },
  { name: "pluuuu", label: "Pluuuu", url: "/effects/pluuuu.mp3" },
  { name: "scratching", label: "Scratching", url: "/effects/scratching.mp3" },
  { name: "siren_long", label: "Siren Long", url: "/effects/siren_long.mp3" },
  { name: "super_laser", label: "Super Laser", url: "/effects/super_laser.mp3" },
  { name: "waadaaa", label: "Waadaaa Pull Up", url: "/effects/waadaaa.mp3" },
  { name: "b035_beep", label: "B035 Beep", url: "/effects/b035_beep.mp3" },
  { name: "glasses", label: "Glasses", url: "/effects/glasses.mp3" },
  { name: "tweet", label: "Tweet", url: "/effects/tweet.mp3" },
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

// ============ 3D LOBSTER SCENE (fullscreen OR contained) ============
function LobsterBackground({
  isPlaying,
  bpm,
  contained = false,
}: {
  isPlaying: boolean;
  bpm: number;
  /** When true, the scene sizes to its container (for embedding in an LCD
   *  display) instead of taking over the full window. */
  contained?: boolean;
}) {
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

      const getSize = () => {
        if (contained) {
          const r = container.getBoundingClientRect();
          return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
        }
        return { w: window.innerWidth, h: window.innerHeight };
      };
      const sz0 = getSize();
      const w = sz0.w;
      const h = sz0.h;

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
        const { w: nw, h: nh } = getSize();
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      let ro: ResizeObserver | null = null;
      if (contained) {
        ro = new ResizeObserver(onResize);
        ro.observe(container);
      } else {
        window.addEventListener("resize", onResize);
      }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return contained ? (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, touchAction: "none", overflow: "hidden" }}
    />
  ) : (
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
  const [miniPlaylist, setMiniPlaylist] = useState(true);
  const isDesktop = useMediaQuery("(min-width:768px)");
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

  const loadPlaylist = useCallback(async (overrideQuery?: string) => {
    const q = overrideQuery ?? vibeQuery;
    if (!q.trim()) return;
    if (overrideQuery) setVibeQuery(overrideQuery);
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
      const res = await fetch(`${API_URL}/api/vibe-playlist?q=${encodeURIComponent(q)}&count=15${bpmParam}`);
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
              next[idx] = { ...next[idx], audioUrl: `${API_URL}${url}` };
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

      // Per-deck waveform progress (0–1) — independent of active deck.
      // Raw currentTime; the WaveformLane extrapolates between samples using
      // wallclock time in its RAF loop for buttery scrolling.
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

  // Media keys (Next/Prev/Play-Pause) via the Media Session API + a keydown
  // fallback for browsers that route them as keyboard events. Refs keep
  // handlers fresh without re-registering on every render.
  const skipNextRef = useRef(skipNext);
  const skipPrevRef = useRef(skipPrev);
  const togglePlayRef = useRef(togglePlay);
  useEffect(() => { skipNextRef.current = skipNext; });
  useEffect(() => { skipPrevRef.current = skipPrev; });
  useEffect(() => { togglePlayRef.current = togglePlay; });

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.setActionHandler("nexttrack", () => skipNextRef.current());
      ms.setActionHandler("previoustrack", () => skipPrevRef.current());
      ms.setActionHandler("play", () => togglePlayRef.current());
      ms.setActionHandler("pause", () => togglePlayRef.current());
    } catch { /* older browsers */ }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "MediaTrackNext") { e.preventDefault(); skipNextRef.current(); }
      else if (e.key === "MediaTrackPrevious") { e.preventDefault(); skipPrevRef.current(); }
      else if (e.key === "MediaPlayPause") { e.preventDefault(); togglePlayRef.current(); }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      try {
        ms.setActionHandler("nexttrack", null);
        ms.setActionHandler("previoustrack", null);
        ms.setActionHandler("play", null);
        ms.setActionHandler("pause", null);
      } catch { /* noop */ }
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Keep MediaSession playback state + metadata in sync so the OS-level media
  // keys actually get routed to this tab.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const track = currentIndex >= 0 ? playlist[currentIndex] : null;
    if (!track) { navigator.mediaSession.metadata = null; return; }
    const artwork = track.cover ? [{ src: track.cover, sizes: "512x512", type: "image/jpeg" }] : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || "Unknown",
      artist: track.artist || "",
      album: "",
      artwork,
    });
  }, [currentIndex, playlist]);

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
    miniPlaylist={miniPlaylist} setMiniPlaylist={setMiniPlaylist} isDesktop={isDesktop}
  />;
}

// ============ MUI VIEW ============
interface RadioViewProps {
  vibeQuery: string; setVibeQuery: (v: string) => void;
  detected: { type: string; label?: string | null; bpm_min?: number | null; bpm_max?: number | null } | null;
  loading: boolean; loadPlaylist: (overrideQuery?: string) => void;
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
  miniPlaylist: boolean; setMiniPlaylist: (v: boolean) => void;
  isDesktop: boolean;
}

function RadioView(props: RadioViewProps) {
  const theme = useTheme();
  const red = theme.palette.primary.main;
  const redLight = theme.palette.primary.light;

  // Typewriter placeholder — cycles through example prompts so the search
  // box always hints at what kinds of queries work.
  const [typedPlaceholder, setTypedPlaceholder] = useState("");
  useEffect(() => {
    const examples = [
      "Daft Punk — Harder Better Faster",
      "Kendrick Lamar",
      "90s boom bap",
      "lo-fi chillhop study",
      "afrobeats summer 2025",
      "Tame Impala",
      "disco house",
      "Fela Kuti",
    ];
    let i = 0, ch = 0, deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const full = examples[i];
      if (!deleting) {
        ch++;
        setTypedPlaceholder(full.slice(0, ch));
        if (ch >= full.length) { deleting = true; timer = setTimeout(step, 1600); return; }
        timer = setTimeout(step, 55 + Math.random() * 40);
      } else {
        ch--;
        setTypedPlaceholder(full.slice(0, ch));
        if (ch <= 0) { deleting = false; i = (i + 1) % examples.length; timer = setTimeout(step, 320); return; }
        timer = setTimeout(step, 28);
      }
    };
    timer = setTimeout(step, 400);
    return () => clearTimeout(timer);
  }, []);
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
    miniPlaylist, setMiniPlaylist, isDesktop,
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
      {/* Background removed — keep it clean */}

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

      {/* ── Landing / hero state (no results yet) ── */}
      {!playlist.length && !loading && (
        <Container
          maxWidth="sm"
          sx={{
            position: "relative", zIndex: 10,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: "100vh",
            px: { xs: 2, sm: 3 },
            transition: "all 0.5s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          <IconButton
            onClick={() => setShowSettings(true)}
            title="Settings"
            size="small"
            sx={{
              position: "fixed",
              top: { xs: 12, sm: 20 },
              right: { xs: 12, sm: 20 },
              zIndex: 30,
              color: "text.secondary",
              bgcolor: alpha("#000", 0.4),
              border: `1px solid ${alpha(red, 0.2)}`,
              backdropFilter: "blur(6px)",
              "&:hover": { color: "primary.light", borderColor: alpha(red, 0.5) },
            }}
          >
            <SettingsIcon sx={{ fontSize: { xs: 20, sm: 22 } }} />
          </IconButton>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: { xs: 36, sm: 52 },
              background: `linear-gradient(90deg, ${theme.palette.primary.dark}, ${red}, ${redLight})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              mb: 1,
            }}
          >
            ClawDJ Radio
          </Typography>
          <Typography sx={{ color: "text.secondary", mb: 4, fontSize: { xs: 13, sm: 15 }, textAlign: "center" }}>
            Two decks, a crossfader, and scratch-enabled turntables
          </Typography>
          <Box sx={{ width: "100%", maxWidth: 500, position: "relative" }}>
            <TextField
              fullWidth
              value={vibeQuery}
              onChange={(e) => setVibeQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadPlaylist()}
              placeholder={`Try: ${typedPlaceholder}\u258F`}
              variant="outlined"
              InputProps={{
                endAdornment: (
                  <IconButton
                    onClick={() => loadPlaylist()}
                    disabled={loading || !vibeQuery.trim()}
                    size="small"
                    sx={{
                      width: 40, height: 40,
                      borderRadius: 2,
                      background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
                      color: "#fff",
                      mr: -0.5,
                      "&:hover": { background: `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})` },
                      "&.Mui-disabled": { opacity: 0.3, color: "#fff" },
                    }}
                  >
                    {loading ? <CircularProgress size={18} thickness={5} sx={{ color: "#fff" }} /> : <SearchIcon sx={{ fontSize: 20 }} />}
                  </IconButton>
                ),
              }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  bgcolor: alpha("#000", 0.55),
                  backdropFilter: "blur(6px)",
                  borderRadius: 3,
                  pl: 1,
                  pr: 1.5,
                  "& fieldset": { borderColor: alpha(red, 0.3) },
                  "&:hover fieldset": { borderColor: alpha(red, 0.5) },
                  "&.Mui-focused fieldset": { borderColor: red },
                },
                "& .MuiOutlinedInput-input": {
                  py: 2.2,
                  px: 1.5,
                  fontSize: 16,
                  "&::placeholder": {
                    color: alpha("#fff", 0.45),
                    opacity: 1,
                    fontStyle: "italic",
                  },
                },
              }}
            />
          </Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "center", mt: 3, opacity: 0.6 }}>
            {["chill house", "90s hip hop", "Kendrick Lamar", "jazz vibes", "Afrobeats", "lo-fi", "trap bangers", "R&B slow jams", "reggaeton", "classic rock"].map((s) => (
              <Chip
                key={s}
                label={s}
                size="small"
                onClick={() => loadPlaylist(s)}
                sx={{
                  fontSize: 11, fontWeight: 600,
                  bgcolor: alpha(red, 0.1),
                  border: `1px solid ${alpha(red, 0.2)}`,
                  color: "text.secondary",
                  cursor: "pointer",
                  "&:hover": { bgcolor: alpha(red, 0.25), color: "#fff", borderColor: alpha(red, 0.5) },
                }}
              />
            ))}
          </Box>
        </Container>
      )}

      {/* ── Active DJ state (has results or loading) ── */}
      {(playlist.length > 0 || loading) && (
      <Container
        maxWidth="md"
        sx={{
          position: "relative", zIndex: 10, py: { xs: 2, sm: 4 }, px: { xs: 1.5, sm: 3 },
          animation: "fadeSlideIn 0.5s cubic-bezier(0.4,0,0.2,1)",
          "@keyframes fadeSlideIn": { "0%": { opacity: 0, transform: "translateY(20px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
        }}
      >
        <Stack spacing={{ xs: 1.25, sm: 1.75 }}>
          {/* Compact single-row header: wordmark left, search + cog right. */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <MuiLink
                href="/"
                underline="none"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  color: "text.secondary",
                  "&:hover": { color: "primary.light" },
                }}
              >
                <ArrowBackIcon sx={{ fontSize: { xs: 16, sm: 18 } }} />
              </MuiLink>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: 14, sm: 16 },
                  letterSpacing: 1,
                  background: `linear-gradient(90deg, ${theme.palette.primary.dark}, ${red}, ${redLight})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                ClawDJ
              </Typography>
            </Stack>

            <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, justifyContent: "flex-end" }}>
              <IconButton
                onClick={() => setShowSettings(!showSettings)}
                title="Settings"
                size="small"
                sx={{ color: "text.secondary", "&:hover": { color: "primary.light" } }}
              >
                <SettingsIcon sx={{ fontSize: { xs: 18, sm: 20 } }} />
              </IconButton>
            </Stack>
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

          {(deckATrack || deckBTrack || playlist.length > 0) && (
            <Box sx={{ position: "relative", overflow: "visible" }}>
              <GameboyFrame
                isPlaying={isPlaying}
                bpm={currentBpm}
                lcdContent={<LobsterBackground contained isPlaying={isPlaying} bpm={currentBpm} />}
              >
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
                effects={EFFECTS}
                playingEffects={playingEffects}
                onTriggerEffect={playEffect}
              />
              </GameboyFrame>

              {/* Retractable playlist wing — docks to the right edge of the deck
                   layout and slides outward so it doesn't overlap turntable B.
                   Collapses to a thin tab when the user wants it out of the way. */}
              {isDesktop && playlist.length > 0 && (
                <Box
                  sx={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    // When expanded the wing sits fully outside the deck's right
                    // edge (left: 100% + a small gap). When retracted we slide
                    // the bulk of it off-deck to the right, leaving only a
                    // 22px tab peeking out.
                    left: "100%",
                    ml: 1,
                    width: 236,
                    zIndex: 20,
                    transform: miniPlaylist ? "translateX(0)" : "translateX(214px)",
                    transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
                    pointerEvents: "auto",
                  }}
                >
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      flexDirection: "column",
                      borderRadius: "12px",
                      overflow: "hidden",
                      background: `linear-gradient(180deg, ${alpha("#0a0a0a", 0.92)} 0%, ${alpha("#050505", 0.95)} 100%)`,
                      backdropFilter: "blur(16px)",
                      WebkitBackdropFilter: "blur(16px)",
                      border: `1px solid ${alpha(red, 0.22)}`,
                      boxShadow: `
                        0 12px 32px ${alpha("#000", 0.7)},
                        0 0 0 1px ${alpha("#000", 0.4)},
                        inset 0 1px 0 ${alpha("#fff", 0.04)}
                      `,
                    }}
                  >
                    {/* Retract/expand tab — sits on the left edge, sticks out
                         slightly so it's always visible even when retracted. */}
                    <Box
                      onClick={() => setMiniPlaylist(!miniPlaylist)}
                      sx={{
                        position: "absolute",
                        left: 0,
                        top: "50%",
                        transform: "translate(-1px, -50%)",
                        width: 22,
                        height: 68,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        borderRadius: "6px 0 0 6px",
                        background: `linear-gradient(90deg, ${alpha(red, 0.35)}, ${alpha(red, 0.15)})`,
                        border: `1px solid ${alpha(red, 0.35)}`,
                        borderRight: "none",
                        boxShadow: `inset 1px 0 0 ${alpha("#fff", 0.08)}`,
                        transition: "background 0.2s",
                        zIndex: 2,
                        "&:hover": { background: `linear-gradient(90deg, ${alpha(red, 0.5)}, ${alpha(red, 0.22)})` },
                      }}
                      title={miniPlaylist ? "Retract playlist" : "Expand playlist"}
                    >
                      <Box
                        sx={{
                          color: "#fff",
                          fontSize: 10,
                          lineHeight: 1,
                          transform: miniPlaylist ? "none" : "rotate(180deg)",
                          transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
                        }}
                      >
                        ▶
                      </Box>
                    </Box>

                    {/* Header */}
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{
                        pl: 3.5,
                        pr: 1,
                        py: 0.75,
                        flexShrink: 0,
                        borderBottom: `1px solid ${alpha("#fff", 0.05)}`,
                        background: `linear-gradient(90deg, ${alpha(red, 0.12)}, transparent 60%)`,
                      }}
                    >
                      <Stack direction="row" alignItems="baseline" spacing={0.75}>
                        <Typography sx={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: redLight, textTransform: "uppercase" }}>
                          Queue
                        </Typography>
                        <Typography sx={{ fontSize: 9, color: "text.disabled", fontFamily: "monospace" }}>
                          {currentIndex >= 0 ? currentIndex + 1 : 0}/{playlist.length}
                        </Typography>
                      </Stack>
                      {infinityMode && (
                        <Typography sx={{ fontSize: 11, color: redLight, lineHeight: 1 }}>∞</Typography>
                      )}
                    </Stack>

                    {/* Search — now lives inside the wing */}
                    <Box sx={{ px: 1, py: 0.75, borderBottom: `1px solid ${alpha("#fff", 0.05)}`, flexShrink: 0 }}>
                      <TextField
                        fullWidth
                        size="small"
                        value={vibeQuery}
                        onChange={(e) => setVibeQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && loadPlaylist()}
                        placeholder={`Try: ${typedPlaceholder}\u258F`}
                        variant="outlined"
                        InputProps={{
                          endAdornment: (
                            <IconButton
                              onClick={() => loadPlaylist()}
                              disabled={loading || !vibeQuery.trim()}
                              size="small"
                              sx={{
                                width: 22, height: 22,
                                borderRadius: 999,
                                background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
                                color: "#fff",
                                "&:hover": { background: `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.primary.main})` },
                                "&.Mui-disabled": { opacity: 0.3, color: "#fff" },
                              }}
                            >
                              {loading ? <CircularProgress size={12} thickness={5} sx={{ color: "#fff" }} /> : <SearchIcon sx={{ fontSize: 12 }} />}
                            </IconButton>
                          ),
                        }}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            bgcolor: alpha("#000", 0.55),
                            borderRadius: 999,
                            pl: 0.75, pr: 0.5,
                            "& fieldset": { borderColor: alpha(red, 0.3) },
                            "&:hover fieldset": { borderColor: alpha(red, 0.5) },
                            "&.Mui-focused fieldset": { borderColor: red },
                          },
                          "& .MuiOutlinedInput-input": {
                            py: 0.5, px: 0.75,
                            fontSize: 10,
                            "&::placeholder": {
                              color: alpha("#fff", 0.45),
                              opacity: 1,
                              fontStyle: "italic",
                            },
                          },
                        }}
                      />
                    </Box>

                    {/* Scrollable track list */}
                    <Box
                      sx={{
                        flex: 1,
                        overflowY: "auto",
                        overflowX: "hidden",
                        "&::-webkit-scrollbar": { width: 4 },
                        "&::-webkit-scrollbar-track": { background: "transparent" },
                        "&::-webkit-scrollbar-thumb": {
                          bgcolor: alpha(red, 0.35),
                          borderRadius: 2,
                          "&:hover": { bgcolor: alpha(red, 0.55) },
                        },
                      }}
                    >
                      {playlist.map((track, i) => {
                        const isCurrent = i === currentIndex;
                        const isPast = i < currentIndex;
                        const isFull = !!track.audioUrl;
                        const mins = Math.floor((track.duration || 0) / 60);
                        const secs = Math.floor((track.duration || 0) % 60);
                        const durStr = track.duration ? `${mins}:${secs.toString().padStart(2, "0")}` : "";
                        return (
                          <Box
                            key={`wing-${track.id}-${i}`}
                            onClick={() => skipToTrack(i)}
                            sx={{
                              position: "relative",
                              display: "flex",
                              alignItems: "center",
                              gap: 0.75,
                              pl: 1.25,
                              pr: 1,
                              py: 0.75,
                              cursor: "pointer",
                              borderBottom: `1px solid ${alpha("#fff", 0.03)}`,
                              opacity: isPast ? 0.4 : 1,
                              background: isCurrent
                                ? `linear-gradient(90deg, ${alpha(red, 0.3)}, ${alpha(red, 0.04)} 75%, transparent)`
                                : "transparent",
                              "&:hover": {
                                bgcolor: isCurrent ? undefined : alpha("#fff", 0.04),
                              },
                              "&::before": isCurrent ? {
                                content: '""',
                                position: "absolute",
                                left: 0,
                                top: 4,
                                bottom: 4,
                                width: 2,
                                borderRadius: 1,
                                bgcolor: redLight,
                                boxShadow: `0 0 6px ${redLight}`,
                              } : undefined,
                              transition: "background 0.15s",
                            }}
                          >
                            {/* Track number or playing indicator */}
                            <Box sx={{ width: 14, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                              {isCurrent && isPlaying ? (
                                <Box sx={{
                                  display: "flex",
                                  alignItems: "flex-end",
                                  gap: "1.5px",
                                  height: 10,
                                }}>
                                  {[0, 1, 2].map((b) => (
                                    <Box key={b} sx={{
                                      width: 2,
                                      bgcolor: redLight,
                                      borderRadius: 0.5,
                                      animation: `wing-bars-${b} 0.9s ease-in-out ${b * 0.12}s infinite`,
                                      [`@keyframes wing-bars-${b}`]: {
                                        "0%,100%": { height: "30%" },
                                        "50%": { height: "100%" },
                                      },
                                    }} />
                                  ))}
                                </Box>
                              ) : (
                                <Typography sx={{
                                  fontSize: 9,
                                  color: "text.disabled",
                                  fontFamily: "monospace",
                                  lineHeight: 1,
                                }}>
                                  {i + 1}
                                </Typography>
                              )}
                            </Box>

                            {/* Title + artist */}
                            <Stack sx={{ flex: 1, minWidth: 0, gap: 0.1 }}>
                              <Typography sx={{
                                fontSize: 11,
                                fontWeight: isCurrent ? 700 : 500,
                                color: isCurrent ? "#fff" : alpha("#fff", 0.78),
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                lineHeight: 1.15,
                              }}>
                                {track.title}
                              </Typography>
                              <Typography sx={{
                                fontSize: 9,
                                color: alpha("#fff", 0.42),
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                lineHeight: 1.1,
                              }}>
                                {track.artist}
                              </Typography>
                              {/* Details row */}
                              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25 }}>
                                {track.bpm > 0 && (
                                  <Box sx={{
                                    px: 0.4,
                                    borderRadius: 0.5,
                                    border: `1px solid ${alpha(redLight, 0.4)}`,
                                    bgcolor: alpha(red, 0.12),
                                  }}>
                                    <Typography sx={{
                                      fontSize: 8,
                                      fontFamily: "monospace",
                                      color: redLight,
                                      lineHeight: 1.3,
                                      letterSpacing: 0.5,
                                    }}>
                                      {Math.round(track.bpm)} BPM
                                    </Typography>
                                  </Box>
                                )}
                                {durStr && (
                                  <Typography sx={{
                                    fontSize: 8,
                                    fontFamily: "monospace",
                                    color: alpha("#fff", 0.35),
                                    lineHeight: 1.3,
                                  }}>
                                    {durStr}
                                  </Typography>
                                )}
                              </Stack>
                            </Stack>

                            {/* FULL indicator */}
                            <Box
                              sx={{
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "center",
                                gap: 0.3,
                                px: 0.5,
                                py: 0.2,
                                borderRadius: 0.75,
                                bgcolor: isFull ? alpha(red, 0.18) : "transparent",
                                border: `1px solid ${isFull ? alpha(redLight, 0.45) : alpha("#fff", 0.06)}`,
                                opacity: isFull ? 1 : 0.4,
                                transition: "all 0.2s",
                              }}
                              title={isFull ? "Full track ready" : "Preview only"}
                            >
                              <Box sx={{
                                width: 5,
                                height: 5,
                                borderRadius: "50%",
                                bgcolor: isFull ? redLight : alpha("#fff", 0.15),
                                boxShadow: isFull ? `0 0 4px ${redLight}` : undefined,
                              }} />
                              <Typography sx={{
                                fontSize: 7,
                                fontWeight: 800,
                                letterSpacing: 0.8,
                                color: isFull ? "#fff" : alpha("#fff", 0.3),
                                lineHeight: 1,
                              }}>
                                FULL
                              </Typography>
                            </Box>
                          </Box>
                        );
                      })}
                      {loadingMore && (
                        <Box sx={{
                          p: 1,
                          textAlign: "center",
                          fontSize: 9,
                          color: alpha(redLight, 0.7),
                          animation: "wing-pulse 1.2s ease-in-out infinite",
                          "@keyframes wing-pulse": { "0%,100%": { opacity: 1 }, "50%": { opacity: 0.4 } },
                        }}>
                          loading more…
                        </Box>
                      )}
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {playlist.length > 0 && !isDesktop && (
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
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography variant="caption" sx={{ color: "text.disabled" }}>
                    {(crossfadeMs / 1000).toFixed(1)}s crossfade
                  </Typography>
                  {isDesktop && (
                    <IconButton
                      size="small"
                      onClick={() => setMiniPlaylist(true)}
                      title="Minimize playlist"
                      sx={{ color: "text.disabled", p: 0.25, "&:hover": { color: redLight } }}
                    >
                      <UnfoldLessIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  )}
                </Stack>
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
                        gap: { xs: 1, sm: 1.5 },
                        p: { xs: 1, sm: 1.75 },
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
                          width: { xs: 18, sm: 24 },
                          textAlign: "right",
                          color: isCurrent ? "primary.light" : "text.disabled",
                          fontWeight: isCurrent ? 700 : 400,
                          fontSize: { xs: 11, sm: 14 },
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
                          sx={{ width: { xs: 32, sm: 40 }, height: { xs: 32, sm: 40 }, borderRadius: 1, boxShadow: 1 }}
                        />
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            fontSize: { xs: 12, sm: 14 },
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
                            fontSize: { xs: 10, sm: 12 },
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
                          minWidth: { xs: 36, sm: 48 },
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

          <Stack spacing={1} sx={{ textAlign: "center", pb: 5 }}>
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              Previews powered by Deezer · clawdj.com
            </Typography>
          </Stack>
        </Stack>
      </Container>
      )}
    </Box>
  );
}
