/* ── النمط الموحّد لعمليات الكتابة على Supabase ──────────────
   كل insert/update/delete يمرّ من هنا. تُرجع true عند النجاح فقط،
   وتعرض رسالة عند الفشل. الحالة المحلية لا تُحدَّث إلا إذا عادت
   true — فلا تُظهر الواجهة نتيجةً لم تحدث في القاعدة.

   الدالتان تحتاجان showAlert الخاص بالمكوّن، فتُبنيان بحقنه بدل
   أن تُصدَّرا مباشرةً. */

/* شكل نتيجة أي عملية كتابة على Supabase */
export type WriteResult = { error: { message?: string } | null };

/* أضيق توقيع تستعمله الدالتان فعلاً — showAlert القادم من useAlert
   أوسع منه فيقبله المترجم، ولا نستورد نوعاً من طبقة المكوّنات */
type ShowError = (type: "error", message: string) => void;

export function createWriteHelpers(showAlert: ShowError) {
  async function writeOk(result: PromiseLike<WriteResult>, failMessage: string): Promise<boolean> {
    const { error } = await result;
    if (error) {
      console.error(failMessage, error);
      showAlert("error", failMessage);
      return false;
    }
    return true;
  }

  /* نفس النمط لدفعة عمليات متوازية */
  async function writeAllOk(results: PromiseLike<WriteResult>[], failMessage: string): Promise<boolean> {
    const settled = await Promise.all(results);
    const failed = settled.filter(r => r.error);
    if (failed.length > 0) {
      console.error(failMessage, failed.map(f => f.error));
      showAlert("error", failMessage);
      return false;
    }
    return true;
  }

  return { writeOk, writeAllOk };
}
