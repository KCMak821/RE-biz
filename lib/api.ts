/**
 * One fetch helper for the whole client. Three near-identical copies used to
 * live in page.tsx, quotation-workspace.tsx and invoice-workspace.tsx, each
 * swallowing errors slightly differently — which is why the same failure showed
 * a different message depending on which screen you were on.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  /** The workspace or one of its features was switched off by a platform admin. */
  get isForbidden() {
    return this.status === 403;
  }

  get isUnauthenticated() {
    return this.status === 401;
  }

  get isConflict() {
    return this.status === 409;
  }
}

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      ...options,
      headers: options?.body instanceof FormData
        ? options.headers
        : { "content-type": "application/json", ...(options?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("連線失敗，請確認網路後再試一次。", 0);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.message === "string" ? data.message : "操作沒有完成，請稍後再試一次。";
    // An expired session must not leave the user staring at an error string —
    // except on the sign-in screen itself, where 401 means “wrong password”.
    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login")
    ) {
      window.location.href = "/login?reason=expired";
    }
    throw new ApiError(message, response.status);
  }
  return data as T;
}
