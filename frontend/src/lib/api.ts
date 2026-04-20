const API_BASE = "/api";

// ── Auth helpers ────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const stored = localStorage.getItem("auth-storage");
  if (stored) {
    try {
      const { state } = JSON.parse(stored);
      if (state?.token) return { Authorization: `Bearer ${state.token}` };
    } catch {
      localStorage.removeItem("auth-storage");
    }
  }
  return {};
}

async function apiFetch(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...opts.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || res.statusText);
  }
  return res.json();
}

// ── Auth API ────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    native_language: string;
    cefr_level: string;
  };
}

export async function register(data: {
  email: string;
  password: string;
  name: string;
  native_language?: string;
  cefr_level?: string;
}): Promise<AuthResponse> {
  return apiFetch(`${API_BASE}/auth/register`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return apiFetch(`${API_BASE}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe() {
  return apiFetch(`${API_BASE}/auth/me`);
}

// ── Token API ───────────────────────────────────────────────────

export interface TokenRequest {
  userId?: string;
  userName?: string;
  topic?: string;
  level?: string;
}

export interface TokenResponse {
  token: string;
  roomName: string;
}

export async function getToken(req: TokenRequest): Promise<TokenResponse> {
  return apiFetch(`${API_BASE}/token`, {
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
  return apiFetch(`${API_BASE}/sessions`, { method: "POST", body: JSON.stringify(data) });
}

export async function endSession(sessionId: string, data: Record<string, unknown>) {
  return apiFetch(`${API_BASE}/sessions/${sessionId}`, { method: "PUT", body: JSON.stringify(data) });
}

export async function getSessions(limit = 20): Promise<SessionResponse[]> {
  return apiFetch(`${API_BASE}/sessions?limit=${limit}`);
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
  return apiFetch(`${API_BASE}/dashboard`);
}

// ── Health ──────────────────────────────────────────────────────

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch("/health");
    return res.ok;
  } catch {
    return false;
  }
}
