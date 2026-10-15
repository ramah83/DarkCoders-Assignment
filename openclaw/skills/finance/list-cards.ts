import { sandboxRepository, type SandboxResult } from "../../shared/sandbox-db.js";

export interface CardListData {
  cards: Array<{
    id: string;
    last4: string;
    type: string;
    status: string;
  }>;
}

export function listCards(): SandboxResult<CardListData> {
  const result = sandboxRepository.listCards();
  if (!result.ok) return result;

  return {
    ok: true,
    data: {
      cards: result.data.map((c) => ({
        id: c.id,
        last4: c.last4,
        type: c.type,
        status: c.status,
      })),
    },
  };
}
