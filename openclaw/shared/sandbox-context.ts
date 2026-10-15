export interface SandboxSessionContext {
  mode: "sandbox";
  customerId: string;
  displayName: string;
  authenticated: false;
  realIdentityKnown: false;
}

export const DEFAULT_SANDBOX_CONTEXT: SandboxSessionContext = {
  mode: "sandbox",
  customerId: "CUST-001",
  displayName: "Demo Customer",
  authenticated: false,
  realIdentityKnown: false,
};
export function getSandboxContext(): SandboxSessionContext {
  return DEFAULT_SANDBOX_CONTEXT;
}
export function getSandboxCustomerId(): string {
  return getSandboxContext().customerId;
}
