"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

import { useOptionalConfirm } from "@/components/app/confirm";

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

/**
 * The single place that decides whether leaving is allowed.
 *
 * Every internal navigation goes through this — sidebar, drawer, logo,
 * breadcrumb, ButtonLink, row links, related-document links and the editors'
 * own Cancel button — so the question is asked once, in one wording, instead of
 * being re-implemented per component.
 */
export function useGuardedNavigation() {
  const guard = useDirtyGuard();
  const confirm = useOptionalConfirm();
  const router = useRouter();

  /** Resolves true when it is safe to discard the current input. */
  const confirmDiscard = useCallback(async () => {
    if (!guard?.isDirty()) return true;
    // Without a ConfirmProvider there is no way to ask, so block the navigation
    // rather than silently dropping the user's input.
    if (!confirm) return false;
    const leave = await confirm({
      confirmLabel: "離開並放棄變更",
      consequence: "這一頁有尚未儲存的內容。離開後這些輸入不會保留，已經儲存過的資料不受影響。",
      danger: true,
      title: "要放棄未儲存的變更嗎？",
    });
    if (leave) guard.markClean();
    return leave;
  }, [confirm, guard]);

  /** Navigates only if the guard allows it. Returns whether it navigated. */
  const guardedNavigate = useCallback(
    async (href: string, options?: { replace?: boolean }) => {
      if (!(await confirmDiscard())) return false;
      if (options?.replace) router.replace(href);
      else router.push(href);
      return true;
    },
    [confirmDiscard, router],
  );

  return { confirmDiscard, guardedNavigate, isDirty: () => Boolean(guard?.isDirty()) };
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
