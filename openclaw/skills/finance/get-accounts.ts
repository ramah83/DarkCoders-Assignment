import { sandboxRepository, type SandboxResult } from "../../shared/sandbox-db.js";

export interface AccountListData {
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    currency: string;
    status: string;
  }>;
}

export function getAccounts(): SandboxResult<AccountListData> {
  const result = sandboxRepository.getAccounts();
  if (!result.ok) return result;

  return {
    ok: true,
    data: {
      accounts: result.data.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        status: a.status,
      })),
    },
  };
}
