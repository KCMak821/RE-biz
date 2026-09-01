"use client";

import { Search } from "lucide-react";
import { useId, type ReactNode } from "react";

/**
 * Search, filter, and — importantly — how much of the data you are actually
 * looking at. Several lists cap at 20 or 100 records server-side and never said so.
 */
export function ListToolbar({
  filters,
  onReset,
  onSearchChange,
  resultLabel,
  searchLabel = "搜尋",
  searchPlaceholder,
  searchValue,
  trailing,
}: {
  filters?: ReactNode;
  onReset?: () => void;
  onSearchChange?: (value: string) => void;
  /** e.g. 「12 筆，共 34 筆」 or 「最近 20 筆」 */
  resultLabel?: ReactNode;
  searchLabel?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  trailing?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="toolbar no-print">
      {onSearchChange ? (
        <div className="toolbar-search">
          <label className="sr-only" htmlFor={id}>
            {searchLabel}
          </label>
          <Search aria-hidden="true" size={15} />
          <input
            className="control"
            id={id}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            type="search"
            value={searchValue ?? ""}
          />
        </div>
      ) : null}
      {filters ? <div className="toolbar-filters">{filters}</div> : null}
      <div className="toolbar-meta">
        {resultLabel ? <span className="toolbar-count">{resultLabel}</span> : null}
        {onReset ? (
          <button className="toolbar-reset" onClick={onReset} type="button">
            清除條件
          </button>
        ) : null}
        {trailing}
      </div>
    </div>
  );
}

/** A compact labelled select for the filter row. */
export function ToolbarSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  const id = useId();
  return (
    <div className="toolbar-select">
      <label htmlFor={id}>{label}</label>
      <select className="control control-select" id={id} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
