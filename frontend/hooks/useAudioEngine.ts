"use client";

import { useRef, useCallback } from "react";

/**
 * Physics-based audio engine that manipulates the ACTUAL track's AudioBuffer.
 * Creates both forward AND reversed buffers. Smooth speed via linearRampToValueAtTime.
 */
export function useAudioEngine() {
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const crackleRef = useRef<AudioBufferSourceNode | null>(null);

  const forwardBufRef = useRef<AudioBuffer | null>(null);
  const reversedBufRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const isReversedRef = useRef(false);
  const isPlayingRef = useRef(false);
  const durationRef = useRef(0);
  const loadedUrlRef = useRef("");

  // ── Context / gain init ───────────────────────────────────────────────────

  const ensureContext = useCallback((): AudioContext => {
    if (ctxRef.current && ctxRef.current.state !== "closed") return ctxRef.current;

    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(ctx.destination);
    gainRef.current = gain;

    // Subtle vinyl crackle loop
    const frames = Math.floor(ctx.sampleRate * 2);
    const noiseBuf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < frames; i++) nd[i] = Math.random() * 0.014 - 0.007;
    const crackle = ctx.createBufferSource();
    crackle.buffer = noiseBuf;
    crackle.loop = true;
    const cg = ctx.createGain();
    cg.gain.value = 0.05;
    crackle.connect(cg);
    cg.connect(ctx.destination);
    crackle.start();
    crackleRef.current = crackle;

    ctxRef.current = ctx;
    return ctx;
  }, []);

  const resume = useCallback(() => {
    ctxRef.current?.resume();
  }, []);

  // ── Buffer helpers ────────────────────────────────────────────────────────

  const buildReversed = (buf: AudioBuffer, ctx: AudioContext): AudioBuffer => {
    const rev = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const src = buf.getChannelData(ch);
      const dst = rev.getChannelData(ch);
      for (let i = 0; i < buf.length; i++) dst[i] = src[buf.length - 1 - i];
    }
    return rev;
  };

  // ── Track loading ─────────────────────────────────────────────────────────

  const loadTrack = useCallback(async (url: string): Promise<void> => {
    if (!url || url === loadedUrlRef.current) return;
    loadedUrlRef.current = url;

    try { sourceRef.current?.stop(); } catch { /* noop */ }
    sourceRef.current = null;
    isPlayingRef.current = false;
    isReversedRef.current = false;
    forwardBufRef.current = null;
    reversedBufRef.current = null;
    durationRef.current = 0;

    const ctx = ensureContext();
    if (ctx.state === "suspended") await ctx.resume();

    try {
      const res = await fetch(url);
      const ab = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      forwardBufRef.current = buf;
      reversedBufRef.current = buildReversed(buf, ctx);
      durationRef.current = buf.duration;
    } catch (e) {
      console.warn("[useAudioEngine] load failed:", url, e);
      loadedUrlRef.current = "";
      throw e;
    }
  }, [ensureContext]);

  // ── Playback ──────────────────────────────────────────────────────────────

  const stopSource = useCallback(() => {
    try { sourceRef.current?.stop(); } catch { /* noop */ }
    sourceRef.current = null;
  }, []);

  /** Start (or restart) from a specific track-time position. */
  const play = useCallback((secondsPlayed: number) => {
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;

    const buf = isReversedRef.current ? reversedBufRef.current : forwardBufRef.current;
    if (!buf) return;

    stopSource();
    const dur = buf.duration;
    const offset = isReversedRef.current
      ? Math.max(0, Math.min(dur, dur - secondsPlayed))
      : Math.max(0, Math.min(dur, secondsPlayed));

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 1;
    src.connect(gain);
    src.start(0, offset);
    sourceRef.current = src;
    isPlayingRef.current = true;
  }, [stopSource]);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    stopSource();
  }, [stopSource]);

  // ── Speed / direction (called every RAF frame) ────────────────────────────

  /**
   * Called each animation frame by the physics loop.
   * On direction change: swaps to reversed buffer at the mirrored position.
   * Otherwise: smooth playbackRate ramp via linearRampToValueAtTime.
   */
  const updateSpeed = useCallback((
    speed: number,
    isReversed: boolean,
    secondsPlayed: number,
  ) => {
    const ctx = ctxRef.current;
    if (!ctx) return;

    if (isReversed !== isReversedRef.current) {
      isReversedRef.current = isReversed;
      const buf = isReversed ? reversedBufRef.current : forwardBufRef.current;
      const gain = gainRef.current;
      if (!buf || !gain) return;

      stopSource();
      const dur = buf.duration;
      const offset = isReversed
        ? Math.max(0, Math.min(dur, dur - secondsPlayed))
        : Math.max(0, Math.min(dur, secondsPlayed));

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = Math.max(0.001, Math.abs(speed));
      src.connect(gain);
      src.start(0, offset);
      sourceRef.current = src;
      return;
    }

    const src = sourceRef.current;
    if (!src) return;
    const absSpeed = Math.max(0.001, Math.abs(speed));
    src.playbackRate.cancelScheduledValues(ctx.currentTime);
    src.playbackRate.linearRampToValueAtTime(absSpeed, ctx.currentTime + 0.05);
  }, [stopSource]);

  // ── Volume ────────────────────────────────────────────────────────────────

  const setVolume = useCallback((vol: number) => {
    const ctx = ctxRef.current;
    const gain = gainRef.current;
    if (!ctx || !gain) return;
    gain.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), ctx.currentTime, 0.05);
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  const dispose = useCallback(() => {
    try { sourceRef.current?.stop(); } catch { /* noop */ }
    try { crackleRef.current?.stop(); } catch { /* noop */ }
    try { ctxRef.current?.close(); } catch { /* noop */ }
    sourceRef.current = null;
    crackleRef.current = null;
    gainRef.current = null;
    ctxRef.current = null;
    forwardBufRef.current = null;
    reversedBufRef.current = null;
    loadedUrlRef.current = "";
    isPlayingRef.current = false;
  }, []);

  return {
    loadTrack,
    play,
    pause,
    updateSpeed,
    setVolume,
    resume,
    dispose,
    isPlayingRef,
    durationRef,
  };
}
