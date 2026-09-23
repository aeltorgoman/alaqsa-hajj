// ============================================================
// شاشة القائمة الرئيسية للحسابات — مكوّن عرض فقط
// لا يستورد Supabase ولا ينفّذ استعلامات ولا يحمّل بيانات
// ============================================================
import type { CSSProperties } from "react";
import type { Passenger } from "../../types";
import type { PricingMap, FinancialGroup, FinanceFilterStatus, FinanceTotals, FinanceSortKey, FinanceSortDir } from "./finance.types";
import { PRICING_KEYS, SERVICE_FILTERS, serviceLabel, SPECIAL_PACKAGE_VALUE, SPECIAL_PACKAGE_LABEL, getPriceInfo, paidFlightService, fmtAmt, financeStatus } from "./finance.utils";
import { FINANCE_RESPONSIVE_CSS } from "./finance.responsive";

export type FinanceListViewProps = {
  // البيانات المُجهّزة
  sortedPassengers: Passenger[];
  filteredPassengers: Passenger[];
  pricing: PricingMap;
  /* المطلوب والمدفوع والمتبقّي محسوبةٌ مرّةً واحدة لكل حاجّ في الحاوي */
  totalsByPassenger: Map<number, FinanceTotals>;
  summary: { due: number; paid: number; balance: number; lateCount: number };
  getPassengerGroup: (passengerId: number) => FinancialGroup | null;

  // الصلاحيات
  canManage: boolean;

  // الحالة
  loading: boolean;
  refreshing: boolean;
  lastUpdated: Date | null;
  /* خطأُ تحميلٍ باقٍ لا تنبيهٌ يُغلَق — ومعه طريقُ خروج */
  loadError: string | null;

  // البحث والفلاتر والترتيب
  searchTerm: string;
  filterStatus: FinanceFilterStatus;
  filterPackage: string;
  filterService: string;
  sortKey: FinanceSortKey;
  sortDir: FinanceSortDir;
  onSearchTermChange: (value: string) => void;
  onFilterStatusChange: (value: FinanceFilterStatus) => void;
  onFilterPackageChange: (value: string) => void;
  onFilterServiceChange: (value: string) => void;
  onSortChange: (key: FinanceSortKey) => void;
  onClearFilters: () => void;

  // الإجراءات
  onRefresh: () => void;
  onOpenReports: () => void;
  onOpenSettings: () => void;
  onSelectPassenger: (passenger: Passenger) => void;
  onSelectGroup: (group: FinancialGroup) => void;

  // أنماط الجداول المشتركة مع بقية العروض
  thStyle: CSSProperties;
  tdStyle: CSSProperties;
};

/* الأعمدة القابلة للترتيب — ومنها يُبنى رأس الجدول، فلا قائمةُ عناوين
   مكتوبةٌ على حدةٍ تنحرف عن مفاتيح الترتيب. */
const COLUMNS: { label: string; key?: FinanceSortKey; center?: boolean }[] = [
  { label: "م", center: true },
  { label: "الاسم", key: "name" },
  { label: "الباقة" },
  { label: "الإضافات" },
  { label: "المطلوب", key: "due",     center: true },
  { label: "المدفوع", key: "paid",    center: true },
  { label: "المتبقي", key: "balance", center: true },
  { label: "الحالة", center: true },
];

