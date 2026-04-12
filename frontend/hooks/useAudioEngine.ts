"use client";

import { useRef, useCallback } from "react";

/** Minimum playbackRate supported by HTMLMediaElement (Chrome: 0.0625). */
const MIN_PLAYBACK_RATE = 0.0625;

/**
 * Audio engine:
 *   <audio> → (optional) MediaElementSource → LOW → MID → HIGH → mainGain → destination
 *
 * The Web Audio EQ chain is built lazily the first time setEq() is called with
 * a non-zero value. Until then, playback uses the raw <audio> element directly
 * — this is the most background-tab-friendly path on every browser (Chrome,
 * Safari, Firefox all keep <audio> playing when the tab is hidden). Once EQ is
 * engaged, audio is routed through Web Audio, which trades some Safari-background
 * robustness for real filter gains.
 *
 * The reversed-buffer path (used during backwards scratching) goes through its
 * own gain node directly to destination — it bypasses EQ.
 */

export interface AudioEngineApi {
  loadTrack: (url: string) => Promise<void>;
  play: (secondsPlayed: number) => Promise<void>;
  pause: () => void;
  updateSpeed: (speed: number, isReversed: boolean, secondsPlayed: number) => void;
  setVolume: (vol: number) => void;
  /** Base playback rate (1.0 = normal). Composed with scratch speed. */
  setBaseRate: (rate: number) => void;
  /** EQ gains in dB. Typical range ±12 dB. */
  setEq: (lowDb: number, midDb: number, highDb: number) => void;
  /** Seek without starting/stopping playback. */
  seekTo: (seconds: number) => void;
  /** Enable a loop region [inSec, outSec]. Pass null to clear. */
  setLoop: (region: { inSec: number; outSec: number } | null) => void;
  /** Enter scratch mode — pauses normal playback and prepares buffer-based
   *  scratch playback at the given starting position. */
  beginScratch: (startSeconds: number) => void;
  /** Drive scratch playback from the drag loop. */
  updateScratch: (speed: number, isReversed: boolean, seconds: number) => void;
  /** Exit scratch mode — reseeks the audio element and resumes forward play. */
  endScratch: (seconds: number) => void;
  resume: () => Promise<void>;
  dispose: () => void;
  getCurrentTime: () => number;
  isPlayingRef: React.MutableRefObject<boolean>;
  durationRef: React.MutableRefObject<number>;
}

