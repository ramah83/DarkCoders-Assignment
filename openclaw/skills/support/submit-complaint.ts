import { sandboxRepository, type SandboxResult } from "../../shared/sandbox-db.js";

export interface ComplaintData {
  complaintId: string;
  status: string;
}

export function submitComplaint(title: string, description: string): SandboxResult<ComplaintData> {
  if (!title?.trim() || !description?.trim()) {
    return { ok: false, error: { code: "MISSING_INPUT" } };
  }
  return sandboxRepository.createComplaint(title.trim(), description.trim());
}
