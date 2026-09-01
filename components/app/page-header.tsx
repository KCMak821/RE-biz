"use client";

import { useEffect, type ReactNode } from "react";

import { Breadcrumb, type Crumb } from "@/components/app/breadcrumb";
import { HowToUse, type HowTo } from "@/components/app/how-to-use";

/**
 * Every page opens the same way: where you are, what this page is, one primary
 * action, and help within reach. Consistency here is what lets someone learn
 * the second page from the first one.
 */
export function PageHeader({
  aside,
  crumbs,
  description,
  how,
  primaryAction,
  secondaryActions,
  status,
  title,
}: {
  /** Extra content under the description — e.g. a record summary. */
  aside?: ReactNode;
  crumbs?: Crumb[];
  description: ReactNode;
  how?: HowTo;
  /** Exactly one per page. */
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  status?: ReactNode;
  title: string;
}) {
  useEffect(() => {
    document.title = `${title}｜RE-Biz`;
  }, [title]);

  return (
    <header className="page-head no-print">
      {crumbs ? <Breadcrumb items={crumbs} /> : null}
      <div className="page-head-main">
        <div className="page-head-text">
          <div className="page-title-row">
            <h1 className="page-title">{title}</h1>
            {status}
          </div>
          <p className="page-desc">{description}</p>
          {how ? <HowToUse how={how} title={title} /> : null}
        </div>
        {primaryAction || secondaryActions ? (
          <div className="page-actions">
            {/* Wrapped so the primary can sit last on a wide screen and first on
                a phone, where a stacked column reads top to bottom. */}
            {secondaryActions ? <div className="page-actions-secondary">{secondaryActions}</div> : null}
            {primaryAction ? <div className="page-actions-primary">{primaryAction}</div> : null}
          </div>
        ) : null}
      </div>
      {aside}
    </header>
  );
}
