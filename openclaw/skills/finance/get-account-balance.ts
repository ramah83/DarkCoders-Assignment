 import { sandboxRepository, type SandboxResult } from "../../shared/sandbox-db.js";

export interface AccountBalanceData {
  accountId: string;
  name: string;
  balance: number;
  currency: string;
}

export interface AccountChoicesData {
  needsChoice: true;
  accounts: Array<{ id: string; name: string; currency: string }>;
}

export function getAccountBalance(accountId?: string): SandboxResult<AccountBalanceData | AccountChoicesData> {
  const accountsResult = sandboxRepository.getAccounts();
  if (!accountsResult.ok) return accountsResult;

  const activeAccounts = accountsResult.data.filter((a) => a.status === "active");

   
  if (!accountId?.trim()) {
    if (activeAccounts.length === 1) {
      const acct = activeAccounts[0]!;
      return {
        ok: true,
        data: {
          accountId: acct.id,
          name: acct.name,
          balance: acct.balance,
          currency: acct.currency,
        },
      };
    }
     
    return {
      ok: true,
      data: {
        needsChoice: true,
        accounts: activeAccounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
      },
    };
  }
  const balanceResult = sandboxRepository.getBalance(accountId.trim());
  if (!balanceResult.ok) return balanceResult;
  return {
    ok: true,
    data: {
      accountId: balanceResult.data.id,
      name: balanceResult.data.name,
      balance: balanceResult.data.balance,
      currency: balanceResult.data.currency,
    },
  };
}
