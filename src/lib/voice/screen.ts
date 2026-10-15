export type Choice = { id: string; label: string; value: string };
export type Nav = "back" | "cancel" | "home";
export const COMMAND_NAMES = ["set_view", "show_tab", "set_agent", "set_speaking_rate", "open_settings", "close_settings", "standby", "set_accent", "set_style", "open_headset"] as const;
export type Command = { name: (typeof COMMAND_NAMES)[number]; value: string };
export type ActionProposal = {
  id: string;
  title: string;
  tool: string;
  summary: string;
  risk?: "low" | "medium" | "high";
};
export type Screen = {
  text: string;
  choices: Choice[];
  navigation: Nav[];
  commands?: Command[];
  actionProposal?: ActionProposal | null;
};

const NAV_VALUES: Nav[] = ["back", "cancel", "home"];

function parseActionProposal(raw: unknown): ActionProposal | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return undefined;
  const p = raw as Record<string, unknown>;
  const id = typeof p["id"] === "string" && p["id"].trim() ? p["id"].trim().slice(0, 64) : "";
  const title = typeof p["title"] === "string" && p["title"].trim() ? p["title"].trim().slice(0, 120) : "";
  const tool = typeof p["tool"] === "string" && p["tool"].trim() ? p["tool"].trim().slice(0, 80) : "";
  const summary = typeof p["summary"] === "string" && p["summary"].trim() ? p["summary"].trim().slice(0, 500) : "";
  if (!id || !title || !tool || !summary) return undefined;
  const risk = p["risk"] === "low" || p["risk"] === "medium" || p["risk"] === "high" ? p["risk"] : undefined;
  return { id, title, tool, summary, ...(risk ? { risk } : {}) };
}

/** Validates planner output against the blueprint rules; returns null if invalid. */
export function parseScreen(raw: string): Screen | null {
  try {
    const data = JSON.parse(raw) as {
      kind?: unknown;
      screen?: { text?: unknown; choices?: unknown; navigation?: unknown };
      text?: unknown;
      choices?: unknown;
      navigation?: unknown;
      action_proposal?: unknown;
      app_commands?: unknown[];
    };

    
    const screenObj = data.screen ?? (typeof data.text === "string" ? (data as unknown as typeof data.screen) : undefined);
    if (!screenObj) return null;

    const proposal = parseActionProposal(data.action_proposal);

    
    const hasValidKind = data.kind === "screen" || data.kind === "action_proposal";
    const hasScreenWithText = typeof screenObj.text === "string" && screenObj.text.trim().length > 0;
    if (!hasValidKind && !hasScreenWithText) return null;
    if (proposal === undefined) return null;

    const text = typeof screenObj.text === "string" ? screenObj.text.trim() : "";
    if (!text) return null;

    const seen = new Set<string>();
    let choiceIdx = 0;
    const choices = (Array.isArray(screenObj.choices) ? screenObj.choices : [])
      .filter((c): c is Choice => {
        if (!c || typeof c !== "object") return false;
        
        if (typeof c.id !== "string" || !c.id.trim()) c.id = `choice_${choiceIdx++}`;
        return (
          typeof c.id === "string" && /^[a-z][a-z0-9_]{0,31}$/.test(c.id) &&
          typeof c.label === "string" && c.label.length > 0 && c.label.length <= 40 &&
          typeof c.value === "string" && c.value.length > 0 && c.value.length <= 1000
        );
      })
      .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));

    
    const rawNav = Array.isArray(screenObj.navigation) ? screenObj.navigation : [];
    const normalizedNav = rawNav.map((n: unknown) => {
      if (typeof n === "string") return n;
      if (typeof n === "object" && n && "value" in n && typeof (n as Record<string, unknown>)["value"] === "string") return (n as Record<string, unknown>)["value"] as string;
      return "";
    });
    const navigation = [...new Set(normalizedNav as Nav[])].filter((n) => NAV_VALUES.includes(n));

    
    const trimmedChoices = choices.slice(0, Math.max(0, 4 - navigation.length));
    const commands = (Array.isArray((data as { app_commands?: unknown }).app_commands) ? (data as { app_commands: unknown[] }).app_commands : [])
      .filter((c): c is Command => Boolean(c) && typeof c === "object" && COMMAND_NAMES.includes((c as Command).name) && typeof (c as Command).value === "string")
      .slice(0, 3);
    return { text, choices: trimmedChoices, navigation, commands, actionProposal: proposal };
  } catch {
    return null;
  }
}


export function partialText(raw: string): string {
  const body = raw.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)/)?.[1];
  if (!body) return "";
  try {
    return JSON.parse(`"${body.replace(/\\$/, "")}"`) as string;
  } catch {
    return body;
  }
}

export const NAV_LABEL: Record<Nav, string> = { back: "Back", cancel: "Cancel", home: "Home" };

export function spokenScreen(screen: Screen): string {
  const options = [...screen.choices.map((c) => c.label), ...screen.navigation.map((n) => NAV_LABEL[n])];
  if (!options.length) return screen.text;
  return `${screen.text} ${options.map((label, i) => `${i + 1}, ${label}.`).join(" ")}`;
}

/** Blueprint: local page budget, measured in UTF-16 units (Telegram max is 4096 characters). */
export const PAGE_BUDGET = 3500;

/** Splits text into pages at paragraph, sentence, or word breaks, never mid code point. Nothing is dropped. */
export function paginate(text: string, budget = PAGE_BUDGET): string[] {
  const pages: string[] = [];
  let rest = text.trim();
  while (rest.length > budget) {
    const window = rest.slice(0, budget);
    let cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"));
    if (cut < budget * 0.5) cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! ")) + 1;
    if (cut < budget * 0.5) cut = window.lastIndexOf(" ");
    if (cut <= 0) {
      cut = budget;
      const code = rest.charCodeAt(cut - 1);
      if (code >= 0xd800 && code <= 0xdbff) cut -= 1; // keep surrogate pairs together
    }
    pages.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pages.push(rest);
  return pages.length ? pages : [""];
}
