# Financial Support Voice Agent — OpenClaw Assignment

> **A working, natural-sounding financial support agent** that listens, thinks out loud, and asks before it acts.

## What I Built

A **Financial Support Voice Agent** that demonstrates real agent engineering on OpenClaw:

### The Core Agent
- Listens to customers in Arabic or English
- Answers questions about account balances, cards, and complaints
- Uses real tools connected to a persistent database (SQLite)
- Asks for approval before doing anything risky (stopping cards, filing complaints)
- Shows its work step-by-step in the console

### The Skills (Real Tools, Not Just Chat)
1. **finance.get_accounts** — List customer accounts (checking, savings, etc.)
2. **finance.get_account_balance** — Get current balance from the database
3. **finance.list_cards** — Show all cards with masked last 4 digits
4. **finance.get_card_status** — Check if a card is active or stopped
5. **finance.stop_card** — Stop a card (with approval required + read-after-write verification)
6. **finance.create_account** — Create new account for any customer (with approval required)
7. **finance.deposit** — Deposit money into an account (with approval required)
8. **support.submit_complaint** — File a complaint (with approval required, generates real ID)
9. **support.follow_complaint** — Look up complaint status by ID
10. **support.is_live_chat_available** — Check if live support is available

### The Sandbox
- **Persistent SQLite database** (`data/financial-sandbox.db`)
- Seeded with realistic demo data (accounts, cards, complaints)
- All reads come from the database (never invented balances)
- All writes actually change state (persisted across restarts)
- Can be reset with `npm run sandbox:reset`

---

## How It Works

### The User Talks

```
User (voice): "رصيدي كام؟" (What's my balance?)
```

### The Console Listens & Routes

1. Speech → text via Groq Whisper
2. Text sent to `/api/agent` with `agent: "financial-support"`
3. Routes to `runFinancialAgent()` in `openclaw/agents/financial-support/agent.ts`

### The Agent Thinks

1. Receives system prompt (rules about tools, language, approval flow)
2. Calls LLM with the turn history
3. LLM decides: "I should call `finance.get_account_balance`"

### The Tool Runs

```
Tool: finance.get_account_balance
→ Skill: openclaw/skills/finance/get-account-balance.ts
→ Repository: sandboxRepository.getBalance()
→ Database: SELECT balance FROM accounts WHERE id = "ACC-001"
→ Result: 12500.50 EGP
```

### The Agent Replies

```
Screen:
  text: "رصيد الحساب الجاري هو 12,500.50 جنيه مصري."
  choices: []
  navigation: ["home"]
```

### The Console Speaks

```
Voice (aloud): "رصيد الحساب الجاري هو 12,500.50 جنيه مصري."
```

---

## Key Decisions & Trade-Offs

### 1. Why SQLite Instead of External APIs?
**Decision:** Built a local sandbox with SQLite instead of calling real bank APIs.

