"use client";

import { CircleAlert, CircleCheck, Info, Loader2, TriangleAlert } from "lucide-react";
import { Toaster, toast } from "sonner";
import type { CSSProperties } from "react";

/**
 * The system had no toasts at all: every outcome was an inline paragraph in a
 * different place on every screen, and half of them were silently overwritten
 * by the next action. One host, one voice.
 */
export function ToastHost() {
  return (
    <Toaster
      className="no-print"
      duration={4200}
      icons={{
        error: <CircleAlert size={16} />,
        info: <Info size={16} />,
        loading: <Loader2 className="toast-spin" size={16} />,
        success: <CircleCheck size={16} />,
        warning: <TriangleAlert size={16} />,
      }}
      position="bottom-right"
      style={
        {
          "--border-radius": "6px",
          "--normal-bg": "#ffffff",
          "--normal-border": "#c9d0c6",
          "--normal-text": "#152420",
        } as CSSProperties
      }
      toastOptions={{ classNames: { toast: "app-toast" } }}
    />
  );
}

/**
 * Outcome messages use the same verb as the button that caused them:
 * “儲存報價單” → “報價單已儲存”.
 */
export const notify = {
  error(message: string, description?: string) {
    toast.error(message, { description });
  },
  info(message: string, description?: string) {
    toast.info(message, { description });
  },
  success(message: string, description?: string) {
    toast.success(message, { description });
  },
  /** For an outcome the user should act on next. */
  successWithAction(message: string, action: { label: string; onClick: () => void }, description?: string) {
    toast.success(message, { action, description, duration: 8000 });
  },
  warning(message: string, description?: string) {
    toast.warning(message, { description });
  },
};
