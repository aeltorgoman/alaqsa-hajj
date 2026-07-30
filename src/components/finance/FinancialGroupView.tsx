// ============================================================
// شاشة المجموعة المالية — مكوّن عرض فقط
// لا يستورد Supabase ولا ينفّذ استعلامات ولا يحفظ ولا يحذف
// ============================================================
import type { CSSProperties } from "react";
import type { Passenger } from "../../types";
import type { PricingMap, Payment, CustomCharge, FinancialGroup, GroupPayForm } from "./finance.types";
import { calcTotalDue, calcTotalPaid, fmtAmt, financeStatus } from "./finance.utils";

export type FinancialGroupViewProps = {
  // بيانات المجموعة
  group: FinancialGroup;
  groupPassengers: Passenger[];
  availableToAdd: Passenger[];
  pricing: PricingMap;
  chargesByPassenger: Map<number, CustomCharge[]>;
  paymentsByPassenger: Map<number, Payment[]>;

  // الصلاحيات
  canManage: boolean;

  // حالة المودالات
  showAddMemberModal: boolean;
  showGroupPayModal: boolean;
  addingMemberId: number | null;
  groupPayForm: GroupPayForm;
  savingGroupPay: boolean;

  // التنقّل والطباعة
  onBack: () => void;
  onPrintGroupStatement: () => void;

  // إدارة المجموعة والأعضاء
  onDeleteGroup: (groupId: number) => void;
  onSelectPassenger: (passenger: Passenger) => void;
  onRemoveMember: (passengerId: number, groupId: number) => void;
  onAddMember: (groupId: number, passengerId: number) => void;

  // المودالات
  onOpenAddMemberModal: () => void;
  onCloseAddMemberModal: () => void;
  onOpenGroupPayModal: () => void;
  onCloseGroupPayModal: () => void;
  onGroupPayFormChange: (key: keyof GroupPayForm, value: string) => void;
  onSubmitGroupPayment: () => void;

  // أنماط الجداول المشتركة مع بقية العروض
  thStyle: CSSProperties;
  tdStyle: CSSProperties;
  inputStyle: CSSProperties;
};