export function FinanceListView({
  sortedPassengers, filteredPassengers, pricing, totalsByPassenger, summary, getPassengerGroup,
  canManage,
  loading, refreshing, lastUpdated, loadError,
  searchTerm, filterStatus, filterPackage, filterService, sortKey, sortDir,
  onSearchTermChange, onFilterStatusChange, onFilterPackageChange, onFilterServiceChange, onSortChange, onClearFilters,
  onRefresh, onOpenReports, onOpenSettings, onSelectPassenger, onSelectGroup,
  thStyle, tdStyle,
}: FinanceListViewProps) {
  const filtersOn = !!searchTerm || filterStatus !== "all" || filterPackage !== "all" || filterService !== "all";
  const cards = [
    { label:"إجمالي المطلوب", value:fmtAmt(summary.due),     color:"var(--text)",    unit:"ر.ق" },
    { label:"إجمالي المحصل",  value:fmtAmt(summary.paid),    color:"var(--success)", unit:"ر.ق" },
    { label:"إجمالي المتبقي", value:fmtAmt(summary.balance), color:"var(--danger)",  unit:"ر.ق" },
    { label:"عدد المتأخرين",  value:String(summary.lateCount), color:"var(--warning)", unit:"حاج" },
  ];
  return (
    <>
      <style>{FINANCE_RESPONSIVE_CSS}</style>
      <div className="fin-topbar" style={{ padding:"12px 20px", background:"var(--bg-card)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <div style={{ fontFamily:"var(--font-body)", fontSize:20, fontWeight:800, color:"var(--primary)" }}>الحسابات المالية</div>
        <div className="fin-topbar-actions" style={{ marginRight:"auto", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {lastUpdated && (
            <span style={{ fontSize:11, color:"var(--text-muted)" }}>
              آخر تحديث: {lastUpdated.toLocaleTimeString("ar-EG", { hour:"2-digit", minute:"2-digit" })}
            </span>
          )}
          <button onClick={()=>onRefresh()} disabled={refreshing} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-2)", fontFamily:"var(--font-body)", fontSize:12, cursor:refreshing?"not-allowed":"pointer", display:"inline-flex", alignItems:"center", gap:6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>
            {refreshing?"جارٍ التحديث...":"تحديث البيانات"}
          </button>
          <button onClick={()=>onOpenReports()} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-2)", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer" }}>التقارير</button>
          {canManage && <button onClick={()=>onOpenSettings()} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-2)", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer" }}>إعدادات الأسعار</button>}
        </div>
      </div>

      {/* خطأُ التحميل يبقى معروضاً حتى يُعاد التحميل بنجاح — لا تنبيهٌ يُغلَق فتبقى أرقامٌ ناقصة بلا أثر */}
      {loadError && (
        <div style={{ margin:"12px 20px 0", padding:"11px 14px", borderRadius:10, background:"var(--danger-bg)", border:"1px solid var(--danger)", color:"var(--danger)", fontSize:12.5, fontWeight:600, lineHeight:1.7, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink:0 }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
          <span style={{ flex:1, minWidth:180 }}>{loadError}</span>
          <button onClick={()=>onRefresh()} disabled={refreshing} style={{ padding:"5px 14px", borderRadius:8, border:"none", background:"var(--danger)", color:"var(--text-inverse)", fontFamily:"var(--font-body)", fontSize:12, fontWeight:700, cursor:refreshing?"not-allowed":"pointer", whiteSpace:"nowrap" }}>
            {refreshing?"جارٍ المحاولة...":"إعادة المحاولة"}
          </button>
        </div>
      )}

      <div className="fin-cards" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, padding:"12px 20px", flexShrink:0 }}>
        {cards.map(card=>(
          <div key={card.label} style={{ background:"var(--bg-card)", borderRadius:12, padding:"14px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}><div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{card.label}</div><div style={{ fontSize:22, fontWeight:700, color:card.color }}>{card.value}</div><div style={{ fontSize:10, color:"var(--text-muted)" }}>{card.unit}</div></div>
        ))}
      </div>

      <div className="fin-filters" style={{ padding:"0 20px 12px", display:"flex", gap:10, flexShrink:0, flexWrap:"wrap" }}>
        <input type="text" placeholder="🔍 بحث بالاسم أو الجواز أو البطاقة أو الهاتف..." value={searchTerm} onChange={e=>onSearchTermChange(e.target.value)} style={{ flex:1, minWidth:160, padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13 }} />
        <select value={filterStatus} onChange={e=>onFilterStatusChange(e.target.value as FinanceFilterStatus)} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13, minWidth:120 }}>
          <option value="all">كل الحالات</option><option value="paid">مسدد</option><option value="partial">جزئي</option><option value="unpaid">لم يدفع</option><option value="unpriced">غير مسعّر</option><option value="credit">رصيد دائن</option>
        </select>
        <select value={filterPackage} onChange={e=>onFilterPackageChange(e.target.value)} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13, minWidth:130 }}>
          <option value="all">كل الباقات</option>
          {PRICING_KEYS.filter(k=>k.type==="package").map(pk=><option key={pk.key} value={pk.key}>{pk.label}</option>)}
          {/* الإقامة «خاص» سعرُها يدويّ فلا مفتاحَ باقةٍ لها — وتُفرَز بقيمتها الخاصّة */}
          <option value={SPECIAL_PACKAGE_VALUE}>{SPECIAL_PACKAGE_LABEL}</option>
        </select>
        {/* محدّدٌ واحد للخدمات المطلوبة — مفاتيحُ التسعير نفسها وتسميتُها الحيّة */}
        <select value={filterService} onChange={e=>onFilterServiceChange(e.target.value)} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13, minWidth:150 }}>
          <option value="all">كل الخدمات</option>
          {SERVICE_FILTERS.map(f=><option key={f.key} value={f.key}>{serviceLabel(f.key, pricing)}</option>)}
        </select>
        {filtersOn&&<button onClick={()=>onClearFilters()} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-2)", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer", color:"var(--danger)", whiteSpace:"nowrap" }}>✕ مسح</button>}
      </div>

      {loading?(
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-muted)" }}>جارٍ التحميل...</div>
      ):(
        <div style={{ flex:1, overflowY:"auto", padding:"0 20px 20px" }}>
          {/* «لا حجّاج» حقيقةٌ عن الموسم، و«لا نتائج» حقيقةٌ عن البحث — ولا تُقال إحداهما مكان الأخرى */}
          {sortedPassengers.length===0?(
            <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)", fontSize:14, lineHeight:2 }}>
              <div style={{ fontSize:15, fontWeight:700, color:"var(--text)" }}>لا يوجد حجّاج في هذا الموسم</div>
              <div>تُضاف الحسابات تلقائياً مع تسجيل الحجّاج — لا شيء يُنشأ من هذه الشاشة.</div>
            </div>
          ):filteredPassengers.length===0?(
            <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)", fontSize:14, lineHeight:2 }}>
              <div style={{ fontSize:15, fontWeight:700, color:"var(--text)" }}>لا نتائج مطابقة</div>
              <div>من أصل {sortedPassengers.length} حاجّ، لا أحد يطابق البحث أو الفلاتر الحالية.</div>
              {filtersOn&&<button onClick={()=>onClearFilters()} style={{ marginTop:8, padding:"6px 16px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-2)", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer", color:"var(--danger)" }}>✕ مسح الفلاتر</button>}
            </div>
          ):(
            <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
              <div style={{ padding:"8px 16px", background:"var(--bg-2)", borderBottom:"1px solid var(--border)", fontSize:11, color:"var(--text-muted)" }}>عرض {filteredPassengers.length} من {sortedPassengers.length} حاج</div>
              <div className="fin-table-wrap fin-table-wide">
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead style={{ position:"sticky", top:0, zIndex:10 }}>
                  <tr>{COLUMNS.map(c=>{
                    const active = !!c.key && sortKey === c.key;
                    return (
                      <th key={c.label} style={{ ...thStyle, textAlign:c.center?"center":"right", cursor:c.key?"pointer":"default", userSelect:"none", whiteSpace:"nowrap" }}
                        onClick={c.key?()=>onSortChange(c.key as FinanceSortKey):undefined}
                        title={c.key?"اضغط للترتيب":undefined}>
                        {c.label}
                        {c.key && <span style={{ marginRight:4, opacity:active?1:0.35, fontSize:10 }}>{active ? (sortDir==="asc"?"▲":"▼") : "↕"}</span>}
                      </th>
                    );
                  })}</tr>
                </thead>
                <tbody>
                  {filteredPassengers.map((p,i)=>{
                    const t=totalsByPassenger.get(p.id) ?? { due:0, paid:0, balance:0 };
                    const st=financeStatus(t.due,t.paid),s=p.services;
                    const badges:string[]=[];
                    if(s.hotel_view==="مطلة") badges.push("مطلة");
                    if(s.camp_mina==="خاص")  badges.push("منى خاص");
                    if(s.camp_arafa==="خاص") badges.push("عرفة خاص");
                    if(s.bus==="VIP")         badges.push("VIP");
                    /* الطيران من الخدمة المطلوبة — هي ما تُحسب به الأرقام في الصفّ نفسه */
                    const fp=paidFlightService(p);
                    if(fp==="درجة أولى") badges.push("درجة أولى");
                    if(fp==="بدون")      badges.push("بدون تذكرة");
                    const pGroup=getPassengerGroup(p.id);
                    return(
                      <tr key={p.id} onClick={()=>onSelectPassenger(p)} style={{ cursor:"pointer", background:i%2===0?"var(--bg-card)":"var(--bg-2)" }}>
                        <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)", fontSize:12 }}>{i+1}</td>
                        <td style={tdStyle}><div style={{ display:"flex", alignItems:"center", gap:6 }}>{p.short_ar||p.name_ar}{pGroup&&<span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, background:"rgba(125,31,60,0.1)", color:"var(--em7)", cursor:"pointer" }} onClick={e=>{e.stopPropagation();onSelectGroup(pGroup);}}>{pGroup.name}</span>}</div></td>
                        <td style={{ ...tdStyle, fontSize:11, color:"var(--text-muted)" }}>{getPriceInfo(s, pricing).label||"—"}</td>
                        <td style={tdStyle}><div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{badges.map(b=><span key={b} style={{ fontSize:10, padding:"1px 6px", borderRadius:99, background:"var(--warning-bg)", color:"var(--warning)" }}>{b}</span>)}</div></td>
                        <td style={{ ...tdStyle, textAlign:"center", color:"var(--text)", fontWeight:700 }}>{fmtAmt(t.due)}</td>
                        <td style={{ ...tdStyle, textAlign:"center", color:"var(--success)", fontWeight:700 }}>{fmtAmt(t.paid)}</td>
                        <td style={{ ...tdStyle, textAlign:"center", color:t.balance>0?"var(--danger)":"var(--success)", fontWeight:700 }}>{fmtAmt(t.balance)}</td>
                        <td style={{ ...tdStyle, textAlign:"center" }}><span style={{ fontSize:11, padding:"2px 10px", borderRadius:99, background:st.bg, color:st.color, fontWeight:700 }}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
