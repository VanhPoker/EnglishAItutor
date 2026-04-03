const API_BASE = "/api";

export interface TokenRequest {
  userId: string;
  userName: string;
  topic?: string;
  level?: string;
}

export interface TokenResponse {
  token: string;
  roomName: string;
}

export async function getToken(req: TokenRequest): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.statusText}`);
  return res.json();
}

export async function getDevToken(): Promise<TokenResponse> {
  const res = await fetch(`${API_BASE}/token`);
  if (!res.ok) throw new Error(`Dev token request failed: ${res.statusText}`);
  return res.json();
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch("/health");
    return res.ok;
  } catch {
    return false;
  }
}
