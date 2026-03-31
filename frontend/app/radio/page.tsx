"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import * as THREE from "three";

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

  // Keep refs in sync with props
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

      // Lighting
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

      // Floor
      const floorGeo = new THREE.PlaneGeometry(80, 80);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x111118, roughness: 0.2, metalness: 0.9,
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.5;
      scene.add(floor);

      // Glow ring
      const ringGeo = new THREE.RingGeometry(4, 6, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff3300, transparent: true, opacity: 0.15, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.48;
      scene.add(ring);

      // Load GLB models
      const loader = new GLTFLoader();
      const lobsters: THREE.Group[] = [];

      const fitModel = (model: THREE.Group, targetHeight: number) => {
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          model.scale.setScalar(targetHeight / maxDim);
        }
        // Ground it
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
            // Claws
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

      // Resize handler
      const onResize = () => {
        const nw = window.innerWidth;
        const nh = window.innerHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      window.addEventListener("resize", onResize);

      // Club laser beams
      const laserColors = [0xff0022, 0xff4400, 0xff6600, 0xaa00ff, 0x00aaff, 0xff0066];
      const lasers: THREE.Mesh[] = [];
      for (let i = 0; i < 12; i++) {
        const geo = new THREE.CylinderGeometry(0.03, 0.03, 40, 4);
        const mat = new THREE.MeshBasicMaterial({
          color: laserColors[i % laserColors.length],
          transparent: true,
          opacity: 0,
        });
        const beam = new THREE.Mesh(geo, mat);
        // Originate from ceiling at random X/Z positions
        beam.position.set(
          (Math.random() - 0.5) * 20,
          15,
          (Math.random() - 0.5) * 20
        );
        // Tilt at random angles
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

      // Animation loop — started right after init, reads from refs
      const animate = () => {
        if (cancelled) return;
        frameRef.current = requestAnimationFrame(animate);

        const playing = isPlayingRef.current;
        const curBpm = bpmRef.current;
        const bpmRate = curBpm > 0 ? curBpm / 120 : 1;

        timeRef.current += 0.016 * (playing ? 1 : 0.2);
        const t = timeRef.current;
        const intensity = playing ? 1.0 : 0.15;

        // Orbiting camera
        const orbitSpeed = 0.08 * (playing ? 1 : 0.3);
        const orbitRadius = 16 + Math.sin(t * 0.1) * 3;
        const camY = 5 + Math.sin(t * 0.15) * 2;
        camera.position.x = Math.cos(t * orbitSpeed) * orbitRadius;
        camera.position.z = Math.sin(t * orbitSpeed) * orbitRadius;
        camera.position.y = camY;
        camera.lookAt(0, 1, 0);

        // Dance each lobster
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

        // Pulsing lights
        const pulse = Math.abs(Math.sin(t * bpmRate * Math.PI * 2));
        redLight.intensity = 2 + pulse * 2 * intensity;
        redLight.position.x = -8 + Math.sin(t * 0.3) * 2;
        orangeLight.intensity = 2 + pulse * 2 * intensity;
        orangeLight.position.x = 8 + Math.cos(t * 0.3) * 2;
        purpleLight.intensity = 1.5 + pulse * 1.5 * intensity;
        purpleLight.position.z = -8 + Math.sin(t * 0.2) * 3;

        // Floor ring pulse
        ringMat.opacity = 0.08 + pulse * 0.15 * intensity;
        const s = 1.0 + pulse * 0.15 * intensity;
        ring.scale.set(s, s, 1);

        // Club laser beams — flash randomly when playing
        for (const laser of lasers) {
          const mat = laser.material as THREE.MeshBasicMaterial;
          if (playing) {
            // Sweep the beam slowly
            laser.rotation.x = laser.userData.baseRotX + Math.sin(t * laser.userData.speed + laser.userData.phase) * 0.4;
            laser.rotation.z = laser.userData.baseRotZ + Math.cos(t * laser.userData.speed * 0.7 + laser.userData.phase) * 0.4;

            // Random flash timing
            laser.userData.nextFlash -= 0.016;
            if (laser.userData.nextFlash <= 0) {
              laser.userData.flashDur = 0.1 + Math.random() * 0.4;
              laser.userData.nextFlash = 0.3 + Math.random() * 2.5;
              // Randomize color on flash
              mat.color.setHex(laserColors[Math.floor(Math.random() * laserColors.length)]);
            }

            if (laser.userData.flashDur > 0) {
              laser.userData.flashDur -= 0.016;
              mat.opacity = 0.4 + pulse * 0.4;
            } else {
              mat.opacity *= 0.9; // fade out
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

  const [vinylAngle, setVinylAngle] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [scratchActive, setScratchActive] = useState(false);
  const vinylRef = useRef<HTMLDivElement>(null);
  const dragStartAngle = useRef(0);
  const lastAngle = useRef(0);

  const audioARef = useRef<HTMLAudioElement>(null);
  const audioBRef = useRef<HTMLAudioElement>(null);
  const activePlayerRef = useRef<"a" | "b">("a");
  const crossfadeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const vinylSpinRef = useRef<number>(0);
  const fadeOutTimerRef = useRef<NodeJS.Timeout | null>(null);

  const getActiveAudio = () => activePlayerRef.current === "a" ? audioARef.current : audioBRef.current;
  const getNextAudio = () => activePlayerRef.current === "a" ? audioBRef.current : audioARef.current;

  const getRandomSwitchPoint = useCallback(() => {
    const base = switchThreshold / 100;
    return Math.max(0.3, Math.min(0.95, base + (Math.random() * 0.1 - 0.05)));
  }, [switchThreshold]);

  const doFadeOut = useCallback(() => {
    const audio = getActiveAudio();
    if (!audio) return;
    const steps = 40;
    const interval = FADE_OUT_MS / steps;
    let step = 0;
    const startVol = audio.volume;
    fadeOutTimerRef.current = setInterval(() => {
      step++;
      const ratio = step / steps;
      audio.volume = Math.max(0, startVol * (1 - ratio));
      if (step >= steps) {
        if (fadeOutTimerRef.current) clearInterval(fadeOutTimerRef.current);
        audio.pause();
        audio.volume = 1;
        setIsPlaying(false);
      }
    }, interval);
  }, []);

  const startPlayback = useCallback((index: number, tracks?: PlaylistTrack[]) => {
    const audio = getActiveAudio();
    const list = tracks || playlist;
    if (!audio || index >= list.length) return;
    if (fadeOutTimerRef.current) clearInterval(fadeOutTimerRef.current);
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
    if (crossfadeTimerRef.current) clearInterval(crossfadeTimerRef.current);
    if (fadeOutTimerRef.current) clearInterval(fadeOutTimerRef.current);
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

  const loadMoreTracks = useCallback(async () => {
    if (loadingMore || !vibeQuery.trim()) return;
    setLoadingMore(true);
    try {
      const existingIds = playlist.map(t => t.id).join(",");
      const bpmParam = (minBpm > 0 || maxBpm < 200) ? `&min_bpm=${minBpm}&max_bpm=${maxBpm}` : "";
      const res = await fetch(`${API_URL}/api/vibe-playlist?q=${encodeURIComponent(vibeQuery)}&count=15&exclude=${existingIds}${bpmParam}`);
      const data = await res.json();
      if (data.tracks?.length > 0) {
        setPlaylist(prev => [...prev, ...data.tracks]);
      }
    } catch {}
    setLoadingMore(false);
  }, [loadingMore, vibeQuery, playlist, minBpm, maxBpm]);

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

  useEffect(() => {
    const checkProgress = () => {
      const audio = getActiveAudio();
      if (!audio || !audio.duration) return;
      const pct = audio.currentTime / audio.duration;
      setProgress(pct * 100);
      const isLastTrack = currentIndex >= playlist.length - 1;
      if (infinityMode && !loadingMore && playlist.length > 0) {
        const playlistProgress = (currentIndex + 1) / playlist.length;
        if (playlistProgress >= 0.7) loadMoreTracks();
      }
      if (pct >= switchPoint && !isCrossfading) {
        if (!isLastTrack || infinityMode) {
          if (currentIndex + 1 < playlist.length) {
            doCrossfade(currentIndex + 1);
          } else if (!infinityMode && !fadeOutTimerRef.current) {
            doFadeOut();
          }
        } else if (isLastTrack && !fadeOutTimerRef.current) {
          doFadeOut();
        }
      }
    };
    const timer = setInterval(checkProgress, 100);
    return () => clearInterval(timer);
  }, [switchPoint, currentIndex, playlist.length, isCrossfading, doCrossfade, doFadeOut, infinityMode, loadingMore, loadMoreTracks]);

  useEffect(() => {
    const handleEnded = () => {
      if (!isCrossfading) {
        if (currentIndex + 1 < playlist.length) doCrossfade(currentIndex + 1);
        else setIsPlaying(false);
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
    if (audio) audio.playbackRate = 0.001;
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
        audio.currentTime = Math.max(0, Math.min(audio.duration - 0.01, audio.currentTime + timeDelta));
      }
    };
    const handleUp = () => {
      setIsDragging(false);
      setScratchActive(false);
      const audio = getActiveAudio();
      if (audio) audio.playbackRate = 1;
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
      if (fadeOutTimerRef.current) clearInterval(fadeOutTimerRef.current);
      fadeOutTimerRef.current = null;
      audio.pause();
      setIsPlaying(false);
    } else {
      if (currentIndex < 0) startPlayback(0);
      else { audio.volume = 1; audio.play().catch(() => {}); setIsPlaying(true); }
    }
  };

  const skipToTrack = (index: number) => {
    if (crossfadeTimerRef.current) clearInterval(crossfadeTimerRef.current);
    if (fadeOutTimerRef.current) { clearInterval(fadeOutTimerRef.current); fadeOutTimerRef.current = null; }
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
    <main className="min-h-screen text-white relative overflow-hidden">
      <audio ref={audioARef} preload="auto" />
      <audio ref={audioBRef} preload="auto" />

      {/* Full-screen 3D lobster background */}
      <LobsterBackground isPlaying={isPlaying} bpm={currentBpm} />

      {/* Dark overlay so UI is readable */}
      <div className="fixed inset-0 bg-black/20" style={{ zIndex: 1 }} />

      {/* Settings Sidebar */}
      {showSettings && <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setShowSettings(false)} />}
      <div className={`fixed top-0 right-0 h-full bg-gray-900/98 backdrop-blur-md border-l border-red-900/40 z-50 transition-transform duration-300 w-80 ${showSettings ? "translate-x-0" : "translate-x-full"}`}>
        <div className="p-6 space-y-6 h-full overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">DJ Settings</h2>
            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white text-xl">X</button>
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
            <p className="text-xs text-gray-500">Drag the vinyl disc to scratch while playing.</p>
          </div>
          <div className="border-t border-gray-700/50 pt-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-300">Open Source</h3>
            <a href="https://github.com/damoahdominic/clawdj" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-orange-500 flex items-center justify-center text-sm font-bold">C</div>
              <div><div className="text-sm font-medium text-gray-200 group-hover:text-orange-300">ClawDJ</div><div className="text-xs text-gray-500">AI-powered DJ mixing & radio</div></div>
            </a>
            <a href="https://github.com/damoahdominic/anysong" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-colors group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center text-sm font-bold">A</div>
              <div><div className="text-sm font-medium text-gray-200 group-hover:text-orange-300">AnySong</div><div className="text-xs text-gray-500">Universal music search API</div></div>
            </a>
          </div>
        </div>
      </div>

      {/* Main Content — floating on top of 3D scene */}
      <div className="relative z-10 max-w-2xl mx-auto p-6 pt-10 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <a href="/" className="text-gray-400 hover:text-orange-400 transition-colors text-sm">&larr; Home</a>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 bg-clip-text text-transparent">ClawDJ Radio</h1>
          <button onClick={() => setShowSettings(!showSettings)} className="text-gray-400 hover:text-orange-400 transition-colors text-xl" title="Settings">&#9881;</button>
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

        {/* Now Playing + Vinyl */}
        {currentTrack && (
          <div className="bg-gradient-to-br from-gray-900/90 to-gray-900/80 backdrop-blur-md rounded-2xl p-8 space-y-6 border border-red-900/20 shadow-xl shadow-red-950/20">
            <div className="flex items-center gap-8">
              {/* Vinyl Disc */}
              <div className="flex-shrink-0 flex flex-col items-center">
                <div
                  ref={vinylRef}
                  onMouseDown={handleVinylDown}
                  onTouchStart={handleVinylDown}
                  className={`w-36 h-36 sm:w-44 sm:h-44 rounded-full relative select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
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
                        {currentTrack.cover ? <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" /> : <span className="text-xl font-bold">DJ</span>}
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: "conic-gradient(from 0deg, transparent 0%, rgba(255,255,255,0.04) 10%, transparent 20%, rgba(255,255,255,0.02) 40%, transparent 60%, rgba(255,255,255,0.03) 80%, transparent 100%)" }} />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-2 h-2 rounded-full bg-gray-950 border border-gray-800" /></div>
                </div>
                <div className="mt-2 text-center">
                  {scratchActive ? <span className="text-xs text-orange-400 animate-pulse font-mono">scratching...</span> : isPlaying ? <span className="text-xs text-gray-500">drag to scratch</span> : null}
                </div>
              </div>

              {/* Track Info */}
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <div className="text-xl font-bold truncate">{currentTrack.title}</div>
                  <div className="text-orange-300 truncate">{currentTrack.artist}</div>
                  <div className="text-gray-500 text-sm truncate">{currentTrack.album}</div>
                </div>
                <div className="flex items-center gap-3 text-sm flex-wrap">
                  {currentTrack.bpm > 0 && <span className="px-2.5 py-1 bg-red-900/40 text-red-300 rounded-full font-mono text-xs border border-red-800/30">{currentTrack.bpm} BPM</span>}
                  <span className="text-gray-500">{currentIndex + 1} / {playlist.length}</span>
                  {isCrossfading && <span className="text-orange-400 animate-pulse text-xs">crossfading...</span>}
                </div>
                <div className="relative h-2.5 bg-gray-800/80 rounded-full overflow-hidden">
                  <div className="absolute h-full bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
                  <div className="absolute top-0 h-full w-0.5 bg-white/40 rounded" style={{ left: `${switchPoint * 100}%` }} title="Crossfade point" />
                </div>
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Crossfade: {(crossfadeMs / 1000).toFixed(1)}s</span>
                  <span>Switch at {Math.round(switchPoint * 100)}%</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-8 pt-2">
              <button onClick={skipPrev} disabled={currentIndex <= 0} className="text-3xl disabled:opacity-30 hover:scale-110 hover:text-orange-400 transition-all">&laquo;</button>
              <button onClick={togglePlay} className="w-20 h-20 rounded-full bg-gradient-to-r from-red-600 via-orange-500 to-yellow-500 flex items-center justify-center text-4xl hover:scale-105 transition-transform shadow-lg shadow-orange-900/40 active:scale-95">
                {isPlaying ? "\u23F8" : "\u25B6"}
              </button>
              <button onClick={skipNext} disabled={currentIndex >= playlist.length - 1} className="text-3xl disabled:opacity-30 hover:scale-110 hover:text-orange-400 transition-all">&raquo;</button>
            </div>
          </div>
        )}

        {/* Playlist */}
        {playlist.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-gray-400">
                Up next &middot; {playlist.length} tracks
                {infinityMode && <span className="text-orange-400 ml-1">&middot; infinity</span>}
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
                    i === currentIndex ? "bg-gradient-to-r from-red-900/40 to-orange-900/20 border-l-2 border-orange-500" : i < currentIndex ? "opacity-40 hover:opacity-70" : "hover:bg-gray-800/40"
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
            <div className="text-6xl mb-4">&#127911;</div>
            <p className="text-gray-300 text-lg">Type a vibe and hit Go</p>
            <p className="text-xs mt-2 text-gray-500">Tap the gear icon for BPM range, crossfade settings & more</p>
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
