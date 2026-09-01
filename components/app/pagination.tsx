"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * One pager for every list. On a wide screen it shows numbered pages; below
 * 900px it collapses to 上一頁 / 第 n / m 頁 / 下一頁, because a row of page
 * numbers is unusable with a thumb.
 */
export function Pagination({
  disabled,
  onPageChange,
  page,
  totalPages,
}: {
  /** Locked while a page is being fetched so a page cannot be requested twice. */
  disabled?: boolean;
  onPageChange: (page: number) => void;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const go = (next: number) => {
    const target = Math.min(Math.max(1, next), totalPages);
    if (target !== page) onPageChange(target);
  };

  return (
    <nav aria-label="分頁" className="pager no-print">
      <button
        className="pager-step"
        disabled={disabled || page <= 1}
        onClick={() => go(page - 1)}
        type="button"
      >
        <ChevronLeft aria-hidden="true" size={15} />
        上一頁
      </button>

      <ol className="pager-pages">
        {pageWindow(page, totalPages).map((entry, index) =>
          entry === "gap" ? (
            <li aria-hidden="true" className="pager-gap" key={`gap-${index}`}>
              …
            </li>
          ) : (
            <li key={entry}>
              <button
                aria-current={entry === page ? "page" : undefined}
                aria-label={`第 ${entry} 頁`}
                className={entry === page ? "pager-page is-current" : "pager-page"}
                disabled={disabled}
                onClick={() => go(entry)}
                type="button"
              >
                {entry}
              </button>
            </li>
          ),
        )}
      </ol>

      <p className="pager-status">
        第 {page} / {totalPages} 頁
      </p>

      <button
        className="pager-step"
        disabled={disabled || page >= totalPages}
        onClick={() => go(page + 1)}
        type="button"
      >
        下一頁
        <ChevronRight aria-hidden="true" size={15} />
      </button>
    </nav>
  );
}

/** Up to seven slots: first, last, the current page and its neighbours. */
function pageWindow(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((value) => pages.add(value));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((value) => pages.add(value));

  const ordered = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((left, right) => left - right);
  const slots: Array<number | "gap"> = [];
  ordered.forEach((value, index) => {
    if (index > 0 && value - ordered[index - 1] > 1) slots.push("gap");
    slots.push(value);
  });
  return slots;
}
