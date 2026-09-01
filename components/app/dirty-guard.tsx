"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

type Guard = {
  /** True while an editor holds unsaved input. */
  isDirty: () => boolean;
  markClean: () => void;
  markDirty: (dirty: boolean) => void;
};

const DirtyContext = createContext<Guard | null>(null);

/**
 * A half-filled quotation used to disappear without a word the moment you
 * clicked anything in the sidebar. The guard covers both exits: closing or
 * reloading the tab, and navigating away inside the app.
 */
export function DirtyGuardProvider({ children }: { children: ReactNode }) {
  const dirty = useRef(false);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const value = useMemo<Guard>(
    () => ({
      isDirty: () => dirty.current,
      markClean: () => {
        dirty.current = false;
      },
      markDirty: (next: boolean) => {
        dirty.current = next;
      },
    }),
    [],
  );

  return <DirtyContext.Provider value={value}>{children}</DirtyContext.Provider>;
}

export function useDirtyGuard() {
  return useContext(DirtyContext);
}

/** Editors call this with their own dirty flag; the guard is released on unmount. */
export function useUnsavedChanges(dirty: boolean) {
  const guard = useDirtyGuard();
  const mark = useCallback((next: boolean) => guard?.markDirty(next), [guard]);

  useEffect(() => {
    mark(dirty);
    return () => mark(false);
  }, [dirty, mark]);
}
