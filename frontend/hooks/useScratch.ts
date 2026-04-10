"use client";

import { useRef, useCallback, useEffect, useState } from "react";

interface UseScratchOptions {
  /** Only allow scratching when true (e.g., when track is playing). */
  isActive: boolean;
  onScratchStart?: () => void;
  /** Called with instantaneous drag velocity (px/frame, signed). */
  onScratchMove?: (velocity: number) => void;
  onScratchEnd?: () => void;
  /** Called with the time delta (seconds) to seek the audio element. */
  onSeek?: (timeDelta: number) => void;
}

/**
 * Attaches pointer-event–based scratch interaction to an SVG or HTML element.
 * Returns the current visual rotation angle (degrees) and drag state.
 */
export function useScratch(
  elementRef: React.RefObject<SVGSVGElement | HTMLElement>,
  options: UseScratchOptions
) {
  const { isActive, onScratchStart, onScratchMove, onScratchEnd, onSeek } = options;

  const [isDragging, setIsDragging] = useState(false);
  const [angle, setAngle] = useState(0);

  // Refs so callbacks don't go stale in event listeners
  const isActiveRef = useRef(isActive);
  const isDraggingRef = useRef(false);
  const lastClientRef = useRef({ x: 0, y: 0 });
  const lastAngleRef = useRef(0);
  const dragStartAngleOffsetRef = useRef(0); // angle of disc when drag began

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const getAngle = useCallback(
    (clientX: number, clientY: number): number => {
      const el = elementRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      return (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
    },
    [elementRef]
  );

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (!isActiveRef.current) return;
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);

      isDraggingRef.current = true;
      setIsDragging(true);
      lastClientRef.current = { x: e.clientX, y: e.clientY };

      const pointerAngle = getAngle(e.clientX, e.clientY);
      dragStartAngleOffsetRef.current = pointerAngle - lastAngleRef.current;

      onScratchStart?.();
    },
    [getAngle, onScratchStart]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();

      const dx = e.clientX - lastClientRef.current.x;
      const dy = e.clientY - lastClientRef.current.y;
      lastClientRef.current = { x: e.clientX, y: e.clientY };

      // Compute new disc angle from pointer position
      const pointerAngle = getAngle(e.clientX, e.clientY);
      const newAngle = pointerAngle - dragStartAngleOffsetRef.current;
      const delta = newAngle - lastAngleRef.current;
      lastAngleRef.current = newAngle;
      setAngle(newAngle);

      // Velocity for scratch oscillator (signed, px/event)
      const velocity = Math.sign(dx + dy) * Math.sqrt(dx * dx + dy * dy);
      onScratchMove?.(velocity);

      // Seek: ~0.008s per degree of rotation (empirical)
      onSeek?.(delta * 0.008);
    },
    [getAngle, onScratchMove, onSeek]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    onScratchEnd?.();
  }, [onScratchEnd]);

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
  }, [handlePointerDown, handlePointerMove, handlePointerUp, elementRef]);

  /** Called by the parent to externally set the angle (e.g., during auto-spin). */
  const setExternalAngle = useCallback((a: number) => {
    if (!isDraggingRef.current) {
      lastAngleRef.current = a;
      // Don't call setAngle here — the auto-spin directly mutates the DOM
    }
  }, []);

  return { isDragging, angle, setExternalAngle };
}
