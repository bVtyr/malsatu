/** Тонкий API-клиент: токен из localStorage, единый формат ошибок, таймауты для слабой связи. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? API_URL.replace(/^http/, "ws");

export class ApiError extends Error { constructor(public status: number, public code: string, public details?: unknown) { super(code); } }

export function getToken(): string | null { try { return typeof window !== "undefined" ? localStorage.getItem("malsatu_token") : null; } catch { return null; } }
export function setToken(t: string | null) { try { t ? localStorage.setItem("malsatu_token", t) : localStorage.removeItem("malsatu_token"); } catch { /* private mode */ } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; query?: Record<string, unknown>; token?: string | null; timeoutMs?: number; cache?: RequestCache; next?: { revalidate?: number } } = {}): Promise<T> {
  const url = new URL(`${API_URL}/api/v1${path}`);
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const token = opts.token === undefined ? getToken() : opts.token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: { ...(opts.body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined, signal: ctrl.signal, cache: opts.cache, ...(opts.next ? { next: opts.next } : {}),
    } as RequestInit);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? `http_${res.status}`, json?.error?.details);
    return json as T;
  } finally { clearTimeout(timer); }
}

export async function uploadMedia(file: File | Blob, filename = "photo.webp"): Promise<{ media: any; duplicateOf: string | null }> {
  const fd = new FormData(); fd.append("file", file, filename);
  const res = await fetch(`${API_URL}/api/v1/media/upload`, { method: "POST", headers: { authorization: `Bearer ${getToken()}` }, body: fd });
  const json = await res.json();
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? "upload_failed");
  return json;
}
