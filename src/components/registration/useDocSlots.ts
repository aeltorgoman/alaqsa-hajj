import { useCallback, useRef, useState } from "react";
import { DocumentScanError, normalizeQuarterTurns } from "../../utils";

/* ═══════════════════════════════════════════════════════════════
   مستندا نافذة التسجيل — الجواز والبطاقة

   لكلّ مستندٍ حالتُه وحده: الملفّ الجديد إن اختير، والمفتاحُ المحفوظ
   إن وُجد (التعديل)، وربعُ الدورة، وحالةُ القراءة. فالتبديلُ بين
   التبويبين لا يمسّ أحدهما، ولا يمسّ النموذج.

   والقراءةُ تحمل **رقماً** يُزاد عند استبدال الملفّ أو إغلاق النافذة:
   ردٌّ وصل بعد ذلك يُهمَل بلا أثر — فلا تملأ قراءةٌ قديمة نموذجاً
   جديداً. والقراءةُ تعمل على الملفّ الأصليّ دائماً؛ التدويرُ للعرض
   وللحفظ وحدهما.
   ═══════════════════════════════════════════════════════════════ */

export type DocSlotKey = "passport" | "idcard";
export type ScanStatus = "idle" | "scanning" | "done" | "failed";

export type DocSlot = {
  /** ملفٌّ اختير الآن — يُرفع عند الحفظ */
  file: File | null;
  /** مفتاحُ مستندٍ محفوظ (التعديل) — يُعرض ولا يُمسّ إلا بحفظٍ صريح */
  stored: string | null;
  turns: 0 | 1 | 2 | 3;
  status: ScanStatus;
  error: string | null;
  /** يتغيّر كلّما تغيّر المعروض — يعيد ضبط التكبير والسحب */
  version: number;
};

const EMPTY: DocSlot = { file: null, stored: null, turns: 0, status: "idle", error: null, version: 0 };
const initial = (): Record<DocSlotKey, DocSlot> => ({ passport: { ...EMPTY }, idcard: { ...EMPTY } });

export function useDocSlots() {
  const [slots, setSlots] = useState(initial);
  const tokens = useRef<Record<DocSlotKey, number>>({ passport: 0, idcard: 0 });

  const patch = useCallback((key: DocSlotKey, next: (s: DocSlot) => DocSlot) => {
    setSlots(prev => ({ ...prev, [key]: next(prev[key]) }));
  }, []);

  /** يُبطل كلّ قراءةٍ جارية ويعيد الحالة كما فُتحت النافذة أوّل مرّة. */
  const reset = useCallback((stored?: Partial<Record<DocSlotKey, string | null>>) => {
    tokens.current = { passport: tokens.current.passport + 1, idcard: tokens.current.idcard + 1 };
    setSlots(prev => ({
      passport: { ...EMPTY, stored: stored?.passport ?? null, version: prev.passport.version + 1 },
      idcard: { ...EMPTY, stored: stored?.idcard ?? null, version: prev.idcard.version + 1 },
    }));
  }, []);

  /** ملفٌّ جديد بلا قراءة — يحلّ محلّ المعروض، ويُبطل قراءته الجارية. */
  const setFile = useCallback((key: DocSlotKey, file: File) => {
    tokens.current[key] += 1;
    patch(key, s => ({ ...s, file, turns: 0, status: "idle", error: null, version: s.version + 1 }));
  }, [patch]);

  const rotate = useCallback((key: DocSlotKey, delta: 1 | -1) => {
    patch(key, s => ({ ...s, turns: normalizeQuarterTurns(s.turns + delta) }));
  }, [patch]);

  /** يعرض الملفّ فوراً ثم يقرؤه. `apply` لا تُستدعى إلا إذا بقي هذا
      الملفّ نفسُه معروضاً والنافذةُ مفتوحة. */
  const scan = useCallback(async <R,>(
    key: DocSlotKey,
    file: File,
    read: (file: File) => Promise<R>,
    apply: (result: R) => void,
    fallbackError: string,
  ) => {
    const token = ++tokens.current[key];
    setSlots(prev => {
      const s = prev[key];
      /* إعادةُ المحاولة على الملفّ نفسه لا تُعيد ضبط العرض ولا التدوير */
      const same = s.file === file;
      return { ...prev, [key]: { ...s, file, turns: same ? s.turns : 0, status: "scanning", error: null, version: same ? s.version : s.version + 1 } };
    });
    try {
      const result = await read(file);
      if (tokens.current[key] !== token) return;
      apply(result);
      patch(key, s => ({ ...s, status: "done" }));
    } catch (e) {
      if (tokens.current[key] !== token) return;
      console.error("تعذّرت قراءة المستند", { key, error: e });
      const message = e instanceof DocumentScanError ? e.message : fallbackError;
      patch(key, s => ({ ...s, status: "failed", error: message }));
    }
  }, [patch]);

  const scanning = slots.passport.status === "scanning" || slots.idcard.status === "scanning";
  /** ما يُفقد بالإغلاق: ملفٌّ اختير أو تدويرٌ لم يُحفظ */
  const docsDirty = (["passport", "idcard"] as const).some(k => !!slots[k].file || slots[k].turns !== 0);

  return { slots, reset, setFile, rotate, scan, scanning, docsDirty };
}
