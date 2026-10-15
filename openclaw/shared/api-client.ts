export interface ApiResult<T = unknown> {
  ok: true;
  data: T;
  source: string;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    status?: number;
  };
}

export type ApiResponse<T = unknown> = ApiResult<T> | ApiError;
const FINANCIAL_BASE = (process.env["FINANCIAL_API_BASE_URL"] ?? "https://simulator.alkhwarizmi.xyz").replace(/\/$/, "");
const FINANCIAL_USER = process.env["FINANCIAL_API_USERNAME"] ?? "";
const FINANCIAL_PASS = process.env["FINANCIAL_API_PASSWORD"] ?? "";

const SUPPORT_BASE = (process.env["SUPPORT_API_BASE_URL"] ?? "https://orchestrator.alkhwarizmi.chat").replace(/\/$/, "");
const SUPPORT_USER = process.env["SUPPORT_API_USERNAME"] ?? "";
const SUPPORT_PASS = process.env["SUPPORT_API_PASSWORD"] ?? "";

const TIMEOUT_MS = 10_000;

async function post<T>(
  base: string,
  path: string,
  body: Record<string, unknown>,
  source: string,
  auth?: { username: string; password: string },
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth?.username) {
    headers["Authorization"] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`;
  }

  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    let json: unknown;
    let rawText: string | undefined;
    try {
      
      const clone = res.clone();
      try {
        json = await res.json();
      } catch {
        try { rawText = (await clone.text()).slice(0, 200); } catch {  }
        console.warn("[api-client] Non-JSON response from", source, "path:", path, "status:", res.status, "body-preview:", rawText ?? "(empty)");
        return { ok: false, error: { code: "MALFORMED_RESPONSE", message: "الخدمة أرجعت رداً غير متوقع. حاول مرة أخرى بعد قليل.", status: res.status } };
      }
    } catch {
      return { ok: false, error: { code: "MALFORMED_RESPONSE", message: "الخدمة أرجعت رداً غير متوقع. حاول مرة أخرى بعد قليل.", status: res.status } };
    }

    if (!res.ok) {
      const msg = (typeof json === "object" && json && "message" in json)
        ? String((json as Record<string, unknown>)["message"])
        : `HTTP ${res.status}`;
      console.warn("[api-client] Upstream error from", source, "path:", path, "status:", res.status, "code:", (json as Record<string, unknown>)?.["code"]);
      return { ok: false, error: { code: "UPSTREAM_ERROR", message: msg, status: res.status } };
    }

    return { ok: true, data: json as T, source };
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: { code: "UPSTREAM_TIMEOUT", message: "The service timed out. Please try again." } };
    }
    return { ok: false, error: { code: "NETWORK_ERROR", message: "Could not reach the service. Check your connection." } };
  }
}
async function get<T>(
  base: string,
  path: string,
  source: string,
  auth?: { username: string; password: string },
): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth?.username) {
    headers["Authorization"] = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`;
  }

  try {
    const res = await fetch(`${base}${path}`, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timer);
    let json: unknown;
    try {
      const clone = res.clone();
      try {
        json = await res.json();
      } catch {
        let rawText: string | undefined;
        try { rawText = (await clone.text()).slice(0, 200); } catch {  }
        console.warn("[api-client] Non-JSON GET response from", source, "path:", path, "status:", res.status, "body-preview:", rawText ?? "(empty)");
        return { ok: false, error: { code: "MALFORMED_RESPONSE", message: "الخدمة أرجعت رداً غير متوقع. حاول مرة أخرى بعد قليل.", status: res.status } };
      }
    } catch {
      return { ok: false, error: { code: "MALFORMED_RESPONSE", message: "الخدمة أرجعت رداً غير متوقع. حاول مرة أخرى بعد قليل.", status: res.status } };
    }
    if (!res.ok) {
      const msg = (typeof json === "object" && json && "message" in json) ? String((json as Record<string, unknown>)["message"]) : `HTTP ${res.status}`;
      console.warn("[api-client] Upstream GET error from", source, "path:", path, "status:", res.status);
      return { ok: false, error: { code: "UPSTREAM_ERROR", message: msg, status: res.status } };
    }
    return { ok: true, data: json as T, source };
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: { code: "UPSTREAM_TIMEOUT", message: "The service timed out. Please try again." } };
    }
    return { ok: false, error: { code: "NETWORK_ERROR", message: "Could not reach the service. Check your connection." } };
  }
}

export function financialPost<T>(path: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
  const auth = FINANCIAL_USER ? { username: FINANCIAL_USER, password: FINANCIAL_PASS } : undefined;
  return post<T>(FINANCIAL_BASE, path, body, "financial_api", auth);
}

export function supportGet<T>(path: string): Promise<ApiResponse<T>> {
  const auth = SUPPORT_USER ? { username: SUPPORT_USER, password: SUPPORT_PASS } : undefined;
  return get<T>(SUPPORT_BASE, path, "support_api", auth);
}

export function supportPost<T>(path: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
  const auth = SUPPORT_USER ? { username: SUPPORT_USER, password: SUPPORT_PASS } : undefined;
  return post<T>(SUPPORT_BASE, path, body, "support_api", auth);
}
