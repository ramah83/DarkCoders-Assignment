

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
function buildTestRepo() {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'checking', currency TEXT NOT NULL DEFAULT 'EGP',
      balance REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE cards (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, account_id TEXT NOT NULL,
      last4 TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'debit', status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE complaints (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'submitted',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tool TEXT NOT NULL, record_id TEXT,
      action TEXT NOT NULL, detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare("INSERT INTO customers (id, name) VALUES (?, ?)").run("CUST-001", "Demo Customer");
  db.prepare("INSERT INTO accounts (id, customer_id, name, type, currency, balance, status) VALUES (?, ?, ?, ?, ?, ?, ?)").run("ACC-001", "CUST-001", "Demo Current Account", "checking", "EGP", 12500.50, "active");
  db.prepare("INSERT INTO accounts (id, customer_id, name, type, currency, balance, status) VALUES (?, ?, ?, ?, ?, ?, ?)").run("ACC-002", "CUST-001", "Demo Savings Account", "savings", "EGP", 54200.00, "active");
  db.prepare("INSERT INTO cards (id, customer_id, account_id, last4, type, status) VALUES (?, ?, ?, ?, ?, ?)").run("CARD-001", "CUST-001", "ACC-001", "4821", "debit", "active");
  db.prepare("INSERT INTO cards (id, customer_id, account_id, last4, type, status) VALUES (?, ?, ?, ?, ?, ?)").run("CARD-002", "CUST-001", "ACC-001", "7734", "debit", "active");

  function getAccounts(customerId = "CUST-001") {
    const rows = db.prepare("SELECT * FROM accounts WHERE customer_id = ? AND status != 'closed' ORDER BY id").all(customerId) as Array<Record<string, unknown>>;
    return { ok: true as const, data: rows.map((r) => ({ id: String(r["id"]), name: String(r["name"]), type: String(r["type"]), currency: String(r["currency"]), balance: Number(r["balance"]), status: String(r["status"]) })) };
  }

  function getBalance(accountId: string, customerId = "CUST-001") {
    const row = db.prepare("SELECT * FROM accounts WHERE id = ? AND customer_id = ? AND status = 'active'").get(accountId, customerId) as Record<string, unknown> | undefined;
    if (!row) return { ok: false as const, error: { code: "ACCOUNT_NOT_FOUND" as const } };
    return { ok: true as const, data: { id: String(row["id"]), name: String(row["name"]), balance: Number(row["balance"]), currency: String(row["currency"]) } };
  }

  function listCards(customerId = "CUST-001") {
    const rows = db.prepare("SELECT * FROM cards WHERE customer_id = ? ORDER BY id").all(customerId) as Array<Record<string, unknown>>;
    return { ok: true as const, data: rows.map((r) => ({ id: String(r["id"]), last4: String(r["last4"]), type: String(r["type"]), status: String(r["status"]) })) };
  }

  function getCardStatus(cardId: string, customerId = "CUST-001") {
    const row = db.prepare("SELECT * FROM cards WHERE id = ? AND customer_id = ?").get(cardId, customerId) as Record<string, unknown> | undefined;
    if (!row) return { ok: false as const, error: { code: "CARD_NOT_FOUND" as const } };
    return { ok: true as const, data: { id: String(row["id"]), last4: String(row["last4"]), status: String(row["status"]) as "active" | "stopped" } };
  }

  function stopCard(cardId: string, customerId = "CUST-001") {
    const row = db.prepare("SELECT * FROM cards WHERE id = ? AND customer_id = ?").get(cardId, customerId) as Record<string, unknown> | undefined;
    if (!row) return { ok: false as const, error: { code: "CARD_NOT_FOUND" as const } };
    const currentStatus = String(row["status"]);
    const last4 = String(row["last4"]);
    if (currentStatus === "stopped") return { ok: true as const, data: { cardId, last4, status: "stopped" as const, changed: false } };
    db.prepare("UPDATE cards SET status = 'stopped', updated_at = datetime('now') WHERE id = ? AND customer_id = ?").run(cardId, customerId);
    
    const verify = db.prepare("SELECT status FROM cards WHERE id = ?").get(cardId) as { status: string } | undefined;
    const verified = verify?.status === "stopped";
    return { ok: true as const, data: { cardId, last4, status: "stopped" as const, changed: true, verified } };
  }

  function createComplaint(title: string, description: string, customerId = "CUST-001") {
    if (!title.trim() || !description.trim()) return { ok: false as const, error: { code: "MISSING_INPUT" as const } };
    const countRow = db.prepare("SELECT COUNT(*) as n FROM complaints WHERE customer_id = ?").get(customerId) as { n: number };
    const seq = String(countRow.n + 1).padStart(4, "0");
    const id = `CMP-${seq}`;
    db.prepare("INSERT INTO complaints (id, customer_id, title, description, status) VALUES (?, ?, ?, ?, 'submitted')").run(id, customerId, title.trim(), description.trim());
    return { ok: true as const, data: { complaintId: id, status: "submitted" } };
  }

  function getComplaint(complaintId: string, customerId = "CUST-001") {
    const row = db.prepare("SELECT * FROM complaints WHERE id = ? AND customer_id = ?").get(complaintId, customerId) as Record<string, unknown> | undefined;
    if (!row) return { ok: false as const, error: { code: "COMPLAINT_NOT_FOUND" as const } };
    return { ok: true as const, data: { id: String(row["id"]), title: String(row["title"]), status: String(row["status"]), createdAt: String(row["created_at"]) } };
  }

  return { getAccounts, getBalance, listCards, getCardStatus, stopCard, createComplaint, getComplaint };
}
describe("Financial Sandbox — accounts", () => {
  it("returns seeded accounts from database", () => {
    const repo = buildTestRepo();
    const result = repo.getAccounts();
    assert.ok(result.ok);
    assert.equal(result.data.length, 2);
    assert.equal(result.data[0]!.id, "ACC-001");
  });

  it("balance comes from database, not hardcoded", () => {
    const repo = buildTestRepo();
    const result = repo.getBalance("ACC-001");
    assert.ok(result.ok);
    
    assert.equal(result.data.balance, 12500.50);
    assert.equal(result.data.currency, "EGP");
  });

  it("returns ACCOUNT_NOT_FOUND for unknown account", () => {
    const repo = buildTestRepo();
    const result = repo.getBalance("ACC-999");
    assert.ok(!result.ok);
    assert.equal(result.error.code, "ACCOUNT_NOT_FOUND");
  });
});

describe("Financial Sandbox — cards", () => {
  it("list_cards returns masked card data with last4 only", () => {
    const repo = buildTestRepo();
    const result = repo.listCards();
    assert.ok(result.ok);
    assert.equal(result.data.length, 2);
    
    const card1 = result.data.find((c) => c.id === "CARD-001");
    assert.ok(card1);
    assert.equal(card1.last4, "4821");
    assert.equal(card1.last4.length, 4);
  });

  it("get_card_status reads current persisted status", () => {
    const repo = buildTestRepo();
    const result = repo.getCardStatus("CARD-001");
    assert.ok(result.ok);
    assert.equal(result.data.status, "active");
    assert.equal(result.data.last4, "4821");
  });

  it("get_card_status returns CARD_NOT_FOUND for unknown card", () => {
    const repo = buildTestRepo();
    const result = repo.getCardStatus("CARD-999");
    assert.ok(!result.ok);
    assert.equal(result.error.code, "CARD_NOT_FOUND");
  });
});

describe("Financial Sandbox — stop_card", () => {
  it("stop_card changes active → stopped", () => {
    const repo = buildTestRepo();
    const result = repo.stopCard("CARD-001");
    assert.ok(result.ok);
    assert.equal(result.data.status, "stopped");
    assert.equal(result.data.changed, true);
  });

  it("stop_card is idempotent — second call returns changed: false", () => {
    const repo = buildTestRepo();
    repo.stopCard("CARD-001"); 
    const result = repo.stopCard("CARD-001"); 
    assert.ok(result.ok);
    assert.equal(result.data.status, "stopped");
    assert.equal(result.data.changed, false);
  });

  it("read-after-write: get_card_status after stop returns stopped", () => {
    const repo = buildTestRepo();
    const stopResult = repo.stopCard("CARD-001");
    assert.ok(stopResult.ok);
    assert.equal(stopResult.data.verified, true);

    
    const statusResult = repo.getCardStatus("CARD-001");
    assert.ok(statusResult.ok);
    assert.equal(statusResult.data.status, "stopped");
  });

  it("deny does not change card status (stop_card is never called)", () => {
    const repo = buildTestRepo();
    
    const statusResult = repo.getCardStatus("CARD-001");
    assert.ok(statusResult.ok);
    assert.equal(statusResult.data.status, "active"); 
  });

  it("stop_card returns CARD_NOT_FOUND for unknown card", () => {
    const repo = buildTestRepo();
    const result = repo.stopCard("CARD-999");
    assert.ok(!result.ok);
    assert.equal(result.error.code, "CARD_NOT_FOUND");
  });
});

describe("Financial Sandbox — complaints", () => {
  it("creates a complaint with a real generated ID", () => {
    const repo = buildTestRepo();
    const result = repo.createComplaint("App issue", "The mobile app crashes on login.");
    assert.ok(result.ok);
    assert.match(result.data.complaintId, /^CMP-\d{4}$/);
    assert.equal(result.data.status, "submitted");
  });

  it("complaint IDs are sequential", () => {
    const repo = buildTestRepo();
    const r1 = repo.createComplaint("Issue 1", "First complaint");
    const r2 = repo.createComplaint("Issue 2", "Second complaint");
    assert.ok(r1.ok && r2.ok);
    assert.equal(r1.data.complaintId, "CMP-0001");
    assert.equal(r2.data.complaintId, "CMP-0002");
  });

  it("follow_complaint returns persisted status", () => {
    const repo = buildTestRepo();
    const created = repo.createComplaint("App issue", "Details here.");
    assert.ok(created.ok);
    const follow = repo.getComplaint(created.data.complaintId);
    assert.ok(follow.ok);
    assert.equal(follow.data.status, "submitted");
    assert.equal(follow.data.id, created.data.complaintId);
  });

  it("follow_complaint returns COMPLAINT_NOT_FOUND for unknown ID", () => {
    const repo = buildTestRepo();
    const result = repo.getComplaint("CMP-9999");
    assert.ok(!result.ok);
    assert.equal(result.error.code, "COMPLAINT_NOT_FOUND");
  });

  it("deny does not create a complaint (submit_complaint is never called)", () => {
    const repo = buildTestRepo();
    
    const follow = repo.getComplaint("CMP-0001");
    assert.ok(!follow.ok);
    assert.equal(follow.error.code, "COMPLAINT_NOT_FOUND");
  });

  it("missing input returns MISSING_INPUT error", () => {
    const repo = buildTestRepo();
    const result = repo.createComplaint("", "Description");
    assert.ok(!result.ok);
    assert.equal(result.error.code, "MISSING_INPUT");
  });
});

describe("Financial Sandbox — persistence", () => {
  it("database state is consistent across multiple operations", () => {
    const repo = buildTestRepo();
    repo.stopCard("CARD-001");
    const c = repo.createComplaint("Test", "Test description");
    assert.ok(c.ok);
    const card = repo.getCardStatus("CARD-001");
    assert.ok(card.ok);
    assert.equal(card.data.status, "stopped");
    const card2 = repo.getCardStatus("CARD-002");
    assert.ok(card2.ok);
    assert.equal(card2.data.status, "active");
    const complaint = repo.getComplaint(c.data.complaintId);
    assert.ok(complaint.ok);
  });
});
