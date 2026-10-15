 import { sandboxRepository, type SandboxResult } from "../../shared/sandbox-db.js";

export interface ComplaintStatusData {
  complaintId: string;
  title: string;
  status: string;
  createdAt: string;
}

export function followComplaint(complaintId: string): SandboxResult<ComplaintStatusData> {
  if (!complaintId?.trim()) {
    return { ok: false, error: { code: "MISSING_INPUT" } };
  }
  const result = sandboxRepository.getComplaint(complaintId.trim());
  if (!result.ok) return result;

  return {
    ok: true,
    data: {
      complaintId: result.data.id,
      title: result.data.title,
      status: result.data.status,
      createdAt: result.data.createdAt,
    },
  };
}
