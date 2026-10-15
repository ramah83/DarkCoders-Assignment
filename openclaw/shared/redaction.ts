export function maskCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `****${digits.slice(-4)}`;
}

export function redactAuth(headers: Record<string, string>): Record<string, string> {
  const safe = { ...headers };
  if (safe["Authorization"]) safe["Authorization"] = "[REDACTED]";
  if (safe["authorization"]) safe["authorization"] = "[REDACTED]";
  return safe;
}

export function looksLikeSecret(key: string): boolean {
  const lower = key.toLowerCase();
  return ["password", "passwd", "token", "secret", "apikey", "api_key", "otp", "pin", "cvv"].some((k) => lower.includes(k));
}
