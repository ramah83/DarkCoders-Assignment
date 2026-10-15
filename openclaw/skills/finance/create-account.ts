import { sandboxRepository, type SandboxResult } from "../../shared/sandbox-db.js";

export interface CreateAccountData {
  id: string;
  customerId: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
}
export function createAccount(
  customerName: string,
  accountName: string,
  accountType: "checking" | "savings",
  initialBalance = 0,
  currency = "EGP"
): SandboxResult<CreateAccountData> {
  if (!customerName?.trim() || !accountName?.trim()) {
    return { ok: false, error: { code: "MISSING_INPUT" } };
  }

  return sandboxRepository.createAccount(
    customerName.trim(),
    accountName.trim(),
    accountType,
    initialBalance,
    currency
  );
}
