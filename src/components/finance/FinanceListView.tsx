// ============================================================
// شاشة القائمة الرئيسية للحسابات — مكوّن عرض فقط
// لا يستورد Supabase ولا ينفّذ استعلامات ولا يحمّل بيانات
// ============================================================
import type { CSSProperties } from "react";
import type { Passenger } from "../../types";
import type { PricingMap, Payment, CustomCharge, FinancialGroup, FinanceFilterStatus } from "./finance.types";
import { PRICING_KEYS, getPriceInfo, calcTotalDue, calcTotalPaid, fmtAmt, financeStatus } from "./finance.utils";

export type FinanceListViewProps = {
  // البيانات المُجهّزة
  sortedPassengers: Passenger[];
  filteredPassengers: Passenger[];
  pricing: PricingMap;
  chargesByPassenger: Map<number, CustomCharge[]>;
  paymentsByPassenger: Map<number, Payment[]>;
  getPassengerGroup: (passengerId: number) => FinancialGroup | null;

  // الحالة
  loading: boolean;
  refreshing: boolean;
  lastUpdated: Date | null;

  // البحث والفلاتر
  searchTerm: string;
  filterStatus: FinanceFilterStatus;
  filterPackage: string;
  onSearchTermChange: (value: string) => void;
  onFilterStatusChange: (value: FinanceFilterStatus) => void;
  onFilterPackageChange: (value: string) => void;
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

export function FinanceListView({
  sortedPassengers, filteredPassengers, pricing, chargesByPassenger, paymentsByPassenger, getPassengerGroup,
  loading, refreshing, lastUpdated,
  searchTerm, filterStatus, filterPackage,
  onSearchTermChange, onFilterStatusChange, onFilterPackageChange, onClearFilters,
  onRefresh, onOpenReports, onOpenSettings, onSelectPassenger, onSelectGroup,
  thStyle, tdStyle,
}: FinanceListViewProps) {
  const totDueAll=sortedPassengers.reduce((s,p)=>s+calcTotalDue(p,pricing,chargesByPassenger),0);
  const totPaidAll=sortedPassengers.reduce((s,p)=>s+calcTotalPaid(p.id,paymentsByPassenger),0);
  const lateCount=sortedPassengers.filter(p=>calcTotalDue(p,pricing,chargesByPassenger)>calcTotalPaid(p.id,paymentsByPassenger)).length;
  return (
    <>
      <div style={{ padding:"12px 20px", background:"var(--bg-card)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <div style={{ fontFamily:"var(--font-body)", fontSize:20, fontWeight:800, color:"var(--primary)" }}>الحسابات المالية</div>
        <div style={{ marginRight:"auto", display:"flex", gap:8, alignItems:"center" }}>
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
          <button onClick={()=>onOpenSettings()} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-2)", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer" }}>إعدادات الأسعار</button>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, padding:"12px 20px", flexShrink:0 }}>
        {[{label:"إجمالي المطلوب",value:fmtAmt(totDueAll),color:"var(--text)",unit:"ر.ق"},{label:"إجمالي المحصل",value:fmtAmt(totPaidAll),color:"var(--success)",unit:"ر.ق"},{label:"إجمالي المتبقي",value:fmtAmt(totDueAll-totPaidAll),color:"var(--danger)",unit:"ر.ق"},{label:"عدد المتأخرين",value:String(lateCount),color:"var(--warning)",unit:"حاج"}].map(card=>(
          <div key={card.label} style={{ background:"var(--bg-card)", borderRadius:12, padding:"14px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}><div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{card.label}</div><div style={{ fontSize:22, fontWeight:700, color:card.color }}>{card.value}</div><div style={{ fontSize:10, color:"var(--text-muted)" }}>{card.unit}</div></div>
        ))}
      </div>
      <div style={{ padding:"0 20px 12px", display:"flex", gap:10, flexShrink:0 }}>
        <input type="text" placeholder="🔍 بحث عن حاج..." value={searchTerm} onChange={e=>onSearchTermChange(e.target.value)} style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13 }} />
        <select value={filterStatus} onChange={e=>onFilterStatusChange(e.target.value as any)} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13, minWidth:120 }}>
          <option value="all">كل الحالات</option><option value="paid">مسدد</option><option value="partial">جزئي</option><option value="unpaid">لم يدفع</option><option value="unpriced">غير مسعّر</option><option value="credit">رصيد دائن</option>
        </select>
        <select value={filterPackage} onChange={e=>onFilterPackageChange(e.target.value)} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13, minWidth:130 }}>
          <option value="all">كل الباقات</option>
          {PRICING_KEYS.filter(k=>k.type==="package").map(pk=><option key={pk.key} value={pk.key}>{pk.label}</option>)}
        </select>
        {(searchTerm||filterStatus!=="all"||filterPackage!=="all")&&<button onClick={()=>onClearFilters()} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-2)", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer", color:"var(--danger)", whiteSpace:"nowrap" }}>✕ مسح</button>}
      </div>
      {loading?(
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-muted)" }}>جارٍ التحميل...</div>
      ):(
        <div style={{ flex:1, overflowY:"auto", padding:"0 20px 20px" }}>
          {filteredPassengers.length===0?(
            <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)", fontSize:14 }}>لا توجد نتائج مطابقة للبحث</div>
          ):(
            <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
              <div style={{ padding:"8px 16px", background:"var(--bg-2)", borderBottom:"1px solid var(--border)", fontSize:11, color:"var(--text-muted)" }}>عرض {filteredPassengers.length} من {sortedPassengers.length} حاج</div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead style={{ position:"sticky", top:0, zIndex:10 }}>
                  <tr>{["م","الاسم","الباقة","الإضافات","المطلوب","المدفوع","المتبقي","الحالة"].map(h=><th key={h} style={{ ...thStyle, textAlign:h==="م"?"center":"right" }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredPassengers.map((p,i)=>{
                    const due=calcTotalDue(p,pricing,chargesByPassenger),paid=calcTotalPaid(p.id,paymentsByPassenger),bal=due-paid,st=financeStatus(due,paid),s=p.services;
                    const badges:string[]=[];
                    if(s.hotel_view==="مطلة") badges.push("مطلة");
                    if(s.camp_mina==="خاص")  badges.push("منى خاص");
                    if(s.camp_arafa==="خاص") badges.push("عرفة خاص");
                    if(s.bus==="VIP")         badges.push("VIP");
                    if((p as any).flight_class==="درجة أولى") badges.push("درجة أولى");
                    if((p as any).flight_class==="بدون")      badges.push("بدون تذكرة");
                    const pGroup=getPassengerGroup(p.id);
                    return(
                      <tr key={p.id} onClick={()=>onSelectPassenger(p)} style={{ cursor:"pointer", background:i%2===0?"var(--bg-card)":"var(--bg-2)" }}>
                        <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)", fontSize:12 }}>{i+1}</td>
                        <td style={tdStyle}><div style={{ display:"flex", alignItems:"center", gap:6 }}>{p.short_ar||p.name_ar}{pGroup&&<span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, background:"rgba(125,31,60,0.1)", color:"var(--em7)", cursor:"pointer" }} onClick={e=>{e.stopPropagation();onSelectGroup(pGroup);}}>{pGroup.name}</span>}</div></td>
                        <td style={{ ...tdStyle, fontSize:11, color:"var(--text-muted)" }}>{getPriceInfo(s, pricing).label||"—"}</td>
                        <td style={tdStyle}><div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{badges.map(b=><span key={b} style={{ fontSize:10, padding:"1px 6px", borderRadius:99, background:"var(--warning-bg)", color:"var(--warning)" }}>{b}</span>)}</div></td>
                        <td style={{ ...tdStyle, textAlign:"center", color:"var(--text)", fontWeight:700 }}>{fmtAmt(due)}</td>
                        <td style={{ ...tdStyle, textAlign:"center", color:"var(--success)", fontWeight:700 }}>{fmtAmt(paid)}</td>
                        <td style={{ ...tdStyle, textAlign:"center", color:bal>0?"var(--danger)":"var(--success)", fontWeight:700 }}>{fmtAmt(bal)}</td>
                        <td style={{ ...tdStyle, textAlign:"center" }}><span style={{ fontSize:11, padding:"2px 10px", borderRadius:99, background:st.bg, color:st.color, fontWeight:700 }}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
