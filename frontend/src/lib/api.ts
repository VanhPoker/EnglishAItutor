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
  return fallback || "Yêu cầu thất bại";
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

export interface ReviewError {
  error_type: string;
  original: string;
  correction: string;
  explanation: string | null;
  count: number;
}

export interface ReviewDrill {
  id: string;
  error_type: string;
  instruction: string;
  prompt: string;
  target: string;
  hint: string | null;
}

export interface SessionReviewResponse {
  session: SessionResponse;
  stats_json: Record<string, unknown> | null;
  top_errors: ReviewError[];
  drills: ReviewDrill[];
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

export async function getLatestSessionReview(): Promise<SessionReviewResponse> {
  return apiFetch<SessionReviewResponse>(`${API_BASE}/sessions/latest-review`);
}

export async function getSessionReview(sessionId: string): Promise<SessionReviewResponse> {
  return apiFetch<SessionReviewResponse>(`${API_BASE}/sessions/${sessionId}/review`);
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

// ── Quiz API ────────────────────────────────────────────────────

export type QuizQuestionType = "multiple_choice" | "fill_blank";

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  options: string[];
  explanation: string;
  focus: string;
}

export interface QuizResponse {
  id: string;
  title: string;
  topic: string;
  level: string;
  source: string;
  description: string | null;
  question_count: number;
  questions: QuizQuestion[];
  created_at: string;
}

export interface QuizListItem {
  id: string;
  title: string;
  topic: string;
  level: string;
  source: string;
  question_count: number;
  created_at: string;
  latest_score: number | null;
}

export interface QuizGenerateRequest {
  title?: string;
  topic: string;
  level: string;
  question_count: number;
  source: "topic" | "mistakes";
  focus?: string;
}

export interface QuizCreateRequest {
  title: string;
  topic: string;
  level: string;
  source: "manual";
  description?: string;
  questions: Array<QuizQuestion & { correct_answer: string }>;
}

export interface QuizImportItem {
  title: string;
  topic: string;
  level: string;
  description?: string;
  questions: Array<QuizQuestion & { correct_answer: string }>;
}

export interface QuizImportResponse {
  imported_count: number;
  question_count: number;
  quizzes: QuizListItem[];
}

export interface QuestionResult {
  question_id: string;
  prompt: string;
  focus: string;
  user_answer: string;
  correct_answer: string;
  is_correct: boolean;
  explanation: string;
}

export interface QuizReview {
  summary: string;
  strengths: string[];
  improvement_areas: string[];
  next_steps: string[];
}

export interface QuizAttemptResponse {
  id: string;
  quiz_id: string;
  quiz_title: string;
  score: number;
  correct_count: number;
  total_questions: number;
  results: QuestionResult[];
  ai_review: QuizReview;
  created_at: string;
}

export async function getQuizzes(): Promise<QuizListItem[]> {
  return apiFetch<QuizListItem[]>(`${API_BASE}/quizzes`);
}

export async function getQuiz(quizId: string): Promise<QuizResponse> {
  return apiFetch<QuizResponse>(`${API_BASE}/quizzes/${quizId}`);
}

export async function createQuiz(data: QuizCreateRequest): Promise<QuizResponse> {
  return apiFetch<QuizResponse>(`${API_BASE}/quizzes`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function generateQuiz(data: QuizGenerateRequest): Promise<QuizResponse> {
  return apiFetch<QuizResponse>(`${API_BASE}/quizzes/generate`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function importQuizzes(quizzes: QuizImportItem[]): Promise<QuizImportResponse> {
  return apiFetch<QuizImportResponse>(`${API_BASE}/quizzes/import`, {
    method: "POST",
    body: JSON.stringify({ quizzes }),
  });
}

export async function submitQuiz(
  quizId: string,
  answers: Record<string, string>
): Promise<QuizAttemptResponse> {
  return apiFetch<QuizAttemptResponse>(`${API_BASE}/quizzes/${quizId}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

export async function getQuizAttempt(attemptId: string): Promise<QuizAttemptResponse> {
  return apiFetch<QuizAttemptResponse>(`${API_BASE}/quizzes/attempts/${attemptId}`);
}

// ── Admin API ───────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  native_language: string;
  cefr_level: string;
  role: AuthUser["role"];
  created_at: string;
  updated_at: string;
  session_count: number;
  total_minutes: number;
  last_session_at: string | null;
}

export interface AdminUsersResponse {
  total: number;
  users: AdminUser[];
}

export interface AdminBootstrapStatus {
  admin_exists: boolean;
}

export async function getAdminUsers(params: {
  search?: string;
  role?: AuthUser["role"] | "all";
  limit?: number;
  offset?: number;
} = {}): Promise<AdminUsersResponse> {
  const qs = new URLSearchParams();
  if (params.search?.trim()) qs.set("search", params.search.trim());
  if (params.role && params.role !== "all") qs.set("role", params.role);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));

  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<AdminUsersResponse>(`${API_BASE}/admin/users${suffix}`);
}

export async function updateAdminUser(
  userId: string,
  data: Partial<Pick<AdminUser, "name" | "native_language" | "cefr_level" | "role">>
): Promise<AdminUser> {
  return apiFetch<AdminUser>(`${API_BASE}/admin/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function getAdminBootstrapStatus(): Promise<AdminBootstrapStatus> {
  return apiFetch<AdminBootstrapStatus>(`${API_BASE}/admin/bootstrap-status`);
}

export async function claimAdminAccess(): Promise<AuthUser> {
  return apiFetch<AuthUser>(`${API_BASE}/admin/bootstrap`, {
    method: "POST",
    body: JSON.stringify({}),
  });
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
