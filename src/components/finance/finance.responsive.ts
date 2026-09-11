// ============================================================
// طبقة الاستجابة لشاشات المالية — نصّ CSS واحد لا أكثر
// ============================================================
/* الجداول المالية ثمانية أعمدة ولا تُضغط بحقّ: تُحتوى أفقياً داخل
   حاويتها (`.fin-table-wrap`) فلا تدفع الصفحة كلّها. والبطاقات
   والشبكات الثلاثية تنهار إلى عمودين ثم عمودٍ واحد.
   والهيئة على الشاشة الواسعة لا تتغيّر: كل القواعد داخل `@media`. */
export const FINANCE_RESPONSIVE_CSS = `
/* الحاوية لا تتجاوز أباها بحال، ولو اضطرّ الجدول إلى عرضٍ أكبر انزلق
   داخلها — لا دافعاً للصفحة كلّها. */
.fin-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; min-width: 0; }
/* حدُّ العرض الأدنى لجدول القائمة وحده: ثمانية أعمدة لا تُقرأ أضيق منه.
   وجداولُ كشف الحساب وأعضاء المجموعة أقلُّ أعمدةً فتنضغط بحقّ. */
.fin-table-wide > table { min-width: 680px; }

@media (max-width: 880px) {
  .fin-cards  { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; padding: 10px 14px !important; }
  .fin-trio   { grid-template-columns: repeat(2, 1fr) !important; }
  .fin-topbar { flex-wrap: wrap !important; padding: 10px 14px !important; }
  .fin-topbar-actions { margin-right: 0 !important; width: 100%; }
  .fin-filters { padding: 0 14px 10px !important; }
  .fin-actions { flex-wrap: wrap !important; }
  .fin-actions > button { flex: 1 1 45% !important; }
  .fin-pad    { padding: 14px !important; }
}

@media (max-width: 520px) {
  .fin-cards { grid-template-columns: 1fr !important; }
  .fin-trio  { grid-template-columns: 1fr !important; }
  .fin-filters > select,
  .fin-filters > input { flex: 1 1 100% !important; min-width: 0 !important; }
  .fin-actions > button { flex: 1 1 100% !important; }
  .fin-pad   { padding: 10px !important; }
}
`;