export function useAudioEngine(): AudioEngineApi {
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const lowFilterRef = useRef<BiquadFilterNode | null>(null);
  const midFilterRef = useRef<BiquadFilterNode | null>(null);
  const highFilterRef = useRef<BiquadFilterNode | null>(null);
  const mainGainRef = useRef<GainNode | null>(null);

  const forwardBufRef = useRef<AudioBuffer | null>(null);
  const reversedBufRef = useRef<AudioBuffer | null>(null);
  const bufSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufGainRef = useRef<GainNode | null>(null);
  const usingBufRef = useRef(false);

  // Dedicated scratch path: separate source + gain so it's independent of the
  // reversed-scratch path used by updateSpeed.
  const scratchingRef = useRef(false);
  const scratchSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const scratchGainRef = useRef<GainNode | null>(null);
  const scratchDirRef = useRef<0 | 1 | -1>(0);
  const scratchAnchorTimeRef = useRef(0);
  const scratchAnchorCtxTimeRef = useRef(0);
  /** True when beginScratch was able to take over via the buffer path (and
   *  paused the audio element). When false, we're in fallback-modulation
   *  mode on the raw <audio> element. */
  const scratchBufferPathRef = useRef(false);

  const isPlayingRef = useRef(false);
  const isReversedRef = useRef(false);
  const durationRef = useRef(0);
  const loadedUrlRef = useRef("");
  const volumeRef = useRef(1);
  const baseRateRef = useRef(1);
  const eqLowRef = useRef(0);
  const eqMidRef = useRef(0);
  const eqHighRef = useRef(0);
  /** True once the user has asked for a non-zero EQ — from then on we route
   *  through the Web Audio chain. Before that, raw <audio> is used. */
  const eqEngagedRef = useRef(false);

  // Loop region state + watcher
  const loopRef = useRef<{ inSec: number; outSec: number } | null>(null);
  const loopWatcherRef = useRef<number | null>(null);

  const stopLoopWatcher = useCallback(() => {
    if (loopWatcherRef.current !== null) {
      clearInterval(loopWatcherRef.current);
      loopWatcherRef.current = null;
    }
  }, []);

  const startLoopWatcher = useCallback(() => {
    stopLoopWatcher();
    loopWatcherRef.current = window.setInterval(() => {
      const region = loopRef.current;
      const audioEl = audioElRef.current;
      if (!region || !audioEl) return;
      if (audioEl.currentTime >= region.outSec) {
        audioEl.currentTime = Math.max(0, region.inSec);
      }
      if (audioEl.currentTime < region.inSec - 0.1) {
        audioEl.currentTime = region.inSec;
      }
    }, 30);
  }, [stopLoopWatcher]);

  // ── Context ───────────────────────────────────────────────────────────────

  const ensureCtx = useCallback((): AudioContext => {
    if (ctxRef.current && ctxRef.current.state !== "closed") return ctxRef.current;
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const bufGain = ctx.createGain();
    bufGain.gain.value = volumeRef.current;
    bufGain.connect(ctx.destination);
    bufGainRef.current = bufGain;
    ctxRef.current = ctx;
    return ctx;
  }, []);

  // Tear down the existing Web Audio chain (but keep the context).
  const teardownChain = useCallback(() => {
    try { mediaSourceRef.current?.disconnect(); } catch { /* noop */ }
    try { lowFilterRef.current?.disconnect(); } catch { /* noop */ }
    try { midFilterRef.current?.disconnect(); } catch { /* noop */ }
    try { highFilterRef.current?.disconnect(); } catch { /* noop */ }
    try { mainGainRef.current?.disconnect(); } catch { /* noop */ }
    mediaSourceRef.current = null;
    lowFilterRef.current = null;
    midFilterRef.current = null;
    highFilterRef.current = null;
    mainGainRef.current = null;
  }, []);

  // Build the EQ chain for a fresh audio element. Returns true on success.
  const setupChain = useCallback((audioEl: HTMLAudioElement): boolean => {
    try {
      const ctx = ensureCtx();
      const src = ctx.createMediaElementSource(audioEl);

      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = 320;
      low.gain.value = eqLowRef.current;

      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      mid.frequency.value = 1000;
      mid.Q.value = 0.7;
      mid.gain.value = eqMidRef.current;

      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = 3200;
      high.gain.value = eqHighRef.current;

      const mainGain = ctx.createGain();
      mainGain.gain.value = volumeRef.current;

      src.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(mainGain);
      mainGain.connect(ctx.destination);

      mediaSourceRef.current = src;
      lowFilterRef.current = low;
      midFilterRef.current = mid;
      highFilterRef.current = high;
      mainGainRef.current = mainGain;

      // Element's own volume must be 1 when routed through Web Audio —
      // mainGain controls effective output level from here on.
      audioEl.volume = 1;
      return true;
    } catch (e) {
      console.warn("[useAudioEngine] EQ chain setup failed; using direct audio element", e);
      teardownChain();
      return false;
    }
  }, [ensureCtx, teardownChain]);

  // ── Track loading ─────────────────────────────────────────────────────────

  const loadTrack = useCallback(async (url: string): Promise<void> => {
    if (!url || url === loadedUrlRef.current) return;
    loadedUrlRef.current = url;

    // Tear down previous state
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = "";
    }
    teardownChain();
    stopLoopWatcher();
    loopRef.current = null;
    try { bufSourceRef.current?.stop(); } catch { /* noop */ }
    bufSourceRef.current = null;
    usingBufRef.current = false;
    isPlayingRef.current = false;
    isReversedRef.current = false;
    reversedBufRef.current = null;
    durationRef.current = 0;

    const audioEl = new Audio();
    audioEl.crossOrigin = "anonymous";
    audioEl.preload = "auto";
    const el = audioEl as HTMLAudioElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    el.preservesPitch = false;
    el.mozPreservesPitch = false;
    el.webkitPreservesPitch = false;
    audioEl.src = url;
    audioElRef.current = audioEl;

    // Wait for duration metadata
    await new Promise<void>((resolve) => {
      const done = () => {
        if (audioEl.duration > 0) durationRef.current = audioEl.duration;
        resolve();
      };
      audioEl.addEventListener("loadedmetadata", done, { once: true });
      audioEl.addEventListener("error", resolve as () => void, { once: true });
      setTimeout(resolve, 5000);
    });

    // Only route through Web Audio if the user has actually engaged EQ. The
    // raw <audio> element plays more reliably in background tabs everywhere.
    if (eqEngagedRef.current) {
      const chainOk = setupChain(audioEl);
      if (!chainOk) audioEl.volume = volumeRef.current;
    } else {
      audioEl.volume = volumeRef.current;
    }

    // Async load forward + reversed buffers for scratch playback (best-effort)
    forwardBufRef.current = null;
    fetch(url)
      .then(r => r.arrayBuffer())
      .then(ab => {
        const ctx = ensureCtx();
        return ctx.decodeAudioData(ab).then(buf => {
          forwardBufRef.current = buf;
          const rev = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
          for (let ch = 0; ch < buf.numberOfChannels; ch++) {
            const s = buf.getChannelData(ch);
            const d = rev.getChannelData(ch);
            for (let i = 0; i < buf.length; i++) d[i] = s[buf.length - 1 - i];
          }
          reversedBufRef.current = rev;

          // If the user was already scratching while we were decoding, start
          // the scratch source now so they actually hear something. Inlined
          // (rather than calling startScratchSource) so this works regardless
          // of closure ordering within the hook.
          if (scratchingRef.current && !scratchSourceRef.current && scratchGainRef.current) {
            const startSecs = audioElRef.current?.currentTime ?? 0;
            try {
              const src = ctx.createBufferSource();
              src.buffer = buf;
              src.playbackRate.value = 0.0001;
              src.connect(scratchGainRef.current);
              src.start(0, Math.max(0, Math.min(buf.duration, startSecs)));
              scratchSourceRef.current = src;
              scratchDirRef.current = 1;
              scratchAnchorTimeRef.current = startSecs;
              scratchAnchorCtxTimeRef.current = ctx.currentTime;
            } catch { /* noop */ }
          }
        });
      })
      .catch(() => { /* scratch audio unavailable */ });
  }, [ensureCtx, setupChain, teardownChain, stopLoopWatcher]);

  // ── Playback ──────────────────────────────────────────────────────────────

  const play = useCallback(async (secondsPlayed: number) => {
    const audioEl = audioElRef.current;
    if (!audioEl) return;

    if (usingBufRef.current) {
      try { bufSourceRef.current?.stop(); } catch { /* noop */ }
      bufSourceRef.current = null;
      usingBufRef.current = false;
    }

    isReversedRef.current = false;
    const dur = audioEl.duration || durationRef.current || 0;
    if (dur > 0) audioEl.currentTime = Math.max(0, Math.min(dur, secondsPlayed));
    audioEl.playbackRate = Math.max(MIN_PLAYBACK_RATE, baseRateRef.current);

    // When EQ chain is active the ctx may be suspended; resume on user gesture.
    if (ctxRef.current?.state === "suspended") {
      try { await ctxRef.current.resume(); } catch { /* ignore */ }
    }

    try {
      await audioEl.play();
      isPlayingRef.current = true;
    } catch (e) {
      console.warn("[useAudioEngine] play() blocked:", e);
    }
  }, []);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    audioElRef.current?.pause();
    if (usingBufRef.current) {
      try { bufSourceRef.current?.stop(); } catch { /* noop */ }
      bufSourceRef.current = null;
      usingBufRef.current = false;
    }
  }, []);

  const resume = useCallback(async () => {
    if (ctxRef.current?.state === "suspended") {
      try { await ctxRef.current.resume(); } catch { /* ignore */ }
    }
  }, []);

  // ── Speed / direction ─────────────────────────────────────────────────────

  const updateSpeed = useCallback((speed: number, isReversed: boolean, secondsPlayed: number) => {
    const absSpeed = Math.max(MIN_PLAYBACK_RATE, Math.abs(speed));
    const effective = Math.max(MIN_PLAYBACK_RATE, absSpeed * Math.max(MIN_PLAYBACK_RATE, baseRateRef.current));
    const audioEl = audioElRef.current;

    if (isReversed && reversedBufRef.current) {
      if (!usingBufRef.current || !bufSourceRef.current) {
        audioEl?.pause();
        usingBufRef.current = true;
        try { bufSourceRef.current?.stop(); } catch { /* noop */ }

        const ctx = ensureCtx();
        if (ctx.state === "suspended") ctx.resume().catch(() => { /* ignore */ });

        const gain = bufGainRef.current!;
        gain.gain.value = volumeRef.current;

        const rev = reversedBufRef.current;
        const dur = rev.duration;
        const offset = Math.max(0, Math.min(dur, dur - secondsPlayed));
        const src = ctx.createBufferSource();
        src.buffer = rev;
        src.playbackRate.value = effective;
        src.connect(gain);
        src.start(0, offset);
        bufSourceRef.current = src;
        isReversedRef.current = true;
      } else {
        const ctx = ctxRef.current!;
        bufSourceRef.current.playbackRate.cancelScheduledValues(ctx.currentTime);
        bufSourceRef.current.playbackRate.linearRampToValueAtTime(effective, ctx.currentTime + 0.05);
      }
    } else {
      if (usingBufRef.current) {
        try { bufSourceRef.current?.stop(); } catch { /* noop */ }
        bufSourceRef.current = null;
        usingBufRef.current = false;
        isReversedRef.current = false;
        if (audioEl) {
          const dur = audioEl.duration || durationRef.current || 0;
          if (dur > 0) audioEl.currentTime = Math.max(0, Math.min(dur, secondsPlayed));
          audioEl.playbackRate = effective;
          audioEl.play().catch(() => { /* noop */ });
        }
      } else if (audioEl) {
        audioEl.playbackRate = effective;
      }
    }
  }, [ensureCtx]);

  // ── Volume (crossfader) ───────────────────────────────────────────────────

  const setVolume = useCallback((vol: number) => {
    const v = Math.max(0, Math.min(1, vol));
    volumeRef.current = v;
    const ctx = ctxRef.current;
    if (mainGainRef.current && ctx) {
      mainGainRef.current.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    } else if (audioElRef.current) {
      // No chain set up: control element volume directly.
      audioElRef.current.volume = v;
    }
    if (bufGainRef.current && ctx) {
      bufGainRef.current.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    }
    if (scratchGainRef.current && ctx && scratchingRef.current) {
      scratchGainRef.current.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    }
  }, []);

  // ── Tempo (base rate) ─────────────────────────────────────────────────────

  const setBaseRate = useCallback((rate: number) => {
    const r = Math.max(0.25, Math.min(4, rate));
    baseRateRef.current = r;
    // If currently playing forward and not scratching, push the change now.
    const audioEl = audioElRef.current;
    if (audioEl && !usingBufRef.current) {
      audioEl.playbackRate = r;
    }
  }, []);

  // ── EQ ────────────────────────────────────────────────────────────────────

  const setEq = useCallback((lowDb: number, midDb: number, highDb: number) => {
    eqLowRef.current = lowDb;
    eqMidRef.current = midDb;
    eqHighRef.current = highDb;

    // Lazy-engage: if the user asks for any non-zero EQ and we haven't built
    // the chain yet, try to build it now for the current audio element.
    const anyNonZero = lowDb !== 0 || midDb !== 0 || highDb !== 0;
    const audioEl = audioElRef.current;
    if (anyNonZero && !eqEngagedRef.current && audioEl && !mediaSourceRef.current) {
      const ok = setupChain(audioEl);
      if (ok) {
        eqEngagedRef.current = true;
        // Re-apply current volume via the new main gain node.
        if (mainGainRef.current && ctxRef.current) {
          mainGainRef.current.gain.value = volumeRef.current;
        }
      }
    }

    const ctx = ctxRef.current;
    if (lowFilterRef.current && ctx) {
      lowFilterRef.current.gain.setTargetAtTime(lowDb, ctx.currentTime, 0.02);
    }
    if (midFilterRef.current && ctx) {
      midFilterRef.current.gain.setTargetAtTime(midDb, ctx.currentTime, 0.02);
    }
    if (highFilterRef.current && ctx) {
      highFilterRef.current.gain.setTargetAtTime(highDb, ctx.currentTime, 0.02);
    }
  }, [setupChain]);

  // ── Seek / loop / cue ─────────────────────────────────────────────────────

  const seekTo = useCallback((seconds: number) => {
    const audioEl = audioElRef.current;
    if (!audioEl) return;
    const dur = audioEl.duration || durationRef.current || 0;
    if (dur > 0) {
      audioEl.currentTime = Math.max(0, Math.min(dur, seconds));
    }
  }, []);

  const setLoop = useCallback((region: { inSec: number; outSec: number } | null) => {
    if (!region || region.outSec <= region.inSec + 0.05) {
      loopRef.current = null;
      stopLoopWatcher();
      return;
    }
    loopRef.current = region;
    startLoopWatcher();
  }, [startLoopWatcher, stopLoopWatcher]);

  // ── Scratch playback ──────────────────────────────────────────────────────
  // During a drag we pause the audio element and feed a dedicated
  // AudioBufferSourceNode straight to destination so playback rate can track
  // the drag velocity and produce the iconic pitch-shifted scratch sound.

  const stopScratchSource = () => {
    try { scratchSourceRef.current?.stop(); } catch { /* noop */ }
    try { scratchSourceRef.current?.disconnect(); } catch { /* noop */ }
    scratchSourceRef.current = null;
  };

  const startScratchSource = (ctx: AudioContext, seconds: number, dir: 1 | -1, rate: number) => {
    const buf = dir < 0 ? reversedBufRef.current : forwardBufRef.current;
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = scratchGainRef.current!;
    src.connect(gain);
    const dur = buf.duration;
    const offset = dir < 0
      ? Math.max(0, Math.min(dur, dur - seconds))
      : Math.max(0, Math.min(dur, seconds));
    src.start(0, offset);
    scratchSourceRef.current = src;
    scratchDirRef.current = dir;
    scratchAnchorTimeRef.current = seconds;
    scratchAnchorCtxTimeRef.current = ctx.currentTime;
  };

  const beginScratch = useCallback((startSeconds: number) => {
    const audioEl = audioElRef.current;
    if (!audioEl) return;
    scratchingRef.current = true;

    if (!forwardBufRef.current) {
      // Decoded buffer isn't ready — stay on the raw audio element path.
      // We don't pause, so updateScratch can modulate playbackRate live.
      scratchBufferPathRef.current = false;
      return;
    }

    // Buffer path: pause normal playback and feed a BufferSource straight to
    // destination. This is the "song stops, scratch sound takes over" moment.
    audioEl.pause();
    scratchBufferPathRef.current = true;

    const ctx = ensureCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => { /* ignore */ });

    const gain = ctx.createGain();
    // Keep at least audible level so even muted-deck scratches give feedback
    // (crossfader re-applies in updateScratch below if it changes).
    gain.gain.value = Math.max(0.5, volumeRef.current);
    gain.connect(ctx.destination);
    scratchGainRef.current = gain;

    stopScratchSource();
    startScratchSource(ctx, startSeconds, 1, 0.0001);
  }, [ensureCtx]);

  const updateScratch = useCallback((speed: number, isReversed: boolean, seconds: number) => {
    if (!scratchingRef.current) return;

    // Fallback mode: no decoded buffer yet → modulate the raw <audio> element
    // rate. Not authentic, but keeps the drag audible until buffer arrives.
    if (!scratchBufferPathRef.current) {
      // If the buffer just finished decoding, upgrade to buffer path.
      if (forwardBufRef.current && audioElRef.current) {
        audioElRef.current.pause();
        const ctx2 = ensureCtx();
        if (ctx2.state === "suspended") ctx2.resume().catch(() => { /* ignore */ });
        const gain = ctx2.createGain();
        gain.gain.value = Math.max(0.5, volumeRef.current);
        gain.connect(ctx2.destination);
        scratchGainRef.current = gain;
        stopScratchSource();
        startScratchSource(ctx2, seconds, isReversed ? -1 : 1, Math.max(0.05, Math.abs(speed)));
        scratchBufferPathRef.current = true;
        return;
      }
      const audioEl = audioElRef.current;
      if (!audioEl) return;
      const absSpeed = Math.abs(speed);
      if (absSpeed < 0.03) {
        // Hold: pause the element so position is frozen
        if (!audioEl.paused) audioEl.pause();
      } else {
        if (audioEl.paused) audioEl.play().catch(() => { /* noop */ });
        audioEl.playbackRate = Math.max(MIN_PLAYBACK_RATE, Math.min(6, absSpeed));
        // Seek close to the drag position so the modulated rate plays from
        // where the vinyl "is".
        const dur = audioEl.duration || durationRef.current || 0;
        if (dur > 0 && Math.abs(audioEl.currentTime - seconds) > 0.1) {
          audioEl.currentTime = Math.max(0, Math.min(dur, seconds));
        }
      }
      return;
    }

    const ctx = ctxRef.current;
    if (!ctx || !scratchGainRef.current) return;
    if (!forwardBufRef.current) return;

    const wantDir: 1 | -1 = isReversed ? -1 : 1;
    const absSpeed = Math.abs(speed);

    // Hold (user is pressing but not moving): freeze the source in place with
    // a near-zero playback rate. Keep it audible — real vinyl has a faint hiss
    // when the needle sits still, and letting gain stay up means the very
    // next tiny movement is instantly audible.
    if (absSpeed < 0.03) {
      if (scratchSourceRef.current) {
        try {
          scratchSourceRef.current.playbackRate.cancelScheduledValues(ctx.currentTime);
          scratchSourceRef.current.playbackRate.setValueAtTime(0.0001, ctx.currentTime);
        } catch { /* noop */ }
      }
      // Anchor so drift calc after a resume reflects the hold moment.
      scratchAnchorTimeRef.current = seconds;
      scratchAnchorCtxTimeRef.current = ctx.currentTime;
      return;
    }

    const rate = Math.min(6, absSpeed);
    const needRestart = scratchDirRef.current !== wantDir || !scratchSourceRef.current;

    if (needRestart) {
      stopScratchSource();
      startScratchSource(ctx, seconds, wantDir, rate);
      return;
    }

    // If the source's current playhead has drifted > 50 ms from where the
    // user's drag thinks it should be, resync by restarting.
    const elapsed = ctx.currentTime - scratchAnchorCtxTimeRef.current;
    const expectedPos = scratchAnchorTimeRef.current + scratchDirRef.current * rate * elapsed;
    if (Math.abs(expectedPos - seconds) > 0.05) {
      stopScratchSource();
      startScratchSource(ctx, seconds, wantDir, rate);
      return;
    }

    // Steady modulation: snap the rate to the new drag velocity. Authentic
    // scratches are full of sharp pitch changes — a linear ramp smooths the
    // character out, so we use setValueAtTime.
    try {
      scratchSourceRef.current!.playbackRate.cancelScheduledValues(ctx.currentTime);
      scratchSourceRef.current!.playbackRate.setValueAtTime(rate, ctx.currentTime);
    } catch { /* noop */ }
  }, []);

  const endScratch = useCallback((seconds: number) => {
    scratchingRef.current = false;
    stopScratchSource();
    try { scratchGainRef.current?.disconnect(); } catch { /* noop */ }
    scratchGainRef.current = null;
    scratchDirRef.current = 0;
    const usedBufferPath = scratchBufferPathRef.current;
    scratchBufferPathRef.current = false;

    const audioEl = audioElRef.current;
    if (!audioEl) return;
    const dur = audioEl.duration || durationRef.current || 0;
    if (dur > 0) audioEl.currentTime = Math.max(0, Math.min(dur, seconds));
    audioEl.playbackRate = Math.max(MIN_PLAYBACK_RATE, baseRateRef.current);
    // If we used the buffer path we paused the element — kick it back on.
    if (usedBufferPath || audioEl.paused) {
      audioEl.play().catch(() => { /* noop */ });
    }
    isPlayingRef.current = true;
  }, []);

  // ── Time query ────────────────────────────────────────────────────────────

  const getCurrentTime = useCallback((): number => {
    return audioElRef.current?.currentTime ?? 0;
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  const dispose = useCallback(() => {
    stopLoopWatcher();
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = "";
    }
    teardownChain();
    scratchingRef.current = false;
    try { scratchSourceRef.current?.stop(); } catch { /* noop */ }
    try { scratchGainRef.current?.disconnect(); } catch { /* noop */ }
    scratchSourceRef.current = null;
    scratchGainRef.current = null;
    try { bufSourceRef.current?.stop(); } catch { /* noop */ }
    try { ctxRef.current?.close(); } catch { /* noop */ }
    audioElRef.current = null;
    bufSourceRef.current = null;
    bufGainRef.current = null;
    ctxRef.current = null;
    reversedBufRef.current = null;
    loadedUrlRef.current = "";
    isPlayingRef.current = false;
    usingBufRef.current = false;
  }, [stopLoopWatcher, teardownChain]);

  return {
    loadTrack,
    play,
    pause,
    updateSpeed,
    setVolume,
    setBaseRate,
    setEq,
    seekTo,
    setLoop,
    beginScratch,
    updateScratch,
    endScratch,
    resume,
    dispose,
    getCurrentTime,
    isPlayingRef,
    durationRef,
  };
}
