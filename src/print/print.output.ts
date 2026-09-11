// ============================================================
// إخراجُ الطباعة — نسخةٌ واحدة لا نسختان
// ============================================================
/* كانت `printInPage` مكتوبةً مرّتين: في `utils/index.ts` بمهلة ١٠٠٠مللي
   وفي `finance.print.ts` بمهلة ٦٠٠ — اختلافٌ بلا سببٍ منتجيّ. صارت
   واحدةً بالمهلة الأطول، فتحتمل تحميلَ الخطّ والصور قبل نداء الطباعة. */
export function printInPage(html: string) {
  const existing = document.getElementById("__print_frame__");
  if (existing) existing.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "__print_frame__";
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }, 1000);
}

export function downloadPDF(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===== تثبيت صف العنوان (Freeze Header Row) =====
export function freezeHeaderRow(ws: import("xlsx").WorkSheet, rows = 1) {
  (ws as any)["!views"] = [{ state: "frozen", xSplit: 0, ySplit: rows, topLeftCell: `A${rows + 1}`, activePane: "bottomLeft" }];
}
