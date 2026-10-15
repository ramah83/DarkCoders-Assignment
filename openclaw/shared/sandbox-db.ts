

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, "../../data/financial-sandbox.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initSchema(_db);
  return _db;
}
function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id          TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      name        TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'checking',
      currency    TEXT NOT NULL DEFAULT 'EGP',
      balance     REAL NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cards (
      id          TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      account_id  TEXT NOT NULL REFERENCES accounts(id),
      last4       TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'debit',
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id          TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      title       TEXT NOT NULL,
      description TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'submitted',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      tool       TEXT NOT NULL,
      record_id  TEXT,
      action     TEXT NOT NULL,
      detail     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  seedDemoData(db);
}
function seedDemoData(db: Database.Database): void {
  const existing = db.prepare("SELECT COUNT(*) as n FROM customers").get() as { n: number };
  if (existing.n > 0) return; 

  const seed = db.transaction(() => {
    db.prepare(
      "INSERT OR IGNORE INTO customers (id, name) VALUES (?, ?)"
    ).run("CUST-001", "Demo Customer");

    db.prepare(
      "INSERT OR IGNORE INTO accounts (id, customer_id, name, type, currency, balance, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("ACC-001", "CUST-001", "الحساب الجاري", "checking", "EGP", 12500.50, "active");

    db.prepare(
      "INSERT OR IGNORE INTO accounts (id, customer_id, name, type, currency, balance, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("ACC-002", "CUST-001", "حساب التوفير", "savings", "EGP", 54200.00, "active");

    db.prepare(
      "INSERT OR IGNORE INTO cards (id, customer_id, account_id, last4, type, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("CARD-001", "CUST-001", "ACC-001", "4821", "debit", "active");

    db.prepare(
      "INSERT OR IGNORE INTO cards (id, customer_id, account_id, last4, type, status) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("CARD-002", "CUST-001", "ACC-001", "7734", "debit", "active");
  });

  seed();
  console.info("[sandbox-db] Demo data seeded: CUST-001, ACC-001, ACC-002, CARD-001 (4821), CARD-002 (7734)");
}

export interface SandboxAccount {
  id: string;
  customerId: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
  status: string;
}

export interface SandboxCard {
  id: string;
  customerId: string;
  accountId: string;
  last4: string;
  type: string;
  status: "active" | "stopped";
}

export interface SandboxComplaint {
  id: string;
  customerId: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
}

export type SandboxError =
  | { code: "ACCOUNT_NOT_FOUND" }
  | { code: "CARD_NOT_FOUND" }
  | { code: "CARD_ALREADY_STOPPED" }
  | { code: "COMPLAINT_NOT_FOUND" }
  | { code: "DATABASE_ERROR"; detail?: string }
  | { code: "MISSING_INPUT" };

export type SandboxResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: SandboxError };

export const DEMO_CUSTOMER_ID = "CUST-001";

export const sandboxRepository = {
  

  getAccounts(customerId = DEMO_CUSTOMER_ID): SandboxResult<SandboxAccount[]> {
    try {
      const db = getDb();
      const rows = db
        .prepare("SELECT * FROM accounts WHERE customer_id = ? AND status != 'closed' ORDER BY id")
        .all(customerId) as Array<Record<string, unknown>>;
      return {
        ok: true,
        data: rows.map((r) => ({
          id: String(r["id"]),
          customerId: String(r["customer_id"]),
          name: String(r["name"]),
          type: String(r["type"]),
          currency: String(r["currency"]),
          balance: Number(r["balance"]),
          status: String(r["status"]),
        })),
      };
    } catch (err) {
      console.error("[sandbox-db] getAccounts error:", err);
      return { ok: false, error: { code: "DATABASE_ERROR", detail: "getAccounts failed" } };
    }
  },

  getBalance(accountId: string, customerId = DEMO_CUSTOMER_ID): SandboxResult<Pick<SandboxAccount, "id" | "name" | "balance" | "currency">> {
    try {
      const db = getDb();
      const row = db
        .prepare("SELECT * FROM accounts WHERE id = ? AND customer_id = ? AND status = 'active'")
        .get(accountId, customerId) as Record<string, unknown> | undefined;
      if (!row) return { ok: false, error: { code: "ACCOUNT_NOT_FOUND" } };
      return {
        ok: true,
        data: {
          id: String(row["id"]),
          name: String(row["name"]),
          balance: Number(row["balance"]),
          currency: String(row["currency"]),
        },
      };
    } catch (err) {
      console.error("[sandbox-db] getBalance error:", err);
      return { ok: false, error: { code: "DATABASE_ERROR", detail: "getBalance failed" } };
    }
  },

  
  createAccount(
    customerName: string,
    accountName: string,
    accountType: "checking" | "savings",
    initialBalance: number,
    currency: string
  ): SandboxResult<Pick<SandboxAccount, "id" | "customerId" | "name" | "type" | "balance" | "currency">> {
    try {
      const db = getDb();

      const createFn = db.transaction((): { customerId: string; accountId: string } => {
        
        let customer = db.prepare("SELECT id FROM customers WHERE name = ?").get(customerName) as { id: string } | undefined;
        if (!customer) {
          const customerCount = db.prepare("SELECT COUNT(*) as n FROM customers").get() as { n: number };
          const customerSeq = String(customerCount.n + 1).padStart(3, "0");
          const customerId = `CUST-${customerSeq}`;
          db.prepare("INSERT INTO customers (id, name) VALUES (?, ?)").run(customerId, customerName);
          customer = { id: customerId };
        }

        
        const accountCount = db.prepare("SELECT COUNT(*) as n FROM accounts WHERE customer_id = ?").get(customer.id) as { n: number };
        const accountSeq = String(accountCount.n + 1).padStart(3, "0");
        const accountId = `ACC-${accountSeq}`;

        db.prepare(
          "INSERT INTO accounts (id, customer_id, name, type, currency, balance, status) VALUES (?, ?, ?, ?, ?, ?, 'active')"
        ).run(accountId, customer.id, accountName, accountType, currency, initialBalance);

        db.prepare(
          "INSERT INTO audit_events (tool, record_id, action, detail) VALUES (?, ?, ?, ?)"
        ).run("finance.create_account", accountId, "created", `customer: ${customerName}, balance: ${initialBalance}`);

        return { customerId: customer.id, accountId };
      });

      const { customerId, accountId } = createFn();
      console.info("[sandbox-db] finance.create_account:", { accountId, customerId, customerName, initialBalance });

      return {
        ok: true,
        data: { id: accountId, customerId, name: accountName, type: accountType, balance: initialBalance, currency },
      };
    } catch (err) {
      console.error("[sandbox-db] createAccount error:", err);
      return { ok: false, error: { code: "DATABASE_ERROR", detail: "createAccount failed" } };
    }
  },

  
  deposit(accountId: string, amount: number, customerId?: string): SandboxResult<{ accountId: string; amount: number; newBalance: number; currency: string }> {
    try {
      const db = getDb();

      const query = customerId
        ? "SELECT * FROM accounts WHERE id = ? AND customer_id = ? AND status = 'active'"
        : "SELECT * FROM accounts WHERE id = ? AND status = 'active'";
      const params = customerId ? [accountId, customerId] : [accountId];
      const row = db.prepare(query).get(...params) as Record<string, unknown> | undefined;

      if (!row) return { ok: false, error: { code: "ACCOUNT_NOT_FOUND" } };

      const currentBalance = Number(row["balance"]);
      const newBalance = currentBalance + amount;

      const depositFn = db.transaction(() => {
        db.prepare("UPDATE accounts SET balance = ?, updated_at = datetime('now') WHERE id = ?").run(newBalance, accountId);
        db.prepare(
          "INSERT INTO audit_events (tool, record_id, action, detail) VALUES (?, ?, ?, ?)"
        ).run("finance.deposit", accountId, "deposit", `amount: ${amount}, new_balance: ${newBalance}`);
      });
      depositFn();

      console.info("[sandbox-db] finance.deposit:", { accountId, amount, newBalance });
      return { ok: true, data: { accountId, amount, newBalance, currency: String(row["currency"]) } };
    } catch (err) {
      console.error("[sandbox-db] deposit error:", err);
      return { ok: false, error: { code: "DATABASE_ERROR", detail: "deposit failed" } };
    }
  },

  listCards(customerId = DEMO_CUSTOMER_ID): SandboxResult<SandboxCard[]> {
    try {
      const db = getDb();
      const rows = db
        .prepare("SELECT * FROM cards WHERE customer_id = ? ORDER BY id")
        .all(customerId) as Array<Record<string, unknown>>;
      return {
        ok: true,
        data: rows.map((r) => ({
          id: String(r["id"]),
          customerId: String(r["customer_id"]),
          accountId: String(r["account_id"]),
          last4: String(r["last4"]),
          type: String(r["type"]),
          status: String(r["status"]) as "active" | "stopped",
        })),
      };
    } catch (err) {
      console.error("[sandbox-db] listCards error:", err);
      return { ok: false, error: { code: "DATABASE_ERROR", detail: "listCards failed" } };
    }
  },

  getCardStatus(cardId: string, customerId = DEMO_CUSTOMER_ID): SandboxResult<Pick<SandboxCard, "id" | "last4" | "status">> {
    try {
      const db = getDb();
      const row = db
        .prepare("SELECT * FROM cards WHERE id = ? AND customer_id = ?")
        .get(cardId, customerId) as Record<string, unknown> | undefined;
      if (!row) return { ok: false, error: { code: "CARD_NOT_FOUND" } };
      return {
        ok: true,
        data: {
          id: String(row["id"]),
          last4: String(row["last4"]),
          status: String(row["status"]) as "active" | "stopped",
        },
      };
    } catch (err) {
      console.error("[sandbox-db] getCardStatus error:", err);
      return { ok: false, error: { code: "DATABASE_ERROR", detail: "getCardStatus failed" } };
    }
  },

  stopCard(cardId: string, reason?: string, customerId = DEMO_CUSTOMER_ID): SandboxResult<{ cardId: string; last4: string; status: "stopped"; changed: boolean }> {
    try {
      const db = getDb();
      const row = db
        .prepare("SELECT * FROM cards WHERE id = ? AND customer_id = ?")
        .get(cardId, customerId) as Record<string, unknown> | undefined;

      if (!row) return { ok: false, error: { code: "CARD_NOT_FOUND" } };
      const currentStatus = String(row["status"]);
      const last4 = String(row["last4"]);

      if (currentStatus === "stopped") {
        return { ok: true, data: { cardId, last4, status: "stopped", changed: false } };
      }

      const stopFn = db.transaction(() => {
        db.prepare(
          "UPDATE cards SET status = 'stopped', updated_at = datetime('now') WHERE id = ? AND customer_id = ?"
        ).run(cardId, customerId);
        db.prepare(
          "INSERT INTO audit_events (tool, record_id, action, detail) VALUES (?, ?, ?, ?)"
        ).run("finance.stop_card", cardId, "stopped", reason ?? null);
      });
      stopFn();

      console.info("[sandbox-db] finance.stop_card:", { cardId, last4, from: "active", to: "stopped", reason: reason ?? "not specified" });
      return { ok: true, data: { cardId, last4, status: "stopped", changed: true } };
    } catch (err) {
      console.error("[sandbox-db] stopCard error:", err);
      return { ok: false, error: { code: "DATABASE_ERROR", detail: "stopCard failed" } };
    }
  },
  createComplaint(title: string, description: string, customerId = DEMO_CUSTOMER_ID): SandboxResult<{ complaintId: string; status: string }> {
    try {
      if (!title?.trim() || !description?.trim()) {
        return { ok: false, error: { code: "MISSING_INPUT" } };
      }
      const db = getDb();

      const createFn = db.transaction((): string => {
        
        const countRow = db.prepare("SELECT COUNT(*) as n FROM complaints WHERE customer_id = ?").get(customerId) as { n: number };
        const seq = String(countRow.n + 1).padStart(4, "0");
        const id = `CMP-${seq}`;
        db.prepare(
          "INSERT INTO complaints (id, customer_id, title, description, status) VALUES (?, ?, ?, ?, 'submitted')"
        ).run(id, customerId, title.trim(), description.trim());
        db.prepare(
          "INSERT INTO audit_events (tool, record_id, action, detail) VALUES (?, ?, ?, ?)"
        ).run("support.submit_complaint", id, "created", `title: ${title.trim().slice(0, 80)}`);
        return id;
      });

      const complaintId = createFn();
      console.info("[sandbox-db] support.submit_complaint:", { complaintId, customerId });
      return { ok: true, data: { complaintId, status: "submitted" } };
    } catch (err) {
      console.error("[sandbox-db] createComplaint error:", err);
      return { ok: false, error: { code: "DATABASE_ERROR", detail: "createComplaint failed" } };
    }
  },

  getComplaint(complaintId: string, customerId = DEMO_CUSTOMER_ID): SandboxResult<SandboxComplaint> {
    try {
      const db = getDb();
      const row = db
        .prepare("SELECT * FROM complaints WHERE id = ? AND customer_id = ?")
        .get(complaintId, customerId) as Record<string, unknown> | undefined;
      if (!row) return { ok: false, error: { code: "COMPLAINT_NOT_FOUND" } };
      return {
        ok: true,
        data: {
          id: String(row["id"]),
          customerId: String(row["customer_id"]),
          title: String(row["title"]),
          description: String(row["description"]),
          status: String(row["status"]),
          createdAt: String(row["created_at"]),
        },
      };
    } catch (err) {
      console.error("[sandbox-db] getComplaint error:", err);
      return { ok: false, error: { code: "DATABASE_ERROR", detail: "getComplaint failed" } };
    }
  },
  reset(): void {
    const db = getDb();
    const resetFn = db.transaction(() => {
      db.prepare("UPDATE cards SET status = 'active', updated_at = datetime('now')").run();
      db.prepare("DELETE FROM complaints").run();
      db.prepare("DELETE FROM audit_events").run();
    });
    resetFn();
    console.info("[sandbox-db] Sandbox reset: all cards active, complaints cleared.");
  },
};
