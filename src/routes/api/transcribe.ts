import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { MAX_AUDIO_BYTES } = await import("@/lib/ai/gateway.server");
        const { transcribe } = await import("@/lib/ai/transcribe.server");

        const declared = Number(request.headers.get("content-length") ?? 0);
        if (declared && declared > MAX_AUDIO_BYTES) {
          return new Response(JSON.stringify({ error: "Recording is too long" }), {
            status: 413,
            headers: { "Content-Type": "application/json" },
          });
        }

        let file: File | null = null;
        try {
          const form = await request.formData();
          const value = form.get("file");
          if (value instanceof File) file = value;
        } catch {
          file = null;
        }
        if (!file || !file.size) {
          return new Response(JSON.stringify({ error: "No audio was captured. Please try recording again." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const text = await transcribe(file, request.signal);

          // Emit as SSE so the client's readSse / transcribeRecording can parse it.
          // The client listens for:
          //   { type: "transcript.text.delta", delta: "..." }
          //   { type: "transcript.text.done",  text: "..." }
          const ssePayload =
            `data: ${JSON.stringify({ type: "transcript.text.delta", delta: text })}\n\n` +
            `data: ${JSON.stringify({ type: "transcript.text.done", text })}\n\n`;

          return new Response(ssePayload, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
            },
          });
        } catch (error) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          const message = error instanceof Error ? error.message : "Transcription failed";
          console.warn("[api/transcribe] Error:", message);
          return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
