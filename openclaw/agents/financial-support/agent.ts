import { FINANCIAL_AGENT_SYSTEM_PROMPT } from "./prompt.js";
import { FINANCIAL_TOOLS, type ToolName } from "./tools.js";
import { getAccountBalance } from "../../skills/finance/get-account-balance.js";
import { getAccounts } from "../../skills/finance/get-accounts.js";
import { listCards } from "../../skills/finance/list-cards.js";
import { getCardStatus } from "../../skills/finance/get-card-status.js";
import { stopCard } from "../../skills/finance/stop-card.js";
import { createAccount } from "../../skills/finance/create-account.js";
import { deposit } from "../../skills/finance/deposit.js";
import { submitComplaint } from "../../skills/support/submit-complaint.js";
import { followComplaint } from "../../skills/support/follow-complaint.js";
import { isLiveChatAvailable } from "../../skills/support/is-live-chat-available.js";
import type { SandboxResult } from "../../shared/sandbox-db.js";
export interface AgentTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ScreenChoice {
  id: string;
  label: string;
  value: string;
}

export interface ActionProposal {
  id: string;
  title: string;
  tool: string;
  summary: string;
  risk?: "low" | "medium" | "high";
}

export interface AgentScreen {
  text: string;
  choices: ScreenChoice[];
  navigation: Array<"back" | "cancel" | "home">;
}

export interface AgentResponse {
  kind: "screen";
  screen: AgentScreen;
  action_proposal: ActionProposal | null;
  app_commands: Array<{ name: string; value: string }>;
}

const STATE_CHANGING_TOOLS = new Set<ToolName>([
  "finance.stop_card",
  "support.submit_complaint",
  "finance.create_account",
  "finance.deposit",
]);

function executeTool(toolName: ToolName, args: Record<string, unknown>): SandboxResult<unknown> {
  switch (toolName) {
    case "finance.get_accounts":
      return getAccounts();

    case "finance.get_account_balance":
      return getAccountBalance(
        typeof args["accountId"] === "string" ? args["accountId"] : undefined,
      );

    case "finance.list_cards":
      return listCards();

    case "finance.get_card_status":
      return getCardStatus(String(args["cardId"] ?? ""));

    case "finance.stop_card":
      return stopCard(
        String(args["cardId"] ?? ""),
        typeof args["reason"] === "string" ? args["reason"] : undefined,
      );

    case "finance.create_account":
      return createAccount(
        String(args["customerName"] ?? ""),
        String(args["accountName"] ?? ""),
        (args["accountType"] as "checking" | "savings") ?? "checking",
        typeof args["initialBalance"] === "number" ? args["initialBalance"] : 0,
        typeof args["currency"] === "string" ? args["currency"] : "EGP",
      );

    case "finance.deposit":
      return deposit(
        String(args["accountId"] ?? ""),
        typeof args["amount"] === "number" ? args["amount"] : 0,
      );

    case "support.follow_complaint":
      return followComplaint(String(args["complaintId"] ?? ""));

    case "support.is_live_chat_available":
      return isLiveChatAvailable();

    case "support.submit_complaint":
      return submitComplaint(
        String(args["title"] ?? ""),
        String(args["description"] ?? ""),
      );

    default:
      return { ok: false, error: { code: "MISSING_INPUT" } };
  }
}

function humanizeError(code: string, toolName: ToolName): string {
  switch (code) {
    case "CARD_NOT_FOUND":
      return "ملقتش البطاقة المطلوبة.";
    case "CARD_ALREADY_STOPPED":
      return "البطاقة موقوفة بالفعل.";
    case "ACCOUNT_NOT_FOUND":
      return "ملقتش الحساب المطلوب.";
    case "COMPLAINT_NOT_FOUND":
      return "ملقتش شكوى بالرقم ده.";
    case "MISSING_INPUT":
      return "بعض المعلومات المطلوبة ناقصة. من فضلك أكمل البيانات.";
    case "DATABASE_ERROR":
      return "حصلت مشكلة تقنية. حاول مرة أخرى.";
    default:
      if (toolName === "finance.get_account_balance") return "عذراً، لم أتمكن من الاستعلام عن الرصيد حالياً.";
      if (toolName === "support.follow_complaint") return "عذراً، لم أتمكن من متابعة الشكوى حالياً.";
      return "حدث خطأ أثناء تنفيذ الطلب. حاول مرة أخرى.";
  }
}

type LLMMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> }
  | { role: "tool"; tool_call_id: string; content: string };

const MODEL_PROVIDER = process.env["MODEL_PROVIDER"] ?? "openai";
const MODEL_NAME = process.env["MODEL_NAME"] ?? "gpt-4o-mini";
const MODEL_API_KEY = process.env["MODEL_API_KEY"] ?? "";

async function callLLM(messages: LLMMessage[], withTools = true): Promise<{
  content?: string;
  tool_call?: { id: string; name: ToolName; arguments: Record<string, unknown> };
}> {
  if (!MODEL_API_KEY) throw new Error("MODEL_API_KEY is not configured in the server environment.");

  let baseUrl = "https://api.openai.com/v1";
  if (MODEL_PROVIDER === "groq") baseUrl = "https://api.groq.com/openai/v1";

  const body: Record<string, unknown> = { model: MODEL_NAME, messages, temperature: 0.2 };
  if (withTools) {
    body["tools"] = FINANCIAL_TOOLS.map((t) => ({ type: "function", function: t }));
    body["tool_choice"] = "auto";
  }
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${MODEL_API_KEY}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      
      if (res.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000; 
        console.warn(`[financial-agent] Rate limited (429). Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue; 
      }

      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        throw new Error(`LLM returned ${res.status}: ${detail}`);
      }

      const data = await res.json() as {
        choices: Array<{
          finish_reason?: string;
          message: {
            content?: string | null;
            tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
          };
        }>;
      };

      const msg = data.choices[0]?.message;
      if (!msg) throw new Error("LLM returned an empty response.");

      const finishReason = data.choices[0]?.finish_reason;
      if (finishReason && finishReason !== "stop" && finishReason !== "tool_calls") {
        console.warn("[financial-agent] Unexpected finish_reason:", finishReason, "model:", MODEL_NAME);
      }

      if (msg.tool_calls?.length) {
        const tc = msg.tool_calls[0]!;
        let parsedArgs: Record<string, unknown> = {};
        try { parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>; } catch {
          console.warn("[financial-agent] Failed to parse tool_call arguments for:", tc.function.name);
        }
        return { tool_call: { id: tc.id, name: tc.function.name as ToolName, arguments: parsedArgs } };
      }

      return { content: msg.content ?? "" };
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));
      
      
      if (!lastError.message.includes("429") && attempt < maxRetries - 1) {
        console.error("[financial-agent] LLM call failed:", lastError.message);
        throw lastError;
      }
      
      
    }
  }

  throw lastError || new Error("LLM call failed after retries");
}

function errorScreen(message: string): AgentResponse {
  return {
    kind: "screen",
    screen: { text: message, choices: [{ id: "retry", label: "حاول مرة أخرى", value: "حاول مرة أخرى" }], navigation: ["cancel"] },
    action_proposal: null,
    app_commands: [],
  };
}

function normalizeAgentResponse(content: string): AgentResponse {
  const stripped = content.trim();
  
  
  if (stripped.includes("<tool_call>") || stripped.includes("<function=") || stripped.includes("</function>")) {
    console.warn("[financial-agent] Detected leaked tool markup in response:", stripped.slice(0, 150));
    return errorScreen("حدث خطأ في معالجة الرد. من فضلك حاول مرة أخرى.");
  }
  
  
  if (stripped.includes('"kind": "screen"') || stripped.includes('"screen": {')) {
    console.warn("[financial-agent] Detected leaked JSON structure in response - model returned JSON as text");
    return errorScreen("حدث خطأ في معالجة الرد. من فضلك حاول مرة أخرى.");
  }
  
  const unfenced = stripped.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: unknown = null;
  try { parsed = JSON.parse(unfenced); } catch {  }

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;

    if (obj["screen"] && typeof obj["screen"] === "object") {
      const screen = obj["screen"] as Record<string, unknown>;
      const text = typeof screen["text"] === "string" ? screen["text"].trim() : "";
      if (text) {
        return {
          kind: "screen",
          screen: {
            text,
            choices: Array.isArray(screen["choices"]) ? (screen["choices"] as AgentResponse["screen"]["choices"]) : [],
            navigation: Array.isArray(screen["navigation"]) ? (screen["navigation"] as AgentResponse["screen"]["navigation"]) : [],
          },
          action_proposal: (obj["action_proposal"] ?? null) as AgentResponse["action_proposal"],
          app_commands: Array.isArray(obj["app_commands"]) ? (obj["app_commands"] as AgentResponse["app_commands"]) : [],
        };
      }
    }

    if (typeof obj["text"] === "string" && obj["text"].trim()) {
      return {
        kind: "screen",
        screen: { text: obj["text"].trim(), choices: [], navigation: [] },
        action_proposal: null,
        app_commands: [],
      };
    }
  }

  if (!stripped.startsWith("{") && !stripped.startsWith("[")) {
    return {
      kind: "screen",
      screen: { text: stripped, choices: [], navigation: [] },
      action_proposal: null,
      app_commands: [],
    };
  }

  if (stripped.startsWith("{") || stripped.startsWith("[")) {
    console.warn("[financial-agent] normalizeAgentResponse: malformed JSON:", stripped.slice(0, 120));
    return errorScreen("حدث خطأ في معالجة الرد. من فضلك حاول مرة أخرى.");
  }

  return {
    kind: "screen",
    screen: { text: stripped || "حدث خطأ. من فضلك حاول مرة أخرى.", choices: [], navigation: [] },
    action_proposal: null,
    app_commands: [],
  };
}

export async function runFinancialAgent(
  turns: AgentTurn[],
  approvedAction?: { tool: ToolName; arguments: Record<string, unknown> },
  emitStep?: (step: string) => void,
): Promise<AgentResponse> {

  
  if (approvedAction) {
    emitStep?.(`🔧 Executing ${approvedAction.tool}...`);
    const toolResult = executeTool(approvedAction.tool, approvedAction.arguments);

    if (!toolResult.ok) {
      emitStep?.("❌ Tool execution failed");
      const humanMsg = humanizeError(toolResult.error.code, approvedAction.tool);
      console.warn("[financial-agent] Approved action failed:", { tool: approvedAction.tool, code: toolResult.error.code });
      return errorScreen(humanMsg);
    }

    emitStep?.("✓ Tool executed successfully");
  
    
    const data = toolResult.data as Record<string, unknown>;
    
    if (approvedAction.tool === "finance.stop_card") {
      emitStep?.("🔍 Verifying card status...");
      const verified = data["verified"] === true;
      const last4 = String(data["last4"] ?? "");
      emitStep?.(verified ? "✓ Card status verified" : "⚠️ Verification incomplete");
      const text = verified
        ? `تم إيقاف البطاقة المنتهية بـ ${last4} والتأكد من حالتها بنجاح.`
        : `تم إرسال طلب الإيقاف، لكن لم أتمكن من تأكيد الحالة النهائية للبطاقة المنتهية بـ ${last4}.`;
      return { kind: "screen", screen: { text, choices: [], navigation: ["home"] }, action_proposal: null, app_commands: [] };
    }
    
    if (approvedAction.tool === "support.submit_complaint") {
      const id = String(data["complaintId"] ?? "");
      return {
        kind: "screen",
        screen: { text: `تم تسجيل الشكوى برقم ${id}. يمكنك متابعتها بنفس الرقم.`, choices: [], navigation: ["home"] },
        action_proposal: null,
        app_commands: [],
      };
    }
    
    if (approvedAction.tool === "finance.create_account") {
      const accountId = String(data["id"] ?? "");
      const accountName = String(data["name"] ?? "");
      const balance = typeof data["balance"] === "number" ? data["balance"] : 0;
      const currency = String(data["currency"] ?? "EGP");
      const typeRaw = String(data["type"] ?? "checking");
      const typeAr = typeRaw === "checking" ? "جاري" : "توفير";
      return {
        kind: "screen",
        screen: { 
          text: `تم فتح حساب ${typeAr} بنجاح. رقم الحساب: ${accountId}، الاسم: "${accountName}"، الرصيد الافتتاحي: ${balance} ${currency}.`, 
          choices: [], 
          navigation: ["home"] 
        },
        action_proposal: null,
        app_commands: [],
      };
    }
    
    if (approvedAction.tool === "finance.deposit") {
      const accountId = String(data["accountId"] ?? "");
      const newBalance = typeof data["newBalance"] === "number" ? data["newBalance"] : 0;
      const currency = String(data["currency"] ?? "EGP");
      const depositedAmount = typeof data["amount"] === "number" ? data["amount"] : 0;
      return {
        kind: "screen",
        screen: { 
          text: `تم إيداع ${depositedAmount} ${currency} في الحساب ${accountId}. الرصيد الجديد: ${newBalance.toFixed(2)} ${currency}.`, 
          choices: [], 
          navigation: ["home"] 
        },
        action_proposal: null,
        app_commands: [],
      };
    }
    
    
    return { kind: "screen", screen: { text: "تم تنفيذ الطلب بنجاح.", choices: [], navigation: ["home"] }, action_proposal: null, app_commands: [] };
  }

  

  
  const lastUserTurn = turns.filter((t) => t.role === "user").pop();
  if (lastUserTurn) {
    const text = lastUserTurn.text.trim().toLowerCase();
    const greetingKeywords = [
      "مرحبا", "هلا", "السلام", "أهلا", "هاي", "الخدمات", "الخدمات المتاحة", "ساعدني", "إيه اللي تقدر تعمله",
      "hello", "hi", "hey", "services", "help", "what can you do", "وش الخدمات", "شو الخدمات", "ايش الخدمات", "ايه الخدمات",
    ];
    
    const isGreeting = greetingKeywords.some((kw) => text.includes(kw));
    
    if (isGreeting) {
      
      return {
        kind: "screen",
        screen: {
          text: "أهلاً! اختر الخدمة اللي محتاجها:",
          choices: [
            { id: "balance", label: "استعلام عن الرصيد", value: "عايز أعرف رصيدي" },
            { id: "cards", label: "عرض البطاقات", value: "اعرض بطاقاتي" },
            { id: "complaint", label: "تقديم شكوى", value: "عايز أقدم شكوى" },
            { id: "track_complaint", label: "متابعة شكوى", value: "عايز أتابع شكوى" },
          ],
          navigation: ["home"],
        },
        action_proposal: null,
        app_commands: [],
      };
    }
  }
  
  if (lastUserTurn) {
    const text = lastUserTurn.text.trim().toLowerCase();
    const explainKeywords = [
      "كيف عرفت", "عرفت إزاي", "جبت منين", "من أين", "من فين",
      "how did you know", "where did you get", "how do you know",
    ];
    
    const isExplainQuestion = explainKeywords.some((kw) => text.includes(kw));
    if (isExplainQuestion) {
      return {
        kind: "screen",
        screen: {
          text: "استدعيت قاعدة البيانات بتاعتنا وجبت البيانات الحالية. كل معلومة تشوفها دلوقتي من النظام مباشرة.",
          choices: [],
          navigation: ["home"],
        },
        action_proposal: null,
        app_commands: [],
      };
    }
  }

  const baseMessages: LLMMessage[] = [
    { role: "system", content: FINANCIAL_AGENT_SYSTEM_PROMPT },
    ...turns.slice(-12).map((t): LLMMessage => ({ role: t.role as "user" | "assistant", content: t.text })),
  ];

  emitStep?.("Analyzing request...");
  let llmResult: Awaited<ReturnType<typeof callLLM>>;
  try {
    llmResult = await callLLM(baseMessages, true);
    emitStep?.("✓ Request understood");
  } catch (err) {
    emitStep?.("Analysis failed");
    const msg = err instanceof Error ? err.message : "Unknown LLM error";
    console.error("[financial-agent] Initial LLM call failed:", msg);
    return errorScreen("عذراً، لم أتمكن من الوصول إلى خدمة الذكاء الاصطناعي. حاول مرة أخرى بعد قليل.");
  }

  
  if (llmResult.tool_call) {
    const { id: toolCallId, name: toolName, arguments: toolArgs } = llmResult.tool_call;

    emitStep?.(`Tool requested: ${toolName}`);

    
    if (STATE_CHANGING_TOOLS.has(toolName)) {
      emitStep?.("Preparing action proposal...");
      const isStopCard = toolName === "finance.stop_card";
      const isCreateAccount = toolName === "finance.create_account";
      const isDeposit = toolName === "finance.deposit";
      const isComplaint = toolName === "support.submit_complaint";

      const cardId = typeof toolArgs["cardId"] === "string" ? toolArgs["cardId"] : "";
      const reason = typeof toolArgs["reason"] === "string" ? toolArgs["reason"] : "";
      const title = typeof toolArgs["title"] === "string" ? toolArgs["title"] : "";
      const description = typeof toolArgs["description"] === "string" ? toolArgs["description"] : "";
      const customerName = typeof toolArgs["customerName"] === "string" ? toolArgs["customerName"] : "";
      const accountName = typeof toolArgs["accountName"] === "string" ? toolArgs["accountName"] : "";
      const accountType = typeof toolArgs["accountType"] === "string" ? toolArgs["accountType"] : "checking";
      const initialBalance = typeof toolArgs["initialBalance"] === "number" ? toolArgs["initialBalance"] : 0;
      const accountId = typeof toolArgs["accountId"] === "string" ? toolArgs["accountId"] : "";
      const amount = typeof toolArgs["amount"] === "number" ? toolArgs["amount"] : 0;

      
      let last4 = "";
      if (isStopCard && cardId) {
        const cardCheck = getCardStatus(cardId);
        if (cardCheck.ok) last4 = cardCheck.data.last4;
      }

      const proposalId = `${toolName}_${Date.now()}`;
      let proposalTitle = "";
      let summary = "";
      let proposalText = "";
      let risk: "low" | "medium" | "high" = "medium";

      if (isStopCard) {
        proposalTitle = `Stop card${last4 ? ` ending in ${last4}` : ""}`;
        summary = `Stops the card${last4 ? ` ending in ${last4}` : ""}.${reason ? ` Reason: ${reason}.` : ""}`;
        proposalText = `جهزت طلب إيقاف البطاقة${last4 ? ` المنتهية بـ ${last4}` : ""} ومحتاج موافقتك قبل التنفيذ.`;
        risk = "high";
      } else if (isCreateAccount) {
        const typeArabic = accountType === "checking" ? "جاري" : "توفير";
        proposalTitle = `Create ${accountType} account for ${customerName}`;
        summary = `Creates a new ${accountType} account "${accountName}" for customer "${customerName}". Initial balance: ${initialBalance} EGP.`;
        proposalText = `جهزت طلب فتح حساب ${typeArabic} باسم "${accountName}" للعميل "${customerName}". الرصيد الافتتاحي: ${initialBalance} جنيه. محتاج موافقتك قبل الإنشاء.`;
        risk = "high";
      } else if (isDeposit) {
        proposalTitle = `Deposit ${amount} EGP to ${accountId}`;
        summary = `Deposits ${amount} EGP into account ${accountId}.`;
        proposalText = `جهزت طلب إيداع ${amount} جنيه في الحساب ${accountId}. محتاج موافقتك قبل التنفيذ.`;
        risk = "medium";
      } else if (isComplaint) {
        proposalTitle = "Submit complaint";
        summary = `Submits a complaint: "${title.slice(0, 80)}". ${description.slice(0, 120)}`;
        proposalText = "جهزت الشكوى ومحتاج موافقتك قبل التقديم.";
        risk = "medium";
      } else {
        proposalTitle = "Execute action";
        summary = `Tool: ${toolName}`;
        proposalText = "محتاج موافقتك قبل التنفيذ.";
      }

      emitStep?.("⏸Waiting for approval...");

      return {
        kind: "screen",
        screen: {
          text: proposalText,
          choices: [],
          navigation: ["cancel"],
        },
        action_proposal: {
          id: proposalId,
          title: proposalTitle,
          tool: toolName,
          summary,
          risk,
        },
        app_commands: [],
      };
    }

    
    emitStep?.(`✓ Executing read-only tool: ${toolName}`);
    const toolResult = executeTool(toolName, toolArgs);

    if (!toolResult.ok) {
      emitStep?.("Tool execution failed");
      return errorScreen(humanizeError(toolResult.error.code, toolName));
    }

    emitStep?.("✓ Tool executed successfully");
    emitStep?.("Formatting response...");

    
    
    const data = toolResult.data as Record<string, unknown>;
    let responseText = "جاهز، إيه اللي تحتاجه؟";
    const responseChoices: ScreenChoice[] = [];
    
    if (toolName === "finance.get_accounts") {
      const accounts = (data["accounts"] ?? []) as Array<Record<string, unknown>>;
      if (accounts.length === 0) {
        responseText = "ملقتش حسابات مسجلة.";
      } else if (accounts.length === 1) {
        const acc = accounts[0]!;
        const name = String(acc["name"] ?? "");
        const type = String(acc["type"] ?? "");
        const typeAr = type === "checking" ? "جاري" : type === "savings" ? "توفير" : type;
        responseText = `عندك حساب واحد: ${name} (${typeAr}).`;
      } else {
        const list = accounts.map((a) => {
          const name = String(a["name"] ?? "");
          const type = String(a["type"] ?? "");
          const typeAr = type === "checking" ? "جاري" : type === "savings" ? "توفير" : type;
          return `${name} (${typeAr})`;
        }).join("، ");
        responseText = `عندك ${accounts.length} حساب: ${list}.`;
      }
      responseChoices.push({ id: "menu", label: "خدمات أخرى", value: "الخدمات" });
    } else if (toolName === "finance.list_cards") {
      const cards = (data["cards"] ?? []) as Array<Record<string, unknown>>;
      if (cards.length === 0) {
        responseText = "ملقتش بطاقات مسجلة.";
      } else {
        const list = cards.map((c) => {
          const last4 = String(c["last4"] ?? "");
          const status = String(c["status"] ?? "");
          const statusAr = status === "active" ? "نشطة" : status === "stopped" ? "موقوفة" : status;
          return `${last4} (${statusAr})`;
        }).join("، ");
        responseText = `عندك ${cards.length} بطاقة: ${list}.`;
        
        
        const activeCards = cards.filter((c) => String(c["status"] ?? "") === "active").slice(0, 3);
        activeCards.forEach((c) => {
          const last4 = String(c["last4"] ?? "");
          const id = String(c["id"] ?? "");
          responseChoices.push({ id: `stop_${id}`, label: `إيقاف ${last4}`, value: `عايز أوقف بطاقة ${last4}` });
        });
      }
      responseChoices.push({ id: "menu", label: "خدمات أخرى", value: "الخدمات" });
    } else if (toolName === "finance.get_account_balance") {
      const balance = data["balance"];
      if (typeof balance === "number") {
        const currency = String(data["currency"] ?? "EGP");
        const accountName = String(data["accountName"] ?? "");
        responseText = accountName 
          ? `رصيد ${accountName}: ${balance.toFixed(2)} ${currency}.`
          : `الرصيد: ${balance.toFixed(2)} ${currency}.`;
      } else {
        responseText = "ملقتش معلومات الرصيد.";
      }
      responseChoices.push({ id: "menu", label: "خدمات أخرى", value: "الخدمات" });
    } else if (toolName === "finance.get_card_status") {
      const status = String(data["status"] ?? "unknown");
      const last4 = String(data["last4"] ?? "");
      const statusAr = status === "active" ? "نشطة" : status === "stopped" ? "موقوفة" : status;
      responseText = last4 
        ? `البطاقة المنتهية بـ ${last4} حالتها: ${statusAr}.`
        : `حالة البطاقة: ${statusAr}.`;
      responseChoices.push({ id: "menu", label: "خدمات أخرى", value: "الخدمات" });
    } else if (toolName === "support.is_live_chat_available") {
      const available = data["available"] === true;
      responseText = available ? "الدعم المباشر متاح دلوقتي." : "الدعم المباشر مش متاح حالياً.";
      responseChoices.push({ id: "menu", label: "خدمات أخرى", value: "الخدمات" });
    } else if (toolName === "support.follow_complaint") {
      const status = String(data["status"] ?? "");
      const id = String(data["complaintId"] ?? "");
      const statusAr = status === "open" ? "مفتوحة" : status === "in_progress" ? "قيد المعالجة" : status === "resolved" ? "تم حلها" : status;
      responseText = id ? `الشكوى ${id} حالتها: ${statusAr}.` : "ملقتش الشكوى.";
      responseChoices.push({ id: "menu", label: "خدمات أخرى", value: "الخدمات" });
    }

    return {
      kind: "screen",
      screen: { text: responseText, choices: responseChoices, navigation: ["home"] },
      action_proposal: null,
      app_commands: [],
    };
  }

  
  if (llmResult.content) {
    return normalizeAgentResponse(llmResult.content);
  }

  return errorScreen("حدث خطأ غير متوقع. حاول مرة أخرى.");
}
