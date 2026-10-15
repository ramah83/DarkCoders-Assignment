export const FINANCIAL_TOOLS = [
  
  {
    name: "finance.get_accounts",
    description: "List all accounts for the demo customer. READ-ONLY — no approval needed. Returns account IDs, names, types, and currencies (not balances).",
    parameters: {
      type: "object",
      required: [],
      properties: {},
    },
  },

  {
    name: "finance.get_account_balance",
    description: "Get the account balance from the sandbox database. READ-ONLY — no approval needed. Pass accountId if the customer has multiple accounts, or omit to get balance for the single account (or a list of accounts to choose from).",
    parameters: {
      type: "object",
      required: [],
      properties: {
        accountId: { type: "string", description: "Optional account ID (e.g. ACC-001). Omit if the customer has one account." },
      },
    },
  },

  {
    name: "finance.list_cards",
    description: "List all demo cards for the customer. READ-ONLY — no approval needed. Returns card ID, last4 digits, type, and status. Never returns full card numbers.",
    parameters: {
      type: "object",
      required: [],
      properties: {},
    },
  },

  {
    name: "finance.get_card_status",
    description: "Get the current persisted status of a specific card from the database. READ-ONLY — no approval needed. Always queries the database — do NOT rely on conversation memory for card status.",
    parameters: {
      type: "object",
      required: ["cardId"],
      properties: {
        cardId: { type: "string", description: "Card ID (e.g. CARD-001)." },
      },
    },
  },

  {
    name: "support.follow_complaint",
    description: "Look up the current status of a complaint by its ID. READ-ONLY — no approval needed. Returns submitted status from the database.",
    parameters: {
      type: "object",
      required: ["complaintId"],
      properties: {
        complaintId: { type: "string", description: "Complaint ID (e.g. CMP-0001)." },
      },
    },
  },

  {
    name: "support.is_live_chat_available",
    description: "Check if live customer support is currently available. READ-ONLY.",
    parameters: {
      type: "object",
      required: [],
      properties: {},
    },
  },

  {
    name: "finance.stop_card",
    description: "CONSEQUENTIAL: Stop or block a demo card. MUST use action_proposal before calling. Only call after explicit human Approve. Performs read-after-write verification.",
    parameters: {
      type: "object",
      required: ["cardId"],
      properties: {
        cardId: { type: "string", description: "Card ID to stop (e.g. CARD-001)." },
        reason: { type: "string", description: "Optional reason for stopping the card (e.g. lost, stolen, damaged)." },
      },
    },
  },

  {
    name: "support.submit_complaint",
    description: "CONSEQUENTIAL: Submit a new complaint. MUST use action_proposal before calling. Only call after explicit human Approve. Generates a real complaint ID (CMP-NNNN) in the database.",
    parameters: {
      type: "object",
      required: ["title", "description"],
      properties: {
        title: { type: "string", description: "Short complaint title (e.g. 'Mobile app issue')." },
        description: { type: "string", description: "Full description of the complaint." },
      },
    },
  },

  {
    name: "finance.create_account",
    description: "CONSEQUENTIAL: Create a new bank account for a customer. MUST use action_proposal before calling. Only call after explicit human Approve. Creates customer if doesn't exist.",
    parameters: {
      type: "object",
      required: ["customerName", "accountName", "accountType"],
      properties: {
        customerName: { type: "string", description: "Customer full name (e.g. 'محمد خالد')." },
        accountName: { type: "string", description: "Account name (e.g. 'حساب جاري')." },
        accountType: { type: "string", enum: ["checking", "savings"], description: "Account type: checking or savings." },
        initialBalance: { type: "number", description: "Optional initial balance (default: 0)." },
        currency: { type: "string", description: "Currency code (default: EGP)." },
      },
    },
  },

  {
    name: "finance.deposit",
    description: "CONSEQUENTIAL: Deposit money into an account. MUST use action_proposal before calling. Only call after explicit human Approve.",
    parameters: {
      type: "object",
      required: ["accountId", "amount"],
      properties: {
        accountId: { type: "string", description: "Account ID (e.g. ACC-001)." },
        amount: { type: "number", description: "Amount to deposit (must be positive)." },
      },
    },
  },
] as const;

export type ToolName = (typeof FINANCIAL_TOOLS)[number]["name"];