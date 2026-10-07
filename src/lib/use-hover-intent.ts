"use client";

import { useCallback, useEffect, useRef } from "react";

/** Hover-to-open for feature lists and tabs (2026-10-07): calls `onIntent`
 *  once the pointer has rested on an item briefly, so sweeping across a list
 *  doesn't flicker every item open. Mouse/trackpad only; touch keeps tap and
 *  keyboards keep Enter/Space. */
export function useHoverIntent<T>(onIntent: (value: T) => void, delay = 120) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(onIntent);
  useEffect(() => {
    cb.current = onIntent;
  }, [onIntent]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const enter = useCallback(
    (value: T) => (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => cb.current(value), delay);
    },
    [delay]
  );
  const leave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { enter, leave };
}
