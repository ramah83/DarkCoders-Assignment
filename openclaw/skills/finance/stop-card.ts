 import { sandboxRepository, type SandboxResult } from "../../shared/sandbox-db.js";
export interface StopCardData {
  cardId: string;
  last4: string;
  status: "stopped";
  changed: boolean;
   
  verified: boolean;
}

export function stopCard(cardId: string, reason?: string): SandboxResult<StopCardData> {
  if (!cardId?.trim()) {
    return { ok: false, error: { code: "MISSING_INPUT" } };
  }

  const stopResult = sandboxRepository.stopCard(cardId.trim(), reason);
  if (!stopResult.ok) return stopResult;
   
  const verifyResult = sandboxRepository.getCardStatus(cardId.trim());
  const verified = verifyResult.ok && verifyResult.data.status === "stopped";

  if (!verified) {
    console.warn("[stop-card] Read-after-write verification FAILED for cardId:", cardId);
  }

  return {
    ok: true,
    data: {
      cardId: stopResult.data.cardId,
      last4: stopResult.data.last4,
      status: "stopped",
      changed: stopResult.data.changed,
      verified,
    },
  };
}
