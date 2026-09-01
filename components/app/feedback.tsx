import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Lists used to render their empty state while still loading, so the first thing
 * a new user saw was “你還沒有任何資料” — which was simply untrue. Skeleton rows
 * say “loading” without lying about the contents.
 */
export function SkeletonRows({ label = "正在載入資料", rows = 5 }: { label?: string; rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="skeleton">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, index) => (
        <span className="skeleton-row" key={index} />
      ))}
    </div>
  );
}

export function SkeletonBlock({ height = 120 }: { height?: number }) {
  return <span aria-hidden="true" className="skeleton-block" style={{ height }} />;
}

/** A load failed. Says what broke and offers the retry, instead of a bare red line. */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="load-error" role="alert">
      <CircleAlert aria-hidden="true" size={18} />
      <div>
        <strong>資料載入失敗</strong>
        <p>{message}</p>
      </div>
      {onRetry ? (
        <button className="btn btn-secondary btn-sm" onClick={onRetry} type="button">
          再試一次
        </button>
      ) : null}
    </div>
  );
}

/** A short, calm banner for things the user should know before acting. */
export function Callout({
  children,
  title,
  tone = "info",
}: {
  children: ReactNode;
  title?: string;
  tone?: "info" | "warning" | "success";
}) {
  return (
    <aside className={`callout callout-${tone}`}>
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </aside>
  );
}
