// ============================================================
// طبقة التركيب — الملف الوحيد الذي يعرف الكتابة والمواسم معاً
// ============================================================
// `utils/write.ts` يبقى عاماً تماماً: مسؤوليته أن ينفّذ ويعالج
// الأخطاء ويعرض الرسائل، ولا شأن له بقواعد العمل. والمواسم قاعدة
// عمل. فبدل حشوها فيه، تُركَّب فوقه هنا.
//
// مواضع الاستدعاء لا تتغيّر — سطر واحد في كل صفحة:
//
//   - const { writeOk, writeAllOk } = createWriteHelpers(showAlert);
//   + const { writeOk, writeAllOk } = useSeasonWrite(showAlert);
//
// وهذه الطبقة تجربة مستخدم واتساق رسالة، لا ضمانة. الضمانة
// الحقيقية محفّز القاعدة الذي يرفض أي كتابة على موسم مقفل مهما
// كان مصدرها.
import { useCallback } from "react";
import { createWriteHelpers } from "../utils/write";
import type { WriteResult } from "../utils/write";
import { useSeason } from "./useSeason";

/* أوسع من ShowError في write.ts بحالة واحدة: الرفض تحذير لا خطأ.
   لا شيء أخفق — المستخدم في موسم للعرض فقط. */
type ShowAlert = (type: "error" | "warning", message: string) => void;

export function useSeasonWrite(showAlert: ShowAlert) {
  const { canWrite, viewedSeason } = useSeason();
  const { writeOk: baseOk, writeAllOk: baseAllOk } = createWriteHelpers(showAlert);

  /* المسارات المباشرة التي لا تمرّ بالمساعد — رفع الملفات وحذفها
     من الحاوية و functions.invoke والكتابات التي تقرأ النتيجة */
  const assertWritable = useCallback((): boolean => {
    if (canWrite) return true;
    showAlert("warning", `موسم ${viewedSeason.name} للعرض فقط. عُد إلى الموسم النشط للتعديل.`);
    return false;
  }, [canWrite, viewedSeason.name, showAlert]);

  /* الرفض قبل الانتظار يمنع الطلب فعلاً لا شكلاً: باني استعلامات
     Supabase كسول، لا يُرسل شيئاً حتى يُنتظَر (‏then). فالخروج هنا
     يعني أن الطلب لم يغادر المتصفح أصلاً. */
  async function writeOk(result: PromiseLike<WriteResult>, failMessage: string): Promise<boolean> {
    if (!assertWritable()) return false;
    return baseOk(result, failMessage);
  }

  async function writeAllOk(results: PromiseLike<WriteResult>[], failMessage: string): Promise<boolean> {
    if (!assertWritable()) return false;
    return baseAllOk(results, failMessage);
  }

  return { writeOk, writeAllOk, assertWritable, canWrite, readOnly: !canWrite };
}
