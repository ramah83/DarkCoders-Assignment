import { GATEWAY_BASE_URL, MAX_AUDIO_BYTES, TRANSCRIBE_MODEL, getGatewayHeaders } from "./gateway.server";

/**
 * Calls the Groq (OpenAI-compatible) audio transcription endpoint and returns the transcript text.
 *
 * Groq's /v1/audio/transcriptions responds with plain JSON { "text": "..." } — it does NOT stream.
 * This function returns the transcript string directly; the route layer wraps it in SSE for the client.
 */
export async function transcribe(file: File, signal?: AbortSignal): Promise<string> {
  if (!file.size || file.size > MAX_AUDIO_BYTES) throw new Error("Invalid audio file size");
  if (!file.type.startsWith("audio/")) throw new Error(`Unexpected media MIME type: ${file.type}`);

  const form = new FormData();
  form.append("model", TRANSCRIBE_MODEL);
  form.append("file", file, file.name);
  form.append("response_format", "json");
  // Note: do NOT append "stream":"true" — Groq transcription does not support streaming.
  // Sending it causes no error but the response is still plain JSON, not SSE.

  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE_URL}/v1/audio/transcriptions`, {
      method: "POST",
      headers: getGatewayHeaders(),
      body: form,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new Error("Could not reach the speech transcription service. Check your network or API configuration.");
  }

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json() as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`; } catch { detail = `HTTP ${res.status}`; }
    console.warn("[transcribe] Upstream transcription error:", res.status, detail);
    if (res.status === 401 || res.status === 403) throw new Error("Transcription API key is invalid or missing.");
    if (res.status === 413) throw new Error("The recording is too large for the transcription service.");
    if (res.status === 415 || res.status === 400) throw new Error("The transcription service could not process this recording format.");
    throw new Error(`The transcription service returned an error (${res.status}).`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("The transcription service returned an unreadable response.");
  }

  const text = (typeof data === "object" && data && "text" in data && typeof (data as Record<string, unknown>)["text"] === "string")
    ? ((data as Record<string, unknown>)["text"] as string).trim()
    : "";

  if (!text) throw new Error("The transcription service returned no text. The recording may be silent or too short.");

  return text;
}
