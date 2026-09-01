import type { ReactNode } from "react";

export function Card({
  action,
  children,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  description?: string;
  title?: string;
}) {
  return (
    <section className="card">
      {title ? (
        <header className="card-head">
          <div>
            <h2 className="card-title">{title}</h2>
            {description ? <p className="card-desc">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className="stats">{children}</div>;
}

export function Stat({
  hint,
  label,
  tone,
  value,
}: {
  hint?: string;
  label: string;
  tone?: "income" | "expense";
  value: ReactNode;
}) {
  return (
    <article className="stat">
      <span className="stat-label">{label}</span>
      <strong className={tone ? `stat-value is-${tone}` : "stat-value"}>{value}</strong>
      {hint ? <small className="stat-hint">{hint}</small> : null}
    </article>
  );
}

/**
 * The key facts of a record, above the document itself. Detail pages previously
 * buried the amount inside the printable table's footer.
 */
export function SummaryList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="summary">
      {items.map((item) => (
        <div className="summary-item" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Cross-links between a quote, its invoice and its receipt. */
export function RelatedDocuments({ children }: { children: ReactNode }) {
  return (
    <div className="related no-print">
      <span className="related-label">關聯文件</span>
      <div className="related-items">{children}</div>
    </div>
  );
}

/** One line telling the user what the sensible next move is. */
export function NextStep({ children }: { children: ReactNode }) {
  return (
    <p className="next-step no-print">
      <span>下一步</span>
      {children}
    </p>
  );
}
