// ============================================================
// شاشة تفاصيل حساب الحاج الفردي — مكوّن عرض فقط
// لا يستورد Supabase ولا ينفّذ استعلامات ولا يحفظ ولا يحذف
// ============================================================
import type { CSSProperties } from "react";
import type { Passenger } from "../../types";
import type { PricingMap, Payment, CustomCharge, FinancialGroup } from "./finance.types";
import { getPriceInfo, chargesFor, paymentsFor, calcTotalDue, calcTotalPaid, fmtAmt, financeStatus } from "./finance.utils";

export type PassengerFinanceViewProps = {
  // بيانات الحاج
  passenger: Passenger;
  pricing: PricingMap;
  passengerPayments: Payment[];
  passengerCharges: CustomCharge[];
  group: FinancialGroup | null;
  groups: FinancialGroup[];

  // حالة تعديل السعر الخاص
  editingCustomPrice: boolean;
  customPriceInput: string;
  savingCustomPrice: boolean;

  // التنقّل والطباعة
  onBack: () => void;
  onPrintStatement: () => void;

  // السعر الخاص
  onEditCustomPrice: () => void;
  onCustomPriceInputChange: (value: string) => void;
  onSaveCustomPrice: () => void;
  onCancelEditCustomPrice: () => void;

  // الدفعات والبنود
  onAddPayment: () => void;
  onAddCharge: (type: "إضافة" | "خصم") => void;
  onOpenPayment: (payment: Payment) => void;
  onDeletePayment: (paymentId: number) => void;
  onDeleteCharge: (chargeId: number) => void;

  // المجموعة المالية
  onOpenGroup: (group: FinancialGroup) => void;
  onRemoveFromGroup: (groupId: number) => void;
  onCreateGroup: () => void;
  onAddToExistingGroup: () => void;

  // أنماط الجداول المشتركة مع بقية العروض
  tdStyle: CSSProperties;
};

