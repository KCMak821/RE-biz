"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/app/button";
import { Modal } from "@/components/app/dialog";

export type ConfirmRequest = {
  /** Reads like the button that opened it: 「封存客戶」, not 「確定」. */
  confirmLabel: string;
  /** What actually happens afterwards, including what is *not* lost. */
  consequence: string;
  danger?: boolean;
  /** What the user is about to do. */
  title: string;
};

type Pending = ConfirmRequest & { resolve: (value: boolean) => void };

const ConfirmContext = createContext<((request: ConfirmRequest) => Promise<boolean>) | null>(null);

/**
 * Replaces every window.confirm in the app. The native dialog could not show a
 * consequence, could not distinguish a destructive action from a routine one,
 * and looked like it belonged to another product.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const confirm = useCallback((request: ConfirmRequest) => {
    return new Promise<boolean>((resolve) => {
      const next = { ...request, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    pendingRef.current?.resolve(value);
    pendingRef.current = null;
    setPending(null);
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        footer={
          <>
            <Button onClick={() => settle(false)} variant="ghost">
              取消
            </Button>
            <Button onClick={() => settle(true)} variant={pending?.danger ? "danger" : "primary"}>
              {pending?.confirmLabel ?? "確認"}
            </Button>
          </>
        }
        onClose={() => settle(false)}
        open={Boolean(pending)}
        title={pending?.title ?? ""}
      >
        <p className="confirm-consequence">{pending?.consequence}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm 必須在 ConfirmProvider 內使用。");
  return confirm;
}
