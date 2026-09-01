"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * List state lives in the URL, not in component state.
 *
 * That is what makes a refresh keep the page you were on, makes browser
 * back/forward step through pages and filters, and makes a link like
 * `/receipts?status=pending` from the dashboard land already filtered.
 *
 * The search box is the one exception: it keeps a local draft so typing stays
 * responsive, and pushes to the URL on a short debounce.
 */
export function useListQuery({
  basePath,
  filterDefaults,
}: {
  basePath: string;
  /** Filter name → the value that means "no filter", omitted from the URL. */
  filterDefaults: Record<string, string>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const keyword = searchParams.get("q") ?? "";
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const filterNames = useMemo(() => Object.keys(filterDefaults), [filterDefaults]);
  const filterSignature = filterNames.map((name) => `${name}=${searchParams.get(name) ?? filterDefaults[name]}`).join("&");
  const filters = useMemo(
    () => Object.fromEntries(filterNames.map((name) => [name, searchParams.get(name) ?? filterDefaults[name]])),
    // filterSignature captures the values these params resolve to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterNames, filterSignature],
  );

  const [draftKeyword, setDraftKeyword] = useState(keyword);
  // Remembers the last keyword this hook wrote, so a keyword arriving from
  // back/forward is recognised as external and copied into the draft.
  const pushed = useRef(keyword);

  const write = useCallback(
    (patch: Record<string, string | number | null>, mode: "push" | "replace") => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        const isDefault = value === null || value === "" || value === filterDefaults[key] || (key === "page" && value === 1);
        if (isDefault) next.delete(key);
        else next.set(key, String(value));
      }
      const query = next.toString();
      const url = query ? `${basePath}?${query}` : basePath;
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [basePath, filterDefaults, router, searchParams],
  );

  useEffect(() => {
    if (keyword === pushed.current) return;
    const timer = window.setTimeout(() => {
      pushed.current = keyword;
      setDraftKeyword(keyword);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    if (draftKeyword === keyword) return;
    const timer = window.setTimeout(() => {
      pushed.current = draftKeyword;
      // A new search always restarts at page 1; replace keeps each keystroke
      // out of the history stack.
      write({ page: 1, q: draftKeyword }, "replace");
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draftKeyword, keyword, write]);

  const setFilter = useCallback(
    (name: string, value: string) => {
      // Changing a filter restarts at page 1, otherwise you can land on an
      // empty page 4 of a two-page result.
      write({ [name]: value, page: 1 }, "push");
    },
    [write],
  );

  const setPage = useCallback((next: number) => write({ page: next }, "push"), [write]);

  const clear = useCallback(() => {
    const timer = window.setTimeout(() => {
      pushed.current = "";
      setDraftKeyword("");
    }, 0);
    write({ page: 1, q: null, ...Object.fromEntries(filterNames.map((name) => [name, null])) }, "push");
    return () => window.clearTimeout(timer);
  }, [filterNames, write]);

  const isFiltered = Boolean(keyword) || filterNames.some((name) => filters[name] !== filterDefaults[name]);

  /** Query string for the API call, including page and the active filters. */
  const apiQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (keyword) params.set("q", keyword);
    for (const name of filterNames) {
      if (filters[name] !== filterDefaults[name]) params.set(name, filters[name]);
    }
    if (page > 1) params.set("page", String(page));
    return params.toString();
  }, [filterDefaults, filterNames, filters, keyword, page]);

  return { apiQuery, clear, draftKeyword, filters, isFiltered, keyword, page, setDraftKeyword, setFilter, setPage };
}
