import { sandboxRepository, type SandboxResult } from "../../shared/sandbox-db.js";

export interface CardStatusData {
  cardId: string;
  last4: string;
  status: "active" | "stopped";
}

export function getCardStatus(cardId: string): SandboxResult<CardStatusData> {
  if (!cardId?.trim()) {
    return { ok: false, error: { code: "MISSING_INPUT" } };
  }
  const result = sandboxRepository.getCardStatus(cardId.trim());
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      cardId: result.data.id,
      last4: result.data.last4,
      status: result.data.status,
    },
  };
}
