"use client";

import { useRef, useCallback, useEffect, useState } from "react";

export interface ScratchLoopState {
  playbackSpeed: number;
  isReversed: boolean;
  secondsPlayed: number;
  progress: number;
}

interface UseScratchOptions {
  isActive: boolean;
  duration: number;
  onLoop: (state: ScratchLoopState) => void;
  onDragStart?: () => void;
  onDragEnd?: (secondsPlayed: number) => void;
}

const SPEED_SAMPLES = 10;
const SPEED_CLAMP = 4;

export function useScratch(
  elementRef: React.RefObject<SVGSVGElement | HTMLElement | null>,
  options: UseScratchOptions,
) {
  const { isActive, duration, onLoop, onDragStart, onDragEnd } = options;
  const [isDragging, setIsDragging] = useState(false);

  const isActiveRef = useRef(isActive);
  const isDraggingRef = useRef(false);
  const durationRef = useRef(duration);
  const onLoopRef = useRef(onLoop);
  const onDragEndRef = useRef(onDragEnd);

  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { onLoopRef.current = onLoop; }, [onLoop]);
  useEffect(() => { onDragEndRef.current = onDragEnd; }, [onDragEnd]);

  const angleRef = useRef(0);
  const prevAngleRef = useRef(0);
  const speedSamplesRef = useRef<number[]>([]);
  const playbackSpeedRef = useRef(1);
  const isReversedRef = useRef(false);
  const lastTsRef = useRef(0);
  const rafRef = useRef<number>(0);
  const centerRef = useRef({ x: 0, y: 0 });
  const startAngleOffsetRef = useRef(0);

  const getMaxAngle = useCallback(() =>
    Math.max(1, durationRef.current) * 0.75 * Math.PI * 2, []);

  const getSpeedPerMs = useCallback(() =>
    getMaxAngle() / (Math.max(1, durationRef.current) * 1000), [getMaxAngle]);

  const addSample = useCallback((v: number): number => {
    const s = speedSamplesRef.current;
    s.push(v);
    if (s.length > SPEED_SAMPLES) s.shift();
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    return Math.max(-SPEED_CLAMP, Math.min(SPEED_CLAMP, avg));
  }, []);

  useEffect(() => {
    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = lastTsRef.current ? ts - lastTsRef.current : 16;
      lastTsRef.current = ts;
      const maxAngle = getMaxAngle();
      const speedPerMs = getSpeedPerMs();

      if (isDraggingRef.current) {
        const delta = angleRef.current - prevAngleRef.current;
        prevAngleRef.current = angleRef.current;
        const rawSpeed = dt > 0 ? delta / (speedPerMs * dt) : 0;
        playbackSpeedRef.current = addSample(rawSpeed);
        isReversedRef.current = playbackSpeedRef.current < 0;
      } else if (isActiveRef.current) {
        const newAngle = angleRef.current + speedPerMs * dt;
        angleRef.current = newAngle >= maxAngle ? newAngle % maxAngle : newAngle;
        prevAngleRef.current = angleRef.current;
        playbackSpeedRef.current = addSample(1);
        isReversedRef.current = false;
      }

      const clampedAngle = Math.max(0, Math.min(maxAngle, angleRef.current));
      const secondsPlayed = durationRef.current > 0
        ? (clampedAngle / maxAngle) * durationRef.current : 0;
      const progress = durationRef.current > 0 ? secondsPlayed / durationRef.current : 0;

      onLoopRef.current({ playbackSpeed: playbackSpeedRef.current, isReversed: isReversedRef.current, secondsPlayed, progress });
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [getMaxAngle, getSpeedPerMs, addSample]);

  const getPointerAngle = useCallback((x: number, y: number) =>
    Math.atan2(y - centerRef.current.y, x - centerRef.current.x), []);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!isActiveRef.current) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const el = elementRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      centerRef.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    startAngleOffsetRef.current = getPointerAngle(e.clientX, e.clientY) - angleRef.current;
    prevAngleRef.current = angleRef.current;
    speedSamplesRef.current = [];
    isDraggingRef.current = true;
    setIsDragging(true);
    onDragStart?.();
  }, [elementRef, getPointerAngle, onDragStart]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    const maxAngle = getMaxAngle();
    const raw = getPointerAngle(e.clientX, e.clientY) - startAngleOffsetRef.current;
    angleRef.current = Math.max(0, Math.min(maxAngle, raw));
  }, [getPointerAngle, getMaxAngle]);

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    speedSamplesRef.current = [];
    playbackSpeedRef.current = 1;
    isReversedRef.current = false;
    const maxAngle = getMaxAngle();
    const clampedAngle = Math.max(0, Math.min(maxAngle, angleRef.current));
    const seconds = durationRef.current > 0 ? (clampedAngle / maxAngle) * durationRef.current : 0;
    onDragEndRef.current?.(seconds);
  }, [getMaxAngle]);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;
    el.addEventListener("pointerdown", handlePointerDown as EventListener);
    window.addEventListener("pointermove", handlePointerMove as EventListener);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      el.removeEventListener("pointerdown", handlePointerDown as EventListener);
      window.removeEventListener("pointermove", handlePointerMove as EventListener);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [elementRef, handlePointerDown, handlePointerMove, handlePointerUp]);

  const resetPosition = useCallback(() => {
    angleRef.current = 0;
    prevAngleRef.current = 0;
    speedSamplesRef.current = [];
    playbackSpeedRef.current = 1;
    isReversedRef.current = false;
  }, []);

  return { isDragging, angleRef, resetPosition };
}
