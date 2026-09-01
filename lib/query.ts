/**
 * Shared list-query helpers for the paginated endpoints.
 *
 * Every list used to answer with a hard `.limit(20)` / `.limit(100)` /
 * `.limit(200)` and no way to reach the rest of the data. These helpers give the
 * four list endpoints one consistent contract for `page` / `pageSize` / `q`.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };

/** Reads and clamps `page` / `pageSize`. Bad or missing values fall back to the defaults. */
export function readPageParams(searchParams: URLSearchParams, defaultPageSize: number = DEFAULT_PAGE_SIZE) {
  const requestedPage = Number(searchParams.get("page"));
  const requestedSize = Number(searchParams.get("pageSize"));
  const page = Number.isFinite(requestedPage) && requestedPage >= 1 ? Math.floor(requestedPage) : 1;
  const pageSize = Number.isFinite(requestedSize) && requestedSize >= 1
    ? Math.min(MAX_PAGE_SIZE, Math.floor(requestedSize))
    : defaultPageSize;
  return { page, pageSize };
}

/**
 * Resolves the page actually served. A `page` beyond the end is clamped to the
 * last page rather than returning an empty list, and the clamped value is
 * reported back so the client can correct its URL.
 */
export function resolvePage({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}): PageMeta & { skip: number } {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(Math.max(1, page), totalPages);
  return { page: effectivePage, pageSize, skip: (effectivePage - 1) * pageSize, total, totalPages };
}

/** Keyword from `?q=`, trimmed and length-capped. */
export function readKeyword(searchParams: URLSearchParams) {
  return searchParams.get("q")?.trim().slice(0, 100) ?? "";
}

/** Escapes a user keyword so it can be used inside a case-insensitive RegExp. */
export function escapedRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function keywordRegex(keyword: string) {
  return new RegExp(escapedRegex(keyword), "i");
}
