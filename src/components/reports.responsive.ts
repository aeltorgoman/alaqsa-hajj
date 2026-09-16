// ============================================================
// طبقة الاستجابة لشاشة التقارير — نصّ CSS واحد لا أكثر
// ============================================================
/* كانت كلُّ شبكةٍ في الصفحة مكتوبةً في `style` بعددِ أعمدةٍ ثابت:
   ثلاثةٌ لكروت التقارير، وثلاثةٌ لمؤشّرات الباص والمخيّم، وأربعةٌ
   للفندق وللمستندات — فتحت ٩٠٠ بكسل تُدفَع الصفحةُ أفقياً.

   والعلاجُ CSS لا JavaScript: لا مستمعَ عرضٍ ولا حالةَ تُعاد، بل
   أصنافٌ تُلحَق بالشبكات القائمة وقواعدُ تتجاوزها عند الضيق.
   ونقاطُ الانكسار هي نفسها التي أُقرّت للمالية (٨٨٠ · ٥٢٠)، فلا
   يتعلّم الموظّف سلوكين.

   ⚠️ وكلُّ قاعدةٍ هنا داخل `@media` بلا استثناء: فوق ٨٨٠ بكسل لا
   شيء يتغيّر، وسطحُ المكتب يخرج كما كان بالبكسل. */
export const REPORTS_RESPONSIVE_CSS = `
/* الجداولُ العريضة تنزلق داخل حاويتها لا تدفع الصفحة */
.rep-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; min-width: 0; }

@media (max-width: 880px) {
  .rep-quick   { flex-wrap: wrap !important; }
  .rep-quick > div { flex: 1 1 260px !important; }
  .rep-cards   { grid-template-columns: repeat(2, 1fr) !important; }
  .rep-kpis    { grid-template-columns: repeat(2, 1fr) !important; }
  .rep-doc-grid{ grid-template-columns: repeat(2, 1fr) !important; }
  .rep-cols    { grid-template-columns: repeat(2, 1fr) !important; }
  .rep-pad     { padding: 12px !important; }
}

@media (max-width: 520px) {
  .rep-quick > div { flex: 1 1 100% !important; }
  .rep-cards   { grid-template-columns: 1fr !important; }
  .rep-kpis    { grid-template-columns: 1fr !important; }
  .rep-doc-grid{ grid-template-columns: 1fr !important; }
  .rep-cols    { grid-template-columns: 1fr !important; }
  .rep-actions { flex-wrap: wrap !important; }
  .rep-actions > button { flex: 1 1 100% !important; }
  .rep-pad     { padding: 10px !important; }
}
`;
