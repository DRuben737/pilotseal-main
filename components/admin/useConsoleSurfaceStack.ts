"use client";

import { useCallback, useState } from "react";

/**
 * Keeps nested console drawers and dialogs in a real navigation hierarchy.
 * `back` dismisses exactly one surface; `closeAll` is reserved for a completed
 * top-level workflow or a route change.
 */
export function useConsoleSurfaceStack<T>() {
  const [stack, setStack] = useState<T[]>([]);

  const open = useCallback((surface: T) => {
    setStack((current) => [...current, surface]);
  }, []);

  const replace = useCallback((surface: T) => {
    setStack((current) => current.length ? [...current.slice(0, -1), surface] : [surface]);
  }, []);

  const back = useCallback(() => {
    setStack((current) => current.slice(0, -1));
  }, []);

  const closeAll = useCallback(() => {
    setStack([]);
  }, []);

  return {
    current: stack.at(-1) ?? null,
    depth: stack.length,
    stack,
    open,
    replace,
    back,
    closeAll,
  } as const;
}
