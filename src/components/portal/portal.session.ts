/* ═══ أثرُ الجلسة على الجهاز ═══
   قراءةُ الرمز ومحوُ كلّ ما يخصّ الحاجّ. نُقلت كما هي: **لا تُمسّ
   معماريّةُ الجلسة** في هذه المرحلة — موضعٌ واحد يعرف شكلَ الرمز،
   وهو هذا. */
import { clearPortalDocCache, PORTAL_SESSION_KEY, type PortalSession } from "../../utils";

/* ═══ س٧ — الجلسة تحلّ محلّ الاعتماد الثابت (الثابت أ١٢) ═══
   لم يعد على جهاز الحاجّ رقمُ جوازه وتاريخُ ميلاده. صار عليه رمزٌ
   مبهم ينتهي خمولاً بعد ٣٠ يوماً، ويموت مطلقاً بعد ٩٠، ويُبطَل
   بالخروج، ويسقط بإقفال الموسم. وموضعٌ واحد يعرف شكله. */
export function readSession(): string | null {
  try {
    const raw = localStorage.getItem(PORTAL_SESSION_KEY);
    const t = raw ? (JSON.parse(raw) as PortalSession)?.token : null;
    return typeof t === "string" && t ? t : null;
  } catch {
    return null;
  }
}

/** كل ما يخصّ الحاجّ على هذا الجهاز — يُمسح معاً أو لا يُمسح. */
export function clearPortalLocalState(): void {
  localStorage.removeItem(PORTAL_SESSION_KEY);
  localStorage.removeItem("portal_data");
  localStorage.removeItem("portal_seen_alerts");
  localStorage.removeItem("portal_acked_urgent");
  clearPortalDocCache();
}