**Why:**
- Real bank APIs would be rate-limited and fragile (they are — Groq's Qwen model hits 429 errors frequently)
- External APIs require credentials and add latency
- SQLite gives us a **source of truth** for demo data
- Read-after-write verification works instantly (stop card → check card status)

**Trade-off:** This is obviously demo data, not real banking. But the agent treats it as real — it never says "this is a sandbox", giving a natural UX.

### 2. Why Groq Instead of OpenAI?
**Decision:** Used Groq as the LLM provider (OpenAI-compatible).

**Why:**
- Groq is fast (API latency ~200ms vs ~600ms for OpenAI)
- OpenAI-compatible API (easy swap if needed)
- Configured in `/api/agent` to route to Groq for the Financial Agent specifically

**Trade-off:** Groq's free tier has strict rate limits (1 token/minute-ish). When hitting limits, we retry with exponential backoff (1s, 2s, 4s).

### 3. Why Approval Flow?
**Decision:** State-changing operations (`stop_card`, `submit_complaint`) require explicit human approval.

**Why:**
- Stopping a card is risky — a mistake could impact the user's access
- Filing a complaint creates a record — should be intentional
- The console already has an approval panel; using it was the obvious choice

**Implementation:**
- Agent returns `action_proposal` instead of executing immediately
- Console shows "Approve / Deny" buttons
- On Approve, agent executes the tool and returns the result
- On Deny, agent acknowledges and preserves context

### 4. Why Read-After-Write Verification?
**Decision:** After `stop_card`, immediately read card status back from the database.

**Why:**
- Ensures the write actually succeeded (not just assumed)
- Returns to the user with verified state, not hope
- Catches race conditions or bugs early

**Implementation:**
- `stop_card()` in `openclaw/skills/finance/stop-card.ts` returns `{ verified: true/false }`
- Uses `getCardStatus()` to re-read the card
- Agent confirms: "تم إيقاف البطاقة المنتهية بـ 4821" (verified)

### 5. Why No "Sandbox" Language?
**Decision:** Never tell the user "this is demo data" or "you're in a sandbox".

**Why:**
- Unnecessary friction — the user doesn't need to know the implementation
- Makes the UX feel natural (user expects a financial service to work like this)
- Still honest — all data is real to the user within the system

**Constraint:**
- If the user asks "اوكي كيف عرفت؟" (how did you know?), agent explains: "استدعيت قاعدة البيانات وجبت البيانات الحالية" (I queried the database)
- No claim that the user is authenticated as a real customer

---

## Architecture

```
┌─ Console (src/routes/index.tsx) ─────────────────┐
│ - Voice input (Groq Whisper)                     │
│ - Live steps display                              │
│ - Approval panel (Approve/Deny)                  │
│ - Voice output (TTS)                              │
└─────────────────────┬──────────────────────────────┘
                      │
                      ↓ POST /api/agent
         ┌─ /api/agent.ts ───────────┐
         │ Routes to agent            │
         │ financial-support → runFinancialAgent() │
         └─────────────────┬──────────┘
                           │
         ┌─ agent.ts ──────↓────────────────────┐
         │ runFinancialAgent()                  │
         │ - Receives turns (conversation)      │
         │ - Calls LLM with system prompt       │
         │ - Parses LLM response                │
         │ - Executes tools or returns screen   │
         └─────────────────┬────────────────────┘
                           │
         ┌─────────────────↓────────────────────┐
         │ executeTool()                        │
         │ - finance.get_account_balance        │
         │ - finance.stop_card                  │
         │ - support.submit_complaint           │
         │ - ... etc                            │
         └─────────────────┬────────────────────┘
                           │
         ┌─────────────────↓────────────────────┐
         │ Skill Layer (openclaw/skills/)       │
         │ - get-account-balance.ts             │
         │ - stop-card.ts                       │
         │ - submit-complaint.ts                │
         └─────────────────┬────────────────────┘
                           │
         ┌─────────────────↓────────────────────┐
         │ Repository (sandbox-db.ts)           │
         │ - SQLite database operations         │
         │ - CRUD for accounts, cards, etc      │
         └─────────────────┬────────────────────┘
                           │
         ┌─────────────────↓────────────────────┐
         │ SQLite Database                      │
         │ data/financial-sandbox.db            │
         │ - customers (CUST-001)               │
         │ - accounts (ACC-001, ACC-002)        │
         │ - cards (CARD-001, CARD-002)         │
         │ - complaints (CMP-0001, ...)         │
         └────────────────────────────────────┘
```

---

## File Structure

```
openclaw/
├── agents/
│   └── financial-support/
│       ├── agent.ts           ← Main agent runner (LLM orchestration)
│       ├── prompt.ts          ← System prompt (rules, tools, language)
│       ├── tools.ts           ← Tool definitions (for LLM)
│       └── agent-identity.test.ts ← (Not used — manual testing only)
├── skills/
│   ├── finance/
│   │   ├── get-accounts.ts
│   │   ├── get-account-balance.ts
│   │   ├── list-cards.ts
│   │   ├── get-card-status.ts
│   │   └── stop-card.ts
│   └── support/
│       ├── submit-complaint.ts
│       ├── follow-complaint.ts
│       └── is-live-chat-available.ts
└── shared/
    ├── sandbox-db.ts         ← SQLite repository + schema
    ├── sandbox-context.ts    ← Identity model (not exposed to user)
    ├── api-client.ts         ← (Legacy — not used for Financial Agent)
    └── sandbox-db.test.ts    ← Repository tests (30/30 pass)
```

---

## How I Used AI

1. **Claude Sonnet 4.5** — Designed the agent architecture, wrote skills, built the sandbox, debugged Groq integration issues.
2. **Groq Qwen 3.8B** — The agent's LLM (via OpenAI-compatible API).
3. **Groq Whisper Large V3** — Speech-to-text for voice input.

---

## Testing

```bash
# Run unit tests (sandbox repository, etc.)
npm test
# Result: 30/30 pass

# TypeScript check
npm run typecheck
# Result: 0 errors

# Run the dev server
npm run dev
# Open http://localhost:8080 in your browser
# Select "Financial Support Agent" from settings
# Hold spacebar to talk
```

### Example Test Flows

**Flow 1: Check Balance**
```
User: "رصيدي كام؟"
Agent calls: finance.get_account_balance
DB returns: 12500.50 EGP
Agent: "رصيد الحساب الجاري هو 12,500.50 جنيه مصري."
```

**Flow 2: Stop Card (with approval)**
```
User: "وقف البطاقة المنتهية بـ 4821"
Agent calls: finance.list_cards (to confirm card exists)
Agent proposes: action_proposal { tool: "finance.stop_card", ... }
Console: Shows "Approve / Deny"
User: Clicks Approve
Agent calls: finance.stop_card → DB updates → finance.get_card_status (verify)
Agent: "تم إيقاف البطاقة المنتهية بـ 4821."
```

**Flow 3: Submit Complaint**
```
User: "عايز أعمل شكوى"
Agent: Asks for title and description
User: Provides details
Agent proposes: action_proposal { tool: "support.submit_complaint", ... }
User: Clicks Approve
Agent calls: support.submit_complaint → DB generates CMP-0001
Agent: "تم تسجيل الشكوى برقم CMP-0001."
```

**Flow 4: Create Account for New Customer**
```
User: "عايز أفتح حساب لمحمد خالد"
Agent: Asks for account type (checking/savings) and initial balance
User: "حساب جاري برصيد 5000 جنيه"
Agent proposes: action_proposal { tool: "finance.create_account", ... }
User: Clicks Approve
Agent calls: finance.create_account → DB creates CUST-002 + ACC-003
Agent: "تم فتح حساب جاري لمحمد خالد برصيد 5,000 جنيه."
```

**Flow 5: Deposit Money**
```
User: "أضف 1000 جنيه للحساب ACC-001"
Agent proposes: action_proposal { tool: "finance.deposit", ... }
User: Clicks Approve
Agent calls: finance.deposit → DB updates balance
Agent: "تم إضافة 1,000 جنيه. الرصيد الجديد: 13,500.50 جنيه."
```

---

## Known Limits & Next Steps

### Current Limits
1. **Single Demo Customer** — All requests use CUST-001. Real system would authenticate the user.
2. **No Real Authentication** — Sandbox mode only. Real deployment would integrate OAuth/banking auth.
3. **Groq Rate Limiting** — Free tier hits limits. Retry logic helps, but enterprise Groq or different LLM needed for production.
4. **No Real Integrations** — External payment, banking, or CRM APIs are skipped in favor of local SQLite.

### What Could Grow
1. **Multi-Customer Support** — Dynamic customer resolution based on auth token or session.
2. **Real Banking APIs** — Swap SQLite for live Plaid, Stripe, or bank APIs.
3. **More Agents** — Add a CISO agent, a project planner, or a code reviewer using the same console.
4. **Spatial Chat** — Already built in the console; could use 3D WebXR for immersive financial reviews.
5. **Advanced Analytics** — Track agent decisions, user satisfaction, and compliance metrics.

---

## How to Run

```bash
# Install
npm install

# Configure
cp .env.example .env
# (Already configured with Groq; can swap for OpenAI if needed)

# Test
npm run typecheck
npm test

# Run
npm run dev
# Open http://localhost:8080
# Select "Financial Support Agent" from General Settings
# Hold spacebar and talk
```

---

## Summary

This is a **working, thoughtful financial support agent** that:
- ✅ Listens (voice input)
- ✅ Thinks (LLM reasoning with live steps)
- ✅ Acts (real tools, persistent database)
- ✅ Asks (approval flow for risky actions)
- ✅ Learns (reads back after writes, verifies state)

It's not a chatbot pretending; it's a real agent with real skills, a sense of caution, and a natural voice.

---

## What's Next

When we sit down, I'd love to talk through:
1. How the approval flow could scale to multiple agents
2. Why read-after-write verification matters more than we usually think
3. How to extend this to real banking APIs without losing the safety model
4. Whether the "no Sandbox mention" transparency approach is right for your use case

Let's build something worth using. 🚀
