import { sandboxRepository, type SandboxResult } from "../../shared/sandbox-db.js";

export interface DepositData {
  accountId: string;
  amount: number;
  newBalance: number;
  currency: string;
}


export function deposit(accountId: string, amount: number): SandboxResult<DepositData> {
  if (!accountId?.trim() || amount <= 0) {
    return { ok: false, error: { code: "MISSING_INPUT" } };
  }

  return sandboxRepository.deposit(accountId.trim(), amount);
}
