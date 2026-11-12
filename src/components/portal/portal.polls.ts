/* ═══ تصويتُ الحاجّ — ترجمةُ ردود `submit_pilgrim_poll_response` (Phase 3) ═══
   ملفٌّ بلا مكوّنات، ويُختبر بـnode وحده. كلُّ ردٍّ موثَّقٍ في Phase 2 له هنا معنىً واحد:
     ok           ← سُجّلت الإجابة: تُعتمد مراجعتُها وخياراتُها
     unchanged    ← الإجابةُ نفسُها مسجَّلة: لا تغيير
     stale        ← تغيّرت من جهازٍ آخر: تُعرض المسجَّلةُ الآن ولا يُكتب فوقها
     final        ← الإجابةُ الأولى نهائيّة: تُعرض كما سُجّلت
     closed       ← أُغلق الاستطلاع (أو مُوسمه): لم يُسجَّل شيء
     not_found    ← ليس في جمهور الحاجّ: لم يُسجَّل شيء
     rate_limited ← محاولاتٌ كثيرة
     null         ← لا جلسة صالحة: سلوكُ انتهاء الجلسة القائمُ في البوابة */
import type { PollSubmitResult, PortalPoll } from "./portal.types";

export type PollOutcome = {
  tone: "success" | "info" | "warning" | "error";
  text: string;
  /** الإجابةُ المسجَّلة في القاعدة بعد هذا الردّ — تُعتمد محلّيّاً (لا يُكتب فوقها) */
  adopt?: { revision: number; option_ids: number[] };
  /** يُعاد جلبُ الاستطلاعات (أُغلق أو اختفى) */
  refresh?: boolean;
  /** الجلسةُ لم تعد صالحة */
  expired?: boolean;
  /** هل يبقى وضعُ التعديل مفتوحاً */
  keepEditing?: boolean;
};

export function submitOutcome(res: PollSubmitResult | null, sent: number[]): PollOutcome {
  if (res === null) return { tone: "error", text: "انتهت جلستك. يرجى الدخول من جديد.", expired: true };
  const ids = (res.option_ids || []).slice().sort((a, b) => a - b);
  const rev = res.revision ?? 0;
  switch (res.status) {
    case "ok": return { tone: "success", text: "تم تسجيل إجابتك. شكراً لك.", adopt: { revision: rev, option_ids: ids.length ? ids : sent } };
    case "unchanged": return { tone: "info", text: "إجابتك مسجّلة كما هي.", adopt: { revision: rev, option_ids: ids } };
    case "stale": return {
      tone: "warning", keepEditing: true, adopt: { revision: rev, option_ids: ids },
      text: rev === 0
        ? "تغيّرت حالة إجابتك من جهاز آخر. راجع اختيارك ثم أرسله من جديد."
        : "تغيّرت إجابتك من جهاز آخر. هذه إجابتك المسجّلة الآن — يمكنك تعديلها وإرسالها من جديد.",
    };
    case "final": return { tone: "warning", text: "إجابتك الأولى نهائية في هذا الاستطلاع ولا يمكن تغييرها. هذه إجابتك المسجّلة.", adopt: { revision: rev, option_ids: ids } };
    case "closed": return { tone: "error", text: "أُغلق هذا الاستطلاع، ولم تُسجَّل إجابتك.", refresh: true };
    case "not_found": return { tone: "error", text: "هذا الاستطلاع غير متاح لك.", refresh: true };
    case "rate_limited": return { tone: "error", text: "محاولات كثيرة خلال وقت قصير. يرجى المحاولة بعد قليل." };
    default: return { tone: "error", text: "تعذّر إرسال الإجابة، يرجى المحاولة مرة أخرى." };
  }
}

/** ما يُعرض للحاجّ عن حال الاستطلاع */
export function pollPhase(p: PortalPoll, now = Date.now()): "open-unanswered" | "open-answered" | "open-final" | "closed" {
  /* موعدُ الإغلاق حلّ والصفحةُ مفتوحة: مغلقٌ للعرض، والقاعدةُ تُغلقه وتردّ closed لو أُرسل */
  if (p.state !== "open" || (p.closes_at && new Date(p.closes_at).getTime() <= now)) return "closed";
  if (!p.my_response) return "open-unanswered";
  return p.allow_answer_changes ? "open-answered" : "open-final";
}

/** هل يُرسَل هذا الاختيار؟ (العددُ وحده؛ صحّةُ الخيارات تحكمها القاعدة) */
export function selectionError(p: PortalPoll, sel: number[]): string | null {
  if (sel.length === 0) return p.kind === "single" ? "اختر إجابة واحدة." : "اختر إجابة واحدة على الأقل.";
  if (p.kind === "single" && sel.length !== 1) return "اختر إجابة واحدة فقط.";
  if (p.kind === "multiple" && p.max_choices && sel.length > p.max_choices) return `يمكنك اختيار ${p.max_choices} على الأكثر.`;
  return null;
}

export const sameIds = (a: number[], b: number[]) => {
  const x = a.slice().sort((m, n) => m - n), y = b.slice().sort((m, n) => m - n);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};
