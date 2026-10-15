import { createFileRoute } from "@tanstack/react-router";
import { OUTPUT_FORMAT, SYSTEM_PROMPT, planContextMessage } from "@/lib/voice/prompt";

type Turn = { role: "user" | "assistant"; text: string };


const FINANCIAL_AGENT_IDS = new Set(["financial-support", "openclaw/financial-support"]);

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let turns: Turn[] = [];
        let context: string | undefined;
        let modelName: string | undefined;
        let agentId: string | undefined;
        let approvedAction: { tool: string; arguments: Record<string, unknown> } | undefined;

        try {
          const body = (await request.json()) as {
            turns?: Turn[];
            context?: unknown;
            model?: unknown;
            agent?: unknown;
            approvedAction?: unknown;
          };
          if (Array.isArray(body.turns)) turns = body.turns.filter((t) => t && typeof t.text === "string");
          if (typeof body.context === "string") context = body.context;
          if (typeof body.model === "string") modelName = body.model;
          if (typeof body.agent === "string") agentId = body.agent;
          if (body.approvedAction && typeof body.approvedAction === "object") {
            const a = body.approvedAction as Record<string, unknown>;
            if (typeof a["tool"] === "string") {
              approvedAction = { tool: a["tool"], arguments: typeof a["arguments"] === "object" && a["arguments"] ? a["arguments"] as Record<string, unknown> : {} };
            }
          }
        } catch {
          turns = [];
        }

        if (!turns.length && !approvedAction) {
          return new Response(JSON.stringify({ error: "Nothing to answer" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        
        if (agentId && FINANCIAL_AGENT_IDS.has(agentId)) {
          let resultJson: string;
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            async start(controller) {
              try {
                
                const emitStep = (step: string) => {
                  const payload = `data: ${JSON.stringify({ type: "response.reasoning_summary_text.delta", delta: step + "\n" })}\n\n`;
                  controller.enqueue(encoder.encode(payload));
                };

                const { runFinancialAgent } = await import("../../../openclaw/agents/financial-support/agent.js");
                
                
                if (approvedAction) {
                  emitStep(`✓ Executing ${approvedAction.tool}`);
                  emitStep("Processing approved action...");
                } else {
                  emitStep("Understanding request...");
                }
                
                const result = await runFinancialAgent(
                  turns,
                  approvedAction as Parameters<typeof runFinancialAgent>[1],
                  emitStep, 
                );
                
                
                if (result.screen.text.startsWith("عذراً") || result.screen.text.startsWith("حدث خطأ") || result.screen.text.includes("لم أتمكن")) {
                  console.info("[api/agent] financial-support returned error screen:", result.screen.text.slice(0, 120));
                }
                
                resultJson = JSON.stringify(result);
                
                
                const outputPayload = `data: ${JSON.stringify({ type: "response.output_text.delta", delta: resultJson })}\n\ndata: ${JSON.stringify({ type: "response.output_text.done", text: resultJson })}\n\n`;
                controller.enqueue(encoder.encode(outputPayload));
                controller.close();
              } catch (err) {
                const msg = err instanceof Error ? err.message : "Unknown error in Financial Support Agent";
                console.error("[api/agent] financial-support threw:", msg);
                const errorJson = JSON.stringify({
                  kind: "screen",
                  screen: { text: "حدث خطأ غير متوقع. حاول مرة أخرى.", choices: [{ id: "retry", label: "Try again", value: "Please try again" }], navigation: ["cancel"] },
                  action_proposal: null,
                  app_commands: [],
                });
                const errorPayload = `data: ${JSON.stringify({ type: "response.output_text.delta", delta: errorJson })}\n\ndata: ${JSON.stringify({ type: "response.output_text.done", text: errorJson })}\n\n`;
                controller.enqueue(encoder.encode(errorPayload));
                controller.close();
              }
            },
          });

          return new Response(stream, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          });
        }

        
        const { streamResponses } = await import("@/lib/ai/responses.server");
        const { resolveGatewayModel } = await import("@/lib/ai/models");
        const model = resolveGatewayModel(modelName);
        if (!model) {
          return new Response(JSON.stringify({ error: `${modelName} isn't offered by the built-in AI service` }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const plan = planContextMessage(context);
        const input: Record<string, unknown>[] = [
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          ...(plan ? [{ role: "system", content: [{ type: "input_text", text: plan }] }] : []),
          ...turns.slice(-12).map((turn) => ({
            role: turn.role,
            content: [
              turn.role === "assistant"
                ? { type: "output_text", text: turn.text }
                : { type: "input_text", text: turn.text },
            ],
          })),
        ];

        return streamResponses(request, input, { text: { format: OUTPUT_FORMAT } }, model);
      },
    },
  },
});
