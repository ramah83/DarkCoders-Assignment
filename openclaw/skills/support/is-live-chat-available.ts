import type { SandboxResult } from "../../shared/sandbox-db.js";
export interface LiveChatData {
  available: boolean;
  message?: string;
}
export function isLiveChatAvailable(): SandboxResult<LiveChatData> {
  const now = new Date();
  const localHour = (now.getUTCHours() + 2) % 24;
  const dayOfWeek = now.getUTCDay();  
  const isBusinessDay = dayOfWeek >= 0 && dayOfWeek <= 4;
  const isBusinessHour = localHour >= 9 && localHour < 17;
  const available = isBusinessDay && isBusinessHour;

  return {
    ok: true,
    data: {
      available,
      message: available
        ? "الدعم المباشر متاح الآن."
        : "الدعم المباشر غير متاح حالياً. أوقات العمل: الأحد–الخميس من ٩ صباحاً حتى ٥ مساءً.",
    },
  };
}
