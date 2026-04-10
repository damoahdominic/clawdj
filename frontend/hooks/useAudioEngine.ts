"use client";

import { useRef, useCallback } from "react";

/**
 * Web Audio API hook for vinyl noise and scratch oscillator effects.
 * Each Turntable instance gets its own AudioContext.
 */
export function useAudioEngine() {
  const contextRef = useRef<AudioContext | null>(null);
  const vinylSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const vinylGainRef = useRef<GainNode | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const oscGainRef = useRef<GainNode | null>(null);
  const isScratchingRef = useRef(false);
  const noiseInitializedRef = useRef(false);

  const getContext = useCallback((): AudioContext => {
    if (!contextRef.current) {
      contextRef.current = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return contextRef.current;
  }, []);

  /** Resume context (required after user gesture in most browsers). */
  const resumeContext = useCallback(() => {
    if (contextRef.current?.state === "suspended") {
      contextRef.current.resume();
    }
  }, []);

  /**
   * Creates a 2-channel vinyl noise buffer (white noise + occasional pops)
   * and starts looping it at a low gain. Call once on first user interaction.
   */
  const initVinylNoise = useCallback(() => {
    if (typeof window === "undefined") return;
    if (noiseInitializedRef.current) return;
    noiseInitializedRef.current = true;

    const ctx = getContext();
    const frameCount = Math.floor(ctx.sampleRate * 1.8);
    const buffer = ctx.createBuffer(2, frameCount, ctx.sampleRate);
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.getChannelData(1);

    let popCount = 0;
    for (let i = 0; i < frameCount; i++) {
      const rVal = Math.random() * 0.05 - 0.025;
      ch0[i] = i < frameCount / 2 ? rVal * 0.8 : rVal;
      if (popCount < 3 && Math.abs(rVal) > 0.0249975) {
        ch1[i] = rVal < 0 ? -0.9 : 0.9;
        popCount++;
      } else {
        ch1[i] = 0;
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = 0.25;

    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();

    vinylSourceRef.current = source;
    vinylGainRef.current = gain;
  }, [getContext]);

  /**
   * Start the scratch effect: mutes vinyl noise, ramps up sawtooth oscillator
   * whose frequency is modulated by drag velocity.
   */
  const startScratch = useCallback((velocity: number) => {
    if (typeof window === "undefined") return;
    const ctx = getContext();

    // Mute vinyl noise
    if (vinylGainRef.current) {
      vinylGainRef.current.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
    }

    // Create oscillator if not yet created
    if (!oscillatorRef.current) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = 220;

      const gain = ctx.createGain();
      gain.gain.value = 0;

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      oscillatorRef.current = osc;
      oscGainRef.current = gain;
    }

    const freq = Math.max(60, Math.min(2000, Math.abs(velocity) * 15 + 180));
    oscillatorRef.current.frequency.setTargetAtTime(freq, ctx.currentTime, 0.015);
    oscGainRef.current!.gain.setTargetAtTime(0.35, ctx.currentTime, 0.015);
    isScratchingRef.current = true;
  }, [getContext]);

  /** Update oscillator frequency as drag velocity changes. */
  const updateScratch = useCallback((velocity: number) => {
    if (!isScratchingRef.current || !oscillatorRef.current) return;
    const ctx = getContext();
    const freq = Math.max(60, Math.min(2000, Math.abs(velocity) * 15 + 180));
    oscillatorRef.current.frequency.setTargetAtTime(freq, ctx.currentTime, 0.015);
  }, [getContext]);

  /** Stop scratch: mute oscillator, restore vinyl noise. */
  const stopScratch = useCallback(() => {
    if (!isScratchingRef.current) return;
    isScratchingRef.current = false;
    if (typeof window === "undefined") return;
    const ctx = getContext();
    if (oscGainRef.current) {
      oscGainRef.current.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    }
    if (vinylGainRef.current) {
      vinylGainRef.current.gain.setTargetAtTime(0.25, ctx.currentTime, 0.04);
    }
  }, [getContext]);

  /** Disconnect and close the AudioContext (call on unmount). */
  const dispose = useCallback(() => {
    try {
      vinylSourceRef.current?.stop();
      oscillatorRef.current?.stop();
      contextRef.current?.close();
    } catch {
      // ignore errors during cleanup
    }
    vinylSourceRef.current = null;
    vinylGainRef.current = null;
    oscillatorRef.current = null;
    oscGainRef.current = null;
    contextRef.current = null;
    noiseInitializedRef.current = false;
  }, []);

  return { initVinylNoise, startScratch, updateScratch, stopScratch, resumeContext, dispose };
}