export function PassengerFinanceView({
  passenger, pricing, passengerPayments, passengerCharges, group, groups,
  editingCustomPrice, customPriceInput, savingCustomPrice,
  onBack, onPrintStatement,
  onEditCustomPrice, onCustomPriceInputChange, onSaveCustomPrice, onCancelEditCustomPrice,
  onAddPayment, onAddCharge, onOpenPayment, onDeletePayment, onDeleteCharge,
  onOpenGroup, onRemoveFromGroup, onCreateGroup, onAddToExistingGroup,
  tdStyle,
}: PassengerFinanceViewProps) {
  const s=passenger.services;
  const priceInfo = getPriceInfo(s, pricing), pkgAmt = priceInfo.amount;
  const isSpecial = s.hotel_type === "خاص";
  const pPayments=[...paymentsFor(passenger.id, passengerPayments)].sort((a,b)=>new Date(a.payment_date).getTime()-new Date(b.payment_date).getTime());
  const pCustom=chargesFor(passenger.id, passengerCharges);
  const totalDue=calcTotalDue(passenger,pricing,passengerCharges), totalPaid=calcTotalPaid(passenger.id,passengerPayments), balance=totalDue-totalPaid;
  const st=financeStatus(totalDue,totalPaid);
  type AR={label:string;amount:number;isDiscount?:boolean};
  const addonRows:AR[]=[];
  if (s.hotel_view==="مطلة") addonRows.push({label:"إضافة مطلة",amount:pricing["addon_view"]?.amount||0});
  if (s.camp_mina==="خاص")  addonRows.push({label:"خيمة خاصة - منى",amount:pricing["addon_mina"]?.amount||0});
  if (s.camp_arafa==="خاص") addonRows.push({label:"خيمة خاصة - عرفة",amount:pricing["addon_arafa"]?.amount||0});
  if (s.bus==="VIP")         addonRows.push({label:"باص VIP",amount:pricing["addon_bus_vip"]?.amount||0});
  if ((passenger as any).flight_class==="درجة أولى") addonRows.push({label:"طيران درجة أولى",amount:pricing["addon_first_class"]?.amount||0});
  if ((passenger as any).flight_class==="بدون")      addonRows.push({label:"خصم بدون تذكرة",amount:pricing["discount_no_ticket"]?.amount||0,isDiscount:true});
  return (
    <div style={{ maxWidth:720, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <button onClick={()=>onBack()} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--primary)", fontSize:24 }}>←</button>
        <div>
          <div style={{ fontFamily:"var(--font-body)", fontSize:20, fontWeight:800, color:"var(--primary)" }}>{passenger.short_ar||passenger.name_ar}</div>
          <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>{priceInfo.label}{addonRows.filter(a=>!a.isDiscount).map(a=>` · ${a.label}`).join("")}</div>
        </div>
        <span style={{ marginRight:"auto", fontSize:12, padding:"4px 14px", borderRadius:99, background:st.bg, color:st.color, fontWeight:700 }}>{st.label}</span>
        <button onClick={()=>onPrintStatement()} style={{ padding:"6px 12px", background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontSize:12, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:5, fontFamily:"var(--font-body)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>طباعة</button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20 }}>
        {[{label:"المطلوب",value:fmtAmt(totalDue),color:"var(--text)"},{label:"المدفوع",value:fmtAmt(totalPaid),color:"var(--success)"},{label:"المتبقي",value:fmtAmt(balance),color:balance>0?"var(--danger)":"var(--success)"}].map(card=>(
          <div key={card.label} style={{ background:"var(--bg-card)", borderRadius:12, padding:"14px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}>
            <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{card.label}</div>
            <div style={{ fontSize:20, fontWeight:700, color:card.color }}>{card.value}</div>
            <div style={{ fontSize:10, color:"var(--text-muted)" }}>ر.ق</div>
          </div>
        ))}
      </div>
      <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)", marginBottom:16 }}>
        <div style={{ background:"var(--em8)", color:"#fff", padding:"10px 16px", fontWeight:700, fontSize:14 }}>كشف الحساب</div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"var(--bg-2)" }}>
              <th style={{ ...tdStyle, fontWeight:700, border:"1px solid var(--border)" }}>البيان</th>
              <th style={{ ...tdStyle, fontWeight:700, border:"1px solid var(--border)", textAlign:"center", color:"var(--danger)", width:130 }}>مدين (مطلوب)</th>
              <th style={{ ...tdStyle, fontWeight:700, border:"1px solid var(--border)", textAlign:"center", color:"var(--success)", width:130 }}>دائن (مدفوع)</th>
              <th style={{ ...tdStyle, fontWeight:700, border:"1px solid var(--border)", textAlign:"center", width:50 }}></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>
                {priceInfo.label}
                {priceInfo.unpriced && (
                  <span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, marginRight:6, background:"var(--danger-bg)", color:"var(--danger)" }}>يلزم مراجعة الحساب</span>
                )}
                {isSpecial && (
                  <span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, marginRight:6, background:"var(--warning-bg)", color:"var(--warning)" }}>سعر يدوي</span>
                )}
              </td>
              <td style={{ ...tdStyle, textAlign:"center", color:"var(--danger)", fontWeight:600 }}>
                {isSpecial && editingCustomPrice ? (
                  <div style={{ display:"flex", alignItems:"center", gap:6, justifyContent:"center" }}>
                    <input
                      type="number"
                      value={customPriceInput}
                      onChange={e=>onCustomPriceInputChange(e.target.value)}
                      onKeyDown={e=>{ if(e.key==="Enter") onSaveCustomPrice(); if(e.key==="Escape") onCancelEditCustomPrice(); }}
                      style={{ width:90, padding:"4px 8px", borderRadius:6, border:"1px solid var(--border)", fontFamily:"var(--font-body)", fontSize:13, textAlign:"center" }}
                      autoFocus
                    />
                    <button onClick={onSaveCustomPrice} disabled={savingCustomPrice} style={{ fontSize:10, padding:"3px 8px", borderRadius:6, border:"none", background:"var(--primary)", color:"#fff", cursor:"pointer", fontFamily:"var(--font-body)", fontWeight:700 }}>
                      {savingCustomPrice?"...":"حفظ"}
                    </button>
                  </div>
                ) : (
                  <span
                    onClick={isSpecial ? () => onEditCustomPrice() : undefined}
                    style={{ cursor: isSpecial ? "pointer" : "default", borderBottom: isSpecial ? "1px dashed var(--danger)" : "none" }}
                  >
                    {fmtAmt(pkgAmt)}
                  </span>
                )}
              </td>
              <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)" }}>—</td>
              <td style={tdStyle}></td>
            </tr>
            {addonRows.map((a,i)=>(
              <tr key={i} style={{ background:"var(--bg-2)" }}>
                <td style={tdStyle}>{a.label}{a.isDiscount&&<span style={{ fontSize:10, color:"var(--success)", background:"var(--success-bg)", padding:"1px 6px", borderRadius:99, marginRight:6 }}>خصم</span>}</td>
                <td style={{ ...tdStyle, textAlign:"center", color:a.isDiscount?"var(--success)":"var(--danger)", fontWeight:600 }}>{a.isDiscount?`(${fmtAmt(a.amount)})`:fmtAmt(a.amount)}</td>
                <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)" }}>—</td>
                <td style={tdStyle}></td>
              </tr>
            ))}
            {pCustom.map(c=>(
              <tr key={`cc-${c.id}`}>
                <td style={tdStyle}><span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, marginLeft:6, background:c.type==="إضافة"?"var(--warning-bg)":"var(--success-bg)", color:c.type==="إضافة"?"var(--warning)":"var(--success)" }}>{c.type==="إضافة"?"بند خاص":"خصم خاص"}</span>{c.description}{c.notes&&<span style={{ fontSize:10, color:"var(--text-muted)", marginRight:6 }}>({c.notes})</span>}</td>
                <td style={{ ...tdStyle, textAlign:"center", color:c.type==="إضافة"?"var(--danger)":"var(--success)", fontWeight:600 }}>{c.type==="إضافة"?fmtAmt(c.amount):`(${fmtAmt(c.amount)})`}</td>
                <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)" }}>—</td>
                <td style={{ ...tdStyle, textAlign:"center" }}><button onClick={()=>onDeleteCharge(c.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--danger)", fontSize:14 }}>✕</button></td>
              </tr>
            ))}
            {pPayments.map((py,i)=>(
              <tr key={`py-${py.id}`} onClick={() => onOpenPayment(py)} style={{ background:i%2===0?"var(--success-bg)":"var(--bg-card)", cursor:"pointer" }} title="اضغط لعرض التفاصيل">
                <td style={tdStyle}>دفعة — {py.payment_date} <span style={{ fontSize:10, color:"var(--text-muted)", marginRight:6 }}>({py.method})</span>{py.notes&&<span style={{ fontSize:10, color:"var(--text-muted)" }}>— {py.notes}</span>}</td>
                <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)" }}>—</td>
                <td style={{ ...tdStyle, textAlign:"center", color:"var(--success)", fontWeight:600 }}>{fmtAmt(py.amount)}</td>
                <td style={{ ...tdStyle, textAlign:"center" }}><button onClick={()=>onDeletePayment(py.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--danger)", fontSize:14 }}>✕</button></td>
              </tr>
            ))}
            <tr style={{ background:"var(--em8)", color:"#fff", fontWeight:700 }}>
              <td style={{ padding:"10px 12px" }}>الرصيد المتبقي</td>
              <td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(totalDue)}</td>
              <td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(totalPaid)}</td>
              <td style={{ padding:"10px 12px" }}></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ display:"flex", gap:10, marginBottom:16 }}>
        <button onClick={()=>onAddPayment()} style={{ flex:1, padding:10, background:"var(--success)", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>+ تسجيل دفعة</button>
        <button onClick={()=>onAddCharge("إضافة")} style={{ flex:1, padding:10, background:"var(--warning)", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>+ بند خاص</button>
        <button onClick={()=>onAddCharge("خصم")} style={{ flex:1, padding:10, background:"var(--danger)", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>− خصم خاص</button>
      </div>
      <div style={{ background:"var(--bg-card)", borderRadius:12, padding:16, boxShadow:"var(--shadow-sm)" }}>
        <div style={{ fontWeight:700, fontSize:13, color:"var(--text)", marginBottom:12 }}>المجموعة المالية</div>
        {group ? (
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:12, padding:"4px 12px", borderRadius:99, background:"rgba(125,31,60,0.08)", color:"var(--em7)", fontWeight:600 }}>{group.name}</span>
            <button onClick={()=>onOpenGroup(group)} style={{ padding:"4px 12px", background:"var(--em8)", color:"#fff", border:"none", borderRadius:6, fontSize:12, cursor:"pointer" }}>عرض حساب المجموعة</button>
            <button onClick={()=>onRemoveFromGroup(group.id)} style={{ padding:"4px 12px", background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:6, fontSize:12, cursor:"pointer", color:"var(--danger)", marginRight:"auto" }}>إزالة من المجموعة</button>
          </div>
        ) : (
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={()=>onCreateGroup()} style={{ padding:"6px 14px", background:"var(--primary)", color:"#fff", border:"none", borderRadius:8, fontSize:12, cursor:"pointer" }}>+ إنشاء مجموعة جديدة</button>
            {groups.length>0&&<button onClick={()=>onAddToExistingGroup()} style={{ padding:"6px 14px", background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontSize:12, cursor:"pointer" }}>إضافة إلى مجموعة موجودة</button>}
          </div>
        )}
      </div>
    </div>
  );
}
