"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * One list renderer for every module. On a wide screen it is a table; below
 * 900px the same columns are re-composed into cards, because the old fixed-width
 * grids forced every list on a phone into horizontal scrolling.
 */
export type Column<Row> = {
  align?: "end";
  /** Where this column goes when the row becomes a card. */
  card?: "primary" | "meta" | "amount" | "status" | "hidden";
  cell: (row: Row) => ReactNode;
  header: string;
  key: string;
  width?: string;
};

export function DataTable<Row>({
  ariaLabel,
  columns,
  rowActions,
  rowHref,
  rows,
  rowKey,
}: {
  ariaLabel: string;
  columns: Array<Column<Row>>;
  /** Trailing actions: 查看 / 編輯 / 更多 ⋯ */
  rowActions?: (row: Row) => ReactNode;
  /** Makes the whole row open the record. */
  rowHref?: (row: Row) => string;
  rowKey: (row: Row) => string;
  rows: Row[];
}) {
  const primary = columns.find((column) => column.card === "primary") ?? columns[0];
  const status = columns.find((column) => column.card === "status");
  const amount = columns.find((column) => column.card === "amount");
  const meta = columns.filter((column) => column.card === "meta");

  return (
    <>
      <table aria-label={ariaLabel} className="dtable">
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={column.align === "end" ? "is-end" : undefined} key={column.key} style={{ width: column.width }}>
                {column.header}
              </th>
            ))}
            {rowActions ? <th className="is-end dtable-actions-head">操作</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr key={rowKey(row)}>
                {columns.map((column, index) => (
                  <td className={column.align === "end" ? "is-end" : undefined} key={column.key}>
                    {href && index === 0 ? (
                      <Link className="dtable-row-link" href={href}>
                        {column.cell(row)}
                      </Link>
                    ) : (
                      column.cell(row)
                    )}
                  </td>
                ))}
                {rowActions ? <td className="is-end dtable-actions">{rowActions(row)}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      <ul aria-label={ariaLabel} className="dcards">
        {rows.map((row) => {
          const href = rowHref?.(row);
          return (
            <li className="dcard" key={rowKey(row)}>
              <div className="dcard-top">
                <div className="dcard-primary">
                  {href ? <Link href={href}>{primary.cell(row)}</Link> : primary.cell(row)}
                </div>
                {status ? <div className="dcard-status">{status.cell(row)}</div> : null}
              </div>
              {amount ? (
                <p className="dcard-amount">
                  <span>{amount.header}</span>
                  <b>{amount.cell(row)}</b>
                </p>
              ) : null}
              {meta.length ? (
                <dl className="dcard-meta">
                  {meta.map((column) => (
                    <div key={column.key}>
                      <dt>{column.header}</dt>
                      <dd>{column.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {rowActions ? <div className="dcard-actions">{rowActions(row)}</div> : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Wraps a list so its header, body and footer share one card surface. */
export function ListCard({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="list-card">
      {children}
      {footer ? <footer className="list-card-foot">{footer}</footer> : null}
    </section>
  );
}
