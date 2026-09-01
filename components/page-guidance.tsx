import type { ReactNode } from "react";

/** Small, contextual guidance for pages that do not need a full onboarding flow. */
export function FirstUseGuide({
  title = "第一次使用？",
  steps,
}: {
  title?: string;
  steps: string[];
}) {
  return (
    <aside className="first-use-guide" aria-label={title}>
      <p className="eyebrow">快速開始</p>
      <h3>{title}</h3>
      <ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol>
    </aside>
  );
}

export function FieldHelp({ children }: { children: ReactNode }) {
  return <p className="field-hint">{children}</p>;
}
