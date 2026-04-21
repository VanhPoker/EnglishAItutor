import { useAuthStore, type AuthUser } from "../stores/authStore";

const API_BASE = "/api";

let refreshPromise: Promise<AuthResponse | null> | null = null;

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function parseErrorMessage(body: any, fallback: string): string {
  if (typeof body?.detail === "string" && body.detail.trim()) {
    return body.detail;
  }
  if (Array.isArray(body?.detail) && body.detail.length > 0) {
    const first = body.detail[0];
    if (typeof first?.msg === "string") return first.msg;
    return String(first);
  }
  return fallback || "Request failed";
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseErrorMessage(body, res.statusText));
  }

  if (res.status === 204) {
    return null as T;
  }

  return res.json();
}

function shouldAttemptRefresh(url: string): boolean {
  return !url.includes("/auth/login") &&
    !url.includes("/auth/register") &&
    !url.includes("/auth/refresh");
}

async function apiFetch<T>(url: string, opts: RequestInit = {}, retryOnAuth = true): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...opts.headers,
    },
  });

  if (res.status === 401 && retryOnAuth && shouldAttemptRefresh(url)) {
    const refreshed = await refreshSession();
    if (refreshed?.token) {
      return apiFetch<T>(url, opts, false);
    }
  }

  return handleResponse<T>(res);
}

// ── Auth API ────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  expires_in: number;
  user: AuthUser;
}

export async function register(data: {
  email: string;
  password: string;
  name: string;
  native_language?: string;
  cefr_level?: string;
}): Promise<AuthResponse> {
  return apiFetch<AuthResponse>(`${API_BASE}/auth/register`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>(`${API_BASE}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function refreshSession(): Promise<AuthResponse | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      useAuthStore.getState().clearSession();
      return null;
    }

    const data = (await res.json()) as AuthResponse;
    useAuthStore.getState().setSession(data.token, data.user);
    return data;
  })()
    .catch(() => {
      useAuthStore.getState().clearSession();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export async function bootstrapAuth(): Promise<void> {
  const { token, setBootstrapped, clearSession } = useAuthStore.getState();

  if (token) {
    setBootstrapped(true);
    return;
  }

  try {
    await refreshSession();
  } catch {
    clearSession();
  } finally {
    setBootstrapped(true);
  }
}

export async function logoutRequest(): Promise<void> {
  try {
    await apiFetch(`${API_BASE}/auth/logout`, { method: "POST" }, false);
  } finally {
    useAuthStore.getState().clearSession();
  }
}

export async function getMe() {
  return apiFetch<AuthUser>(`${API_BASE}/auth/me`);
}

export async function updateMe(data: Partial<Pick<AuthUser, "name" | "native_language" | "cefr_level">>) {
  return apiFetch<AuthUser>(`${API_BASE}/auth/me`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ── Token API ───────────────────────────────────────────────────

export interface TokenRequest {
  topic?: string;
  level?: string;
}

export interface TokenResponse {
  token: string;
  roomName: string;
}

export async function getToken(req: TokenRequest): Promise<TokenResponse> {
  return apiFetch<TokenResponse>(`${API_BASE}/token`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ── Sessions API ────────────────────────────────────────────────

export interface SessionResponse {
  id: string;
  room_name: string;
  topic: string;
  level: string;
  total_turns: number;
  total_errors: number;
  corrections_given: number;
  duration_minutes: number;
  grammar_score: number | null;
  vocabulary_score: number | null;
  fluency_score: number | null;
  started_at: string;
  ended_at: string | null;
}

export async function createSession(data: { room_name: string; topic: string; level: string }) {
  return apiFetch<SessionResponse>(`${API_BASE}/sessions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function endSession(sessionId: string, data: Record<string, unknown>) {
  return apiFetch<SessionResponse>(`${API_BASE}/sessions/${sessionId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getSessions(limit = 20): Promise<SessionResponse[]> {
  return apiFetch<SessionResponse[]>(`${API_BASE}/sessions?limit=${limit}`);
}

// ── Dashboard API ───────────────────────────────────────────────

export interface DashboardStats {
  total_sessions: number;
  total_minutes: number;
  total_turns: number;
  total_errors: number;
  avg_grammar: number | null;
  avg_vocabulary: number | null;
  avg_fluency: number | null;
  streak_days: number;
  common_errors: { type: string; count: number }[];
  recent_sessions: SessionResponse[];
}

export async function getDashboard(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>(`${API_BASE}/dashboard`);
}

// ── Health ──────────────────────────────────────────────────────

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch("/health", { credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
}