export function FinancialGroupView({
  group, groupPassengers, availableToAdd, pricing, chargesByPassenger, paymentsByPassenger,
  canManage,
  showAddMemberModal, showGroupPayModal, addingMemberId, groupPayForm, savingGroupPay,
  onBack, onPrintGroupStatement,
  onDeleteGroup, onSelectPassenger, onRemoveMember, onAddMember,
  onOpenAddMemberModal, onCloseAddMemberModal, onOpenGroupPayModal, onCloseGroupPayModal,
  onGroupPayFormChange, onSubmitGroupPayment,
  thStyle, tdStyle, inputStyle,
}: FinancialGroupViewProps) {
  const gTotDue=groupPassengers.reduce((s,p)=>s+calcTotalDue(p,pricing,chargesByPassenger),0);
  const gTotPaid=groupPassengers.reduce((s,p)=>s+calcTotalPaid(p.id,paymentsByPassenger),0);
  const gTotBal=gTotDue-gTotPaid;
  const gSt=financeStatus(gTotDue,gTotPaid);
  return (
    <div style={{ maxWidth:720, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
        <button onClick={() => onBack()} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--primary)", fontSize:24 }}>←</button>
        <div>
          <div style={{ fontFamily:"var(--font-body)", fontSize:20, fontWeight:800, color:"var(--primary)" }}>{group.name}</div>
          <div style={{ fontSize:11, color:"var(--text-muted)" }}>{groupPassengers.length} أعضاء</div>
        </div>
        <span style={{ marginRight:"auto", fontSize:12, padding:"4px 14px", borderRadius:99, background:gSt.bg, color:gSt.color, fontWeight:700 }}>{gSt.label}</span>
        {canManage && <button onClick={() => onDeleteGroup(group.id)} style={{ padding:"6px 12px", background:"var(--danger-bg)", color:"var(--danger)", border:"1px solid var(--danger)", borderRadius:8, fontSize:12, cursor:"pointer" }}>حذف المجموعة</button>}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20 }}>
        {[{label:"إجمالي المطلوب",value:fmtAmt(gTotDue),color:"var(--text)"},{label:"إجمالي المدفوع",value:fmtAmt(gTotPaid),color:"var(--success)"},{label:"إجمالي المتبقي",value:fmtAmt(gTotBal),color:gTotBal>0?"var(--danger)":"var(--success)"}].map(card=>(
          <div key={card.label} style={{ background:"var(--bg-card)", borderRadius:12, padding:"14px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}>
            <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{card.label}</div>
            <div style={{ fontSize:20, fontWeight:700, color:card.color }}>{card.value}</div>
            <div style={{ fontSize:10, color:"var(--text-muted)" }}>ر.ق</div>
          </div>
        ))}
      </div>
      {canManage && (
      <div style={{ display:"flex", gap:10, marginBottom:16 }}>
        <button onClick={() => onOpenGroupPayModal()} style={{ flex:1, padding:10, background:"var(--success)", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>+ دفعة مشتركة تُوزَّع على الأعضاء</button>
        <button onClick={() => onOpenAddMemberModal()} style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer" }}>+ إضافة عضو</button>
      </div>
      )}
      <div style={{ display:"flex", gap:10, marginBottom:16 }}>
        <button onClick={()=>onPrintGroupStatement()} style={{ flex:1, padding:"8px", background:"var(--em8)", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>كشف حساب المجموعة</button>
      </div>
      <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
        <div style={{ background:"var(--em8)", color:"#fff", padding:"10px 16px", fontWeight:700, fontSize:14 }}>أعضاء المجموعة</div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr>
            <th style={thStyle}>الاسم</th>
            <th style={{ ...thStyle, textAlign:"center" }}>المطلوب</th>
            <th style={{ ...thStyle, textAlign:"center" }}>المدفوع</th>
            <th style={{ ...thStyle, textAlign:"center" }}>المتبقي</th>
            <th style={{ ...thStyle, textAlign:"center", width:80 }}>إجراء</th>
          </tr></thead>
          <tbody>
            {groupPassengers.map((p,i) => {
              const due=calcTotalDue(p,pricing,chargesByPassenger),paid=calcTotalPaid(p.id,paymentsByPassenger),bal=due-paid,st=financeStatus(due,paid);
              return (
                <tr key={p.id} style={{ background:i%2===0?"var(--bg-card)":"var(--bg-2)" }}>
                  <td style={tdStyle}><span style={{ cursor:"pointer", color:"var(--text)", fontWeight:600 }} onClick={()=>onSelectPassenger(p)}>{p.short_ar||p.name_ar}</span><span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, background:st.bg, color:st.color, marginRight:6 }}>{st.label}</span></td>
                  <td style={{ ...tdStyle, textAlign:"center", color:"var(--text)", fontWeight:600 }}>{fmtAmt(due)}</td>
                  <td style={{ ...tdStyle, textAlign:"center", color:"var(--success)", fontWeight:600 }}>{fmtAmt(paid)}</td>
                  <td style={{ ...tdStyle, textAlign:"center", color:bal>0?"var(--danger)":"var(--success)", fontWeight:600 }}>{fmtAmt(bal)}</td>
                  <td style={{ ...tdStyle, textAlign:"center" }}>{canManage && <button onClick={()=>onRemoveMember(p.id,group.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--danger)", fontSize:12 }}>إزالة</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* مودال: إضافة عضو للمجموعة */}
      {showAddMemberModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
          <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:360, boxShadow:"var(--shadow-xl)", maxHeight:"80vh", overflowY:"auto" }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:"var(--text)" }}>إضافة عضو إلى المجموعة</div>
            {availableToAdd.length === 0
              ? <div style={{ textAlign:"center", padding:20, color:"var(--text-muted)", fontSize:13 }}>لا يوجد حجاج متاحون للإضافة</div>
              : availableToAdd.map(p => (
                <div key={p.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
                  <span style={{ fontSize:13 }}>{p.short_ar||p.name_ar}</span>
                  <button
                    disabled={addingMemberId === p.id}
                    onClick={() => onAddMember(group.id, p.id)}
                    style={{ padding:"4px 14px", background:addingMemberId===p.id?"var(--bg-2)":"var(--primary)", color:addingMemberId===p.id?"var(--text-muted)":"#fff", border:"none", borderRadius:6, fontSize:12, cursor:addingMemberId===p.id?"not-allowed":"pointer" }}>
                    {addingMemberId===p.id?"جارٍ...":"إضافة"}
                  </button>
                </div>
              ))
            }
            <button onClick={()=>onCloseAddMemberModal()} style={{ width:"100%", marginTop:16, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer" }}>إغلاق</button>
          </div>
        </div>
      )}

      {/* مودال: دفعة مشتركة */}
      {showGroupPayModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
          <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:340, boxShadow:"var(--shadow-xl)" }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:4, color:"var(--success)" }}>دفعة مشتركة</div>
            <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:16 }}>ستُوزَّع على {groupPassengers.length} من الأعضاء ({groupPayForm.amount&&groupPassengers.length>0?fmtAmt(Math.floor(Number(groupPayForm.amount)*100/groupPassengers.length)/100):"0"} ر.ق للفرد تقريباً)</div>
            {([{label:"المبلغ الإجمالي",key:"amount",type:"number",ph:"0"},{label:"التاريخ",key:"payment_date",type:"date",ph:""},{label:"ملاحظات (اختياري)",key:"notes",type:"text",ph:"..."}] as { label:string; key:keyof GroupPayForm; type:string; ph:string }[]).map(f=>(
              <div key={f.key} style={{ marginBottom:12 }}>
                <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>{f.label}</div>
                <input type={f.type} min={f.type==="number"?0:undefined} placeholder={f.ph} value={groupPayForm[f.key]} onChange={e=>onGroupPayFormChange(f.key, e.target.value)} style={inputStyle} />
              </div>
            ))}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>طريقة الدفع</div>
              <select value={groupPayForm.method} onChange={e=>onGroupPayFormChange("method", e.target.value)} style={inputStyle}>
                {["نقدي","تحويل بنكي","شيك"].map(m=><option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={onSubmitGroupPayment} disabled={savingGroupPay} style={{ flex:1, padding:10, background:"var(--success)", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>{savingGroupPay?"جارٍ الحفظ...":"توزيع الدفعة"}</button>
              <button onClick={()=>onCloseGroupPayModal()} style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
