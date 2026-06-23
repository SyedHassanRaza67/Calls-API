// Typed REST client for the calls-api backend.
// Replaces the Supabase client. Reads base URL from VITE_API_URL, stores the
// JWT in localStorage under "calls_api_token", and attaches it as a Bearer token.

const TOKEN_KEY = "calls_api_token";

const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore storage errors */
  }
}

export function clearToken() {
  setToken(null);
}

interface RequestOptions {
  // When true, do not attach the Authorization header (for public endpoints).
  skipAuth?: boolean;
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const token = getToken();
  if (token && !opts.skipAuth) headers["Authorization"] = `Bearer ${token}`;

  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(0, err instanceof Error ? err.message : "Network error");
  }

  // 401 → clear token so the app routes back to /auth.
  if (resp.status === 401) {
    clearToken();
  }

  let data: unknown = null;
  const text = await resp.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!resp.ok) {
    const message =
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : typeof data === "string" && data
          ? data
          : `Request failed (${resp.status})`) || `Request failed (${resp.status})`;
    throw new ApiError(resp.status, message, data);
  }

  return data as T;
}

export const api = {
  get: <T = unknown>(path: string, opts?: RequestOptions) => request<T>("GET", path, undefined, opts),
  post: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("POST", path, body, opts),
  put: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("PUT", path, body, opts),
  patch: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("PATCH", path, body, opts),
  del: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("DELETE", path, body, opts),

  getToken,
  setToken,
  clearToken,

  auth: {
    async signUp(email: string, password: string, fullName?: string) {
      const res = await request<{ token: string; user: { id: string; email: string } }>(
        "POST",
        "/api/auth/signup",
        { email, password, full_name: fullName || "" },
        { skipAuth: true }
      );
      if (res?.token) setToken(res.token);
      return res;
    },
    async signIn(email: string, password: string) {
      const res = await request<{ token: string; user: { id: string; email: string } }>(
        "POST",
        "/api/auth/signin",
        { email, password },
        { skipAuth: true }
      );
      if (res?.token) setToken(res.token);
      return res;
    },
    async signOut() {
      try {
        await request("POST", "/api/auth/signout");
      } catch {
        /* signout is stateless server-side; ignore failures */
      }
      clearToken();
    },
    me() {
      return request<MeResponse>("GET", "/api/auth/me");
    },
  },
};

export interface MeResponse {
  user: { id: string; email: string } | null;
  profile: Record<string, unknown> | null;
  roles: string[];
  isPaused: boolean;
  pausedReason: string | null;
  isGlobalPaused: boolean;
  globalPauseReason: string | null;
}

export default api;
