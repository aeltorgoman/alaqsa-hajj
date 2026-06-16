import { useState, useEffect } from "react";
import type React from "react";
import { supabase } from "../supabase";
import type { Passenger, User } from "../types";

// ============================================================
// صفحة الحسابات المالية
// ============================================================
type PricingMap = Record<string, { label: string; amount: number; type: string }>;
type Payment = { id: number; passenger_id: number; amount: number; payment_date: string; method: string; notes?: string; created_by?: string; created_at: string };
type CustomCharge = { id: number; passenger_id: number; description: string; amount: number; type: "إضافة" | "خصم"; notes?: string; created_by?: string; created_at: string };

const PRICING_KEYS = [
  { key: "package_double",    label: "باقة ثنائي",          type: "package"  },
  { key: "package_triple",    label: "باقة ثلاثي",          type: "package"  },
  { key: "package_quad",      label: "باقة رباعي",          type: "package"  },
  { key: "package_suite",     label: "باقة سويت",           type: "package"  },
  { key: "addon_view",        label: "إضافة مطلة",          type: "addon"    },
  { key: "addon_mina",        label: "خيمة خاصة - منى",    type: "addon"    },
  { key: "addon_arafa",       label: "خيمة خاصة - عرفة",   type: "addon"    },
  { key: "addon_bus_vip",     label: "باص VIP",             type: "addon"    },
  { key: "addon_first_class", label: "طيران درجة أولى",     type: "addon"    },
  { key: "discount_no_ticket",label: "خصم بدون تذكرة",      type: "discount" },
];

function getPackageKey(hotel_type: string): string {
  if (hotel_type === "ثنائية") return "package_double";
  if (hotel_type === "ثلاثية") return "package_triple";
  if (hotel_type === "رباعية") return "package_quad";
  if (hotel_type === "سويت")   return "package_suite";
  return "package_double";
}

function calcTotalDue(p: Passenger, pricing: PricingMap, custom: CustomCharge[]): number {
  const s = p.services;
  let total = pricing[getPackageKey(s.hotel_type)]?.amount || 0;
  if (s.hotel_view === "مطلة")  total += pricing["addon_view"]?.amount || 0;
  if (s.camp_mina === "خاص")   total += pricing["addon_mina"]?.amount || 0;
  if (s.camp_arafa === "خاص")  total += pricing["addon_arafa"]?.amount || 0;
  if (s.bus === "VIP")          total += pricing["addon_bus_vip"]?.amount || 0;
  if ((p as any).flight_class === "درجة أولى") total += pricing["addon_first_class"]?.amount || 0;
  if ((p as any).flight_class === "بدون")      total -= pricing["discount_no_ticket"]?.amount || 0;
  custom.filter(c => c.passenger_id === p.id).forEach(c => {
    if (c.type === "إضافة") total += c.amount; else total -= c.amount;
  });
  return Math.max(0, total);
}

function calcTotalPaid(passengerId: number, payments: Payment[]): number {
  return payments.filter(p => p.passenger_id === passengerId).reduce((s, p) => s + Number(p.amount), 0);
}

function fmtAmt(n: number): string {
  return n.toLocaleString("ar-QA", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function financeStatus(due: number, paid: number) {
  if (paid >= due && due > 0) return { label: "مسدد",    color: "var(--success)", bg: "var(--success-bg)" };
  if (paid > 0)               return { label: "جزئي",    color: "var(--warning)", bg: "var(--warning-bg)" };
  return                             { label: "لم يدفع", color: "var(--danger)",  bg: "var(--danger-bg)"  };
}

export function FinancePage({ passengers, currentUser }: { passengers: Passenger[]; currentUser: User }) {
  const [subView, setSubView] = useState<"list" | "detail" | "settings" | "reports">("list");
  const [selectedP, setSelectedP] = useState<Passenger | null>(null);
  const [pricing, setPricing] = useState<PricingMap>({});
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customCharges, setCustomCharges] = useState<CustomCharge[]>([]);
  const [loading, setLoading] = useState(true);

  // payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", payment_date: new Date().toISOString().split("T")[0], method: "نقدي", notes: "" });
  const [savingPay, setSavingPay] = useState(false);

  // custom charge modal
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [chargeType, setChargeType] = useState<"إضافة" | "خصم">("إضافة");
  const [chargeForm, setChargeForm] = useState({ description: "", amount: "", notes: "" });
  const [savingCharge, setSavingCharge] = useState(false);

  // settings
  const [editPricing, setEditPricing] = useState<Record<string, string>>({});
  const [savingPricing, setSavingPricing] = useState(false);

  // reports
  const [reportType, setReportType] = useState<"full" | "late" | "payments" | "packages" | "addons">("full");

  useEffect(() => { loadFinanceData(); }, []);

  async function loadFinanceData() {
    setLoading(true);
    const [pRes, pyRes, ccRes] = await Promise.all([
      supabase.from("pricing_settings").select("*"),
      supabase.from("payments").select("*").order("payment_date", { ascending: false }),
      supabase.from("custom_charges").select("*"),
    ]);
    if (pRes.data) {
      const map: PricingMap = {};
      const em: Record<string, string> = {};
      pRes.data.forEach((r: any) => {
        map[r.key] = { label: r.label, amount: Number(r.amount), type: r.type };
        em[r.key] = String(r.amount);
      });
      setPricing(map);
      setEditPricing(em);
    }
    if (pyRes.data) setPayments(pyRes.data as Payment[]);
    if (ccRes.data) setCustomCharges(ccRes.data as CustomCharge[]);
    setLoading(false);
  }

  async function savePricing() {
    setSavingPricing(true);
    for (const key of Object.keys(editPricing)) {
      await supabase.from("pricing_settings")
        .update({ amount: Number(editPricing[key]), updated_at: new Date().toISOString() })
        .eq("key", key);
    }
    await loadFinanceData();
    setSavingPricing(false);
    alert("تم حفظ الأسعار بنجاح");
  }

  async function addPayment() {
    if (!selectedP || !payForm.amount) return;
    setSavingPay(true);
    const rec = {
      passenger_id: selectedP.id,
      amount: Number(payForm.amount),
      payment_date: payForm.payment_date,
      method: payForm.method,
      notes: payForm.notes,
      created_by: (currentUser as any).username || "",
    };
    const { data, error } = await supabase.from("payments").insert(rec).select().single();
    if (!error && data) {
      setPayments(prev => [data as Payment, ...prev]);
      setShowPayModal(false);
      setPayForm({ amount: "", payment_date: new Date().toISOString().split("T")[0], method: "نقدي", notes: "" });
    }
    setSavingPay(false);
  }

  async function deletePayment(id: number) {
    if (!confirm("هل تريد حذف هذه الدفعة؟")) return;
    await supabase.from("payments").delete().eq("id", id);
    setPayments(prev => prev.filter(p => p.id !== id));
  }

  async function addCustomCharge() {
    if (!selectedP || !chargeForm.description || !chargeForm.amount) return;
    setSavingCharge(true);
    const rec = {
      passenger_id: selectedP.id,
      description: chargeForm.description,
      amount: Number(chargeForm.amount),
      type: chargeType,
      notes: chargeForm.notes,
      created_by: (currentUser as any).username || "",
    };
    const { data, error } = await supabase.from("custom_charges").insert(rec).select().single();
    if (!error && data) {
      setCustomCharges(prev => [...prev, data as CustomCharge]);
      setShowChargeModal(false);
      setChargeForm({ description: "", amount: "", notes: "" });
    }
    setSavingCharge(false);
  }

  async function deleteCustomCharge(id: number) {
    if (!confirm("هل تريد حذف هذا البند؟")) return;
    await supabase.from("custom_charges").delete().eq("id", id);
    setCustomCharges(prev => prev.filter(c => c.id !== id));
  }

  const sortedPassengers = [...passengers].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--bg-input)",
    fontFamily: "var(--font-body)", fontSize: 13, boxSizing: "border-box" as any,
  };
  const thStyle: React.CSSProperties = {
    padding: "10px 12px", background: "var(--em8)", color: "#fff",
    textAlign: "right", fontSize: 12, fontWeight: 600,
  };
  const tdStyle: React.CSSProperties = {
    padding: "8px 12px", border: "1px solid var(--border)", fontSize: 13,
  };

  // ══════════════════════════════════════════════
  // SETTINGS VIEW
  // ══════════════════════════════════════════════
  if (subView === "settings") return (
    <div style={{ padding: 20, maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button onClick={() => setSubView("list")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 24 }}>←</button>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600, color: "var(--em8)" }}>إعدادات الأسعار</div>
      </div>
      {(["package", "addon", "discount"] as const).map(type => (
        <div key={type} style={{ background: "var(--bg-card)", borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: "var(--shadow-sm)" }}>
          <div style={{ fontWeight: 700, color: "var(--em8)", marginBottom: 12, fontSize: 14, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
            {type === "package" ? "الباقات الأساسية" : type === "addon" ? "الإضافات" : "الخصومات"}
          </div>
          {PRICING_KEYS.filter(k => k.type === type).map(k => (
            <div key={k.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1, fontSize: 13 }}>{k.label}</div>
              <input
                type="number" min="0"
                value={editPricing[k.key] || "0"}
                onChange={e => setEditPricing(prev => ({ ...prev, [k.key]: e.target.value }))}
                style={{ width: 130, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-input)", textAlign: "center", fontSize: 13 }}
              />
              <span style={{ fontSize: 12, color: "var(--text-muted)", width: 24 }}>ر.ق</span>
            </div>
          ))}
        </div>
      ))}
      <button onClick={savePricing} disabled={savingPricing}
        style={{ width: "100%", padding: 12, background: "var(--primary)", color: "#fff", border: "none", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 14, cursor: "pointer", fontWeight: 600 }}>
        {savingPricing ? "جارٍ الحفظ..." : "حفظ الأسعار"}
      </button>
    </div>
  );

  // ══════════════════════════════════════════════
  // DETAIL VIEW
  // ══════════════════════════════════════════════
  if (subView === "detail" && selectedP) {
    const s = selectedP.services;
    const pkgKey = getPackageKey(s.hotel_type);
    const pkgAmt = pricing[pkgKey]?.amount || 0;
    const pPayments = [...payments.filter(p => p.passenger_id === selectedP.id)]
      .sort((a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime());
    const pCustom = customCharges.filter(c => c.passenger_id === selectedP.id);
    const totalDue = calcTotalDue(selectedP, pricing, customCharges);
    const totalPaid = calcTotalPaid(selectedP.id, payments);
    const balance = totalDue - totalPaid;
    const st = financeStatus(totalDue, totalPaid);

    type AddonRow = { label: string; amount: number; isDiscount?: boolean };
    const addonRows: AddonRow[] = [];
    if (s.hotel_view === "مطلة")  addonRows.push({ label: "إضافة مطلة",          amount: pricing["addon_view"]?.amount || 0 });
    if (s.camp_mina === "خاص")   addonRows.push({ label: "خيمة خاصة - منى",    amount: pricing["addon_mina"]?.amount || 0 });
    if (s.camp_arafa === "خاص")  addonRows.push({ label: "خيمة خاصة - عرفة",   amount: pricing["addon_arafa"]?.amount || 0 });
    if (s.bus === "VIP")          addonRows.push({ label: "باص VIP",             amount: pricing["addon_bus_vip"]?.amount || 0 });
    if ((selectedP as any).flight_class === "درجة أولى") addonRows.push({ label: "طيران درجة أولى", amount: pricing["addon_first_class"]?.amount || 0 });
    if ((selectedP as any).flight_class === "بدون")      addonRows.push({ label: "خصم بدون تذكرة", amount: pricing["discount_no_ticket"]?.amount || 0, isDiscount: true });

    return (
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {/* رأس الصفحة */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <button onClick={() => { setSubView("list"); setSelectedP(null); }}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 24 }}>←</button>
            <div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 700, color: "var(--em8)" }}>
                {selectedP.short_ar || selectedP.name_ar}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                {pricing[pkgKey]?.label}
                {addonRows.filter(a => !a.isDiscount).map(a => ` · ${a.label}`).join("")}
              </div>
            </div>
            <span style={{ marginRight: "auto", fontSize: 12, padding: "4px 14px", borderRadius: 99, background: st.bg, color: st.color, fontWeight: 700 }}>{st.label}</span>
          </div>

          {/* بطاقات الملخص */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[
              { label: "المطلوب",  value: fmtAmt(totalDue),  color: "var(--em8)"                              },
              { label: "المدفوع",  value: fmtAmt(totalPaid), color: "var(--success)"                          },
              { label: "المتبقي",  value: fmtAmt(balance),   color: balance > 0 ? "var(--danger)" : "var(--success)" },
            ].map(card => (
              <div key={card.label} style={{ background: "var(--bg-card)", borderRadius: 12, padding: "14px 16px", textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{card.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>ر.ق</div>
              </div>
            ))}
          </div>

          {/* كشف الحساب */}
          <div style={{ background: "var(--bg-card)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-sm)", marginBottom: 16 }}>
            <div style={{ background: "var(--em8)", color: "#fff", padding: "10px 16px", fontWeight: 700, fontSize: 14 }}>كشف الحساب</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-2)" }}>
                  <th style={{ ...tdStyle, fontWeight: 700, border: "1px solid var(--border)" }}>البيان</th>
                  <th style={{ ...tdStyle, fontWeight: 700, border: "1px solid var(--border)", textAlign: "center", color: "var(--danger)", width: 130 }}>مدين (مطلوب)</th>
                  <th style={{ ...tdStyle, fontWeight: 700, border: "1px solid var(--border)", textAlign: "center", color: "var(--success)", width: 130 }}>دائن (مدفوع)</th>
                  <th style={{ ...tdStyle, fontWeight: 700, border: "1px solid var(--border)", textAlign: "center", width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {/* الباقة */}
                <tr>
                  <td style={tdStyle}>{pricing[pkgKey]?.label || "الباقة الأساسية"}</td>
                  <td style={{ ...tdStyle, textAlign: "center", color: "var(--danger)", fontWeight: 600 }}>{fmtAmt(pkgAmt)}</td>
                  <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)" }}>—</td>
                  <td style={tdStyle}></td>
                </tr>
                {/* الإضافات */}
                {addonRows.map((a, i) => (
                  <tr key={i} style={{ background: "var(--bg-2)" }}>
                    <td style={tdStyle}>
                      {a.label}
                      {a.isDiscount && <span style={{ fontSize: 10, color: "var(--success)", background: "var(--success-bg)", padding: "1px 6px", borderRadius: 99, marginRight: 6 }}>خصم</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", color: a.isDiscount ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                      {a.isDiscount ? `(${fmtAmt(a.amount)})` : fmtAmt(a.amount)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)" }}>—</td>
                    <td style={tdStyle}></td>
                  </tr>
                ))}
                {/* البنود الخاصة */}
                {pCustom.map((c) => (
                  <tr key={`cc-${c.id}`}>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, marginLeft: 6, background: c.type === "إضافة" ? "var(--warning-bg)" : "var(--success-bg)", color: c.type === "إضافة" ? "var(--warning)" : "var(--success)" }}>
                        {c.type === "إضافة" ? "بند خاص" : "خصم خاص"}
                      </span>
                      {c.description}
                      {c.notes && <span style={{ fontSize: 10, color: "var(--text-muted)", marginRight: 6 }}>({c.notes})</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", color: c.type === "إضافة" ? "var(--danger)" : "var(--success)", fontWeight: 600 }}>
                      {c.type === "إضافة" ? fmtAmt(c.amount) : `(${fmtAmt(c.amount)})`}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)" }}>—</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <button onClick={() => deleteCustomCharge(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 14, padding: 2 }}>✕</button>
                    </td>
                  </tr>
                ))}
                {/* الدفعات */}
                {pPayments.map((py, i) => (
                  <tr key={`py-${py.id}`} style={{ background: i % 2 === 0 ? "#f0faf5" : "white" }}>
                    <td style={tdStyle}>
                      دفعة — {py.payment_date}
                      <span style={{ fontSize: 10, color: "var(--text-muted)", marginRight: 6 }}>({py.method})</span>
                      {py.notes && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>— {py.notes}</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)" }}>—</td>
                    <td style={{ ...tdStyle, textAlign: "center", color: "var(--success)", fontWeight: 600 }}>{fmtAmt(py.amount)}</td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <button onClick={() => deletePayment(py.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 14, padding: 2 }}>✕</button>
                    </td>
                  </tr>
                ))}
                {/* إجمالي */}
                <tr style={{ background: "var(--em8)", color: "#fff", fontWeight: 700 }}>
                  <td style={{ padding: "10px 12px" }}>الرصيد المتبقي</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>{fmtAmt(totalDue)}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>{fmtAmt(totalPaid)}</td>
                  <td style={{ padding: "10px 12px" }}></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* أزرار الإجراءات */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setShowPayModal(true)}
              style={{ flex: 1, padding: 10, background: "var(--success)", color: "#fff", border: "none", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              + تسجيل دفعة
            </button>
            <button onClick={() => { setChargeType("إضافة"); setChargeForm({ description: "", amount: "", notes: "" }); setShowChargeModal(true); }}
              style={{ flex: 1, padding: 10, background: "var(--warning)", color: "#fff", border: "none", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              + بند خاص
            </button>
            <button onClick={() => { setChargeType("خصم"); setChargeForm({ description: "", amount: "", notes: "" }); setShowChargeModal(true); }}
              style={{ flex: 1, padding: 10, background: "var(--danger)", color: "#fff", border: "none", borderRadius: 10, fontFamily: "var(--font-body)", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              + خصم خاص
            </button>
          </div>
        </div>

        {/* Modal: دفعة */}
        {showPayModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 24, width: 340, boxShadow: "var(--shadow-xl)" }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, color: "var(--success)" }}>تسجيل دفعة جديدة</div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>المبلغ</div>
                <input type="number" min="0" placeholder="0" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>التاريخ</div>
                <input type="date" value={payForm.payment_date} onChange={e => setPayForm(p => ({ ...p, payment_date: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>طريقة الدفع</div>
                <select value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method: e.target.value }))} style={inputStyle}>
                  {["نقدي", "تحويل بنكي", "شيك"].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>ملاحظات (اختياري)</div>
                <input type="text" placeholder="..." value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={addPayment} disabled={savingPay}
                  style={{ flex: 1, padding: 10, background: "var(--success)", color: "#fff", border: "none", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 13, cursor: "pointer" }}>
                  {savingPay ? "جارٍ الحفظ..." : "حفظ"}
                </button>
                <button onClick={() => setShowPayModal(false)}
                  style={{ flex: 1, padding: 10, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 13, cursor: "pointer" }}>
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: بند خاص / خصم */}
        {showChargeModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: "var(--bg-card)", borderRadius: 16, padding: 24, width: 340, boxShadow: "var(--shadow-xl)" }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, color: chargeType === "إضافة" ? "var(--warning)" : "var(--danger)" }}>
                {chargeType === "إضافة" ? "إضافة بند خاص" : "إضافة خصم خاص"}
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>الوصف</div>
                <input type="text" placeholder="مثال: ليموزين من المطار" value={chargeForm.description} onChange={e => setChargeForm(p => ({ ...p, description: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>المبلغ</div>
                <input type="number" min="0" placeholder="0" value={chargeForm.amount} onChange={e => setChargeForm(p => ({ ...p, amount: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>ملاحظات (اختياري)</div>
                <input type="text" placeholder="..." value={chargeForm.notes} onChange={e => setChargeForm(p => ({ ...p, notes: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={addCustomCharge} disabled={savingCharge}
                  style={{ flex: 1, padding: 10, background: chargeType === "إضافة" ? "var(--warning)" : "var(--danger)", color: "#fff", border: "none", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 13, cursor: "pointer" }}>
                  {savingCharge ? "جارٍ الحفظ..." : "حفظ"}
                </button>
                <button onClick={() => setShowChargeModal(false)}
                  style={{ flex: 1, padding: 10, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 13, cursor: "pointer" }}>
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // REPORTS VIEW
  // ══════════════════════════════════════════════
  if (subView === "reports") {
    const allData = sortedPassengers.map(p => {
      const due  = calcTotalDue(p, pricing, customCharges);
      const paid = calcTotalPaid(p.id, payments);
      return { p, due, paid, balance: due - paid };
    });
    const totDue  = allData.reduce((s, r) => s + r.due, 0);
    const totPaid = allData.reduce((s, r) => s + r.paid, 0);
    const totBal  = totDue - totPaid;

    const filtered = reportType === "late" ? allData.filter(r => r.balance > 0) : allData;

    return (
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button onClick={() => setSubView("list")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: 24 }}>←</button>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 700, color: "var(--em8)" }}>التقارير المالية</div>
        </div>

        {/* تبويبات */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {([
            { key: "full",     label: "تقرير الحجاج الكامل" },
            { key: "late",     label: "المتأخرون"            },
            { key: "payments", label: "تقرير الدفعات"        },
            { key: "packages", label: "تقرير الباقات"        },
            { key: "addons",   label: "ملخص الإضافات"        },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setReportType(t.key)}
              style={{ padding: "6px 16px", borderRadius: 99, border: "none", fontFamily: "var(--font-body)", fontSize: 12, cursor: "pointer", fontWeight: reportType === t.key ? 700 : 400, background: reportType === t.key ? "var(--em8)" : "var(--bg-2)", color: reportType === t.key ? "#fff" : "var(--text)", transition: "var(--transition)" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* تقرير الحجاج الكامل / المتأخرون */}
        {(reportType === "full" || reportType === "late") && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[
                { label: "إجمالي المطلوب",  value: fmtAmt(totDue),  color: "var(--em8)"     },
                { label: "إجمالي المحصل",   value: fmtAmt(totPaid), color: "var(--success)"  },
                { label: "إجمالي المتبقي",  value: fmtAmt(totBal),  color: "var(--danger)"   },
              ].map(c => (
                <div key={c.label} style={{ background: "var(--bg-card)", borderRadius: 10, padding: "12px 16px", textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>ر.ق</div>
                </div>
              ))}
            </div>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={{ ...thStyle, textAlign: "center", width: 36 }}>م</th>
                  <th style={thStyle}>الاسم</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>الباقة</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>المطلوب</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>المدفوع</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>المتبقي</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>الحالة</th>
                </tr></thead>
                <tbody>
                  {filtered.map(({ p, due, paid, balance }, i) => {
                    const st = financeStatus(due, paid);
                    return (
                      <tr key={p.id} onClick={() => { setSelectedP(p); setSubView("detail"); }}
                        style={{ cursor: "pointer", background: i % 2 === 0 ? "white" : "var(--bg-2)" }}>
                        <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>{i + 1}</td>
                        <td style={tdStyle}>{p.short_ar || p.name_ar}</td>
                        <td style={{ ...tdStyle, textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>{pricing[getPackageKey(p.services.hotel_type)]?.label || "—"}</td>
                        <td style={{ ...tdStyle, textAlign: "center", color: "var(--em8)", fontWeight: 600 }}>{fmtAmt(due)}</td>
                        <td style={{ ...tdStyle, textAlign: "center", color: "var(--success)", fontWeight: 600 }}>{fmtAmt(paid)}</td>
                        <td style={{ ...tdStyle, textAlign: "center", color: balance > 0 ? "var(--danger)" : "var(--success)", fontWeight: 600 }}>{fmtAmt(balance)}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: st.bg, color: st.color, fontWeight: 700 }}>{st.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: "var(--em8)", color: "#fff", fontWeight: 700 }}>
                    <td style={{ padding: "10px 12px" }} colSpan={3}>الإجمالي</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>{fmtAmt(totDue)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>{fmtAmt(totPaid)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>{fmtAmt(totBal)}</td>
                    <td style={{ padding: "10px 12px" }}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* تقرير الدفعات */}
        {reportType === "payments" && (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={{ ...thStyle, textAlign: "center", width: 36 }}>م</th>
                <th style={thStyle}>الحاج</th>
                <th style={{ ...thStyle, textAlign: "center" }}>التاريخ</th>
                <th style={{ ...thStyle, textAlign: "center" }}>طريقة الدفع</th>
                <th style={{ ...thStyle, textAlign: "center" }}>المبلغ</th>
                <th style={thStyle}>ملاحظات</th>
              </tr></thead>
              <tbody>
                {[...payments]
                  .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())
                  .map((py, i) => {
                    const p = passengers.find(x => x.id === py.passenger_id);
                    return (
                      <tr key={py.id} style={{ background: i % 2 === 0 ? "white" : "var(--bg-2)" }}>
                        <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>{i + 1}</td>
                        <td style={tdStyle}>{p ? (p.short_ar || p.name_ar) : "—"}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{py.payment_date}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{py.method}</td>
                        <td style={{ ...tdStyle, textAlign: "center", color: "var(--success)", fontWeight: 600 }}>{fmtAmt(py.amount)}</td>
                        <td style={{ ...tdStyle, color: "var(--text-muted)", fontSize: 12 }}>{py.notes || "—"}</td>
                      </tr>
                    );
                  })}
                <tr style={{ background: "var(--em8)", color: "#fff", fontWeight: 700 }}>
                  <td style={{ padding: "10px 12px" }} colSpan={4}>الإجمالي</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>{fmtAmt(payments.reduce((s, p) => s + Number(p.amount), 0))}</td>
                  <td style={{ padding: "10px 12px" }}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* تقرير الباقات */}
        {reportType === "packages" && (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={thStyle}>الباقة</th>
                <th style={{ ...thStyle, textAlign: "center" }}>عدد الحجاج</th>
                <th style={{ ...thStyle, textAlign: "center" }}>السعر الواحد</th>
                <th style={{ ...thStyle, textAlign: "center" }}>الإجمالي المستحق</th>
              </tr></thead>
              <tbody>
                {PRICING_KEYS.filter(k => k.type === "package").map((pk, i) => {
                  const count = sortedPassengers.filter(p => getPackageKey(p.services.hotel_type) === pk.key).length;
                  const price = pricing[pk.key]?.amount || 0;
                  return (
                    <tr key={pk.key} style={{ background: i % 2 === 0 ? "white" : "var(--bg-2)" }}>
                      <td style={tdStyle}>{pk.label}</td>
                      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>{count}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>{fmtAmt(price)}</td>
                      <td style={{ ...tdStyle, textAlign: "center", color: "var(--em8)", fontWeight: 700 }}>{fmtAmt(count * price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ملخص الإضافات */}
        {reportType === "addons" && (
          <div style={{ background: "var(--bg-card)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={thStyle}>الإضافة / الخصم</th>
                <th style={{ ...thStyle, textAlign: "center" }}>عدد الحجاج</th>
                <th style={{ ...thStyle, textAlign: "center" }}>السعر الواحد</th>
                <th style={{ ...thStyle, textAlign: "center" }}>الإجمالي</th>
              </tr></thead>
              <tbody>
                {[
                  { key: "addon_view",          check: (p: Passenger) => p.services.hotel_view === "مطلة"             },
                  { key: "addon_mina",          check: (p: Passenger) => p.services.camp_mina === "خاص"              },
                  { key: "addon_arafa",         check: (p: Passenger) => p.services.camp_arafa === "خاص"             },
                  { key: "addon_bus_vip",       check: (p: Passenger) => p.services.bus === "VIP"                    },
                  { key: "addon_first_class",   check: (p: Passenger) => (p as any).flight_class === "درجة أولى"     },
                  { key: "discount_no_ticket",  check: (p: Passenger) => (p as any).flight_class === "بدون"          },
                ].map((a, i) => {
                  const count     = sortedPassengers.filter(a.check).length;
                  const price     = pricing[a.key]?.amount || 0;
                  const label     = pricing[a.key]?.label || a.key;
                  const isDis     = a.key === "discount_no_ticket";
                  return (
                    <tr key={a.key} style={{ background: i % 2 === 0 ? "white" : "var(--bg-2)" }}>
                      <td style={tdStyle}>{label}</td>
                      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>{count}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>{fmtAmt(price)}</td>
                      <td style={{ ...tdStyle, textAlign: "center", color: isDis ? "var(--danger)" : "var(--em8)", fontWeight: 700 }}>
                        {isDis ? `(${fmtAmt(count * price)})` : fmtAmt(count * price)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // MAIN LIST VIEW
  // ══════════════════════════════════════════════
  const totDueAll  = sortedPassengers.reduce((s, p) => s + calcTotalDue(p, pricing, customCharges), 0);
  const totPaidAll = sortedPassengers.reduce((s, p) => s + calcTotalPaid(p.id, payments), 0);
  const totBalAll  = totDueAll - totPaidAll;
  const lateCount  = sortedPassengers.filter(p => calcTotalDue(p, pricing, customCharges) > calcTotalPaid(p.id, payments)).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* شريط العنوان */}
      <div style={{ padding: "12px 20px", background: "var(--bg-card)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 700, color: "var(--em8)" }}>الحسابات المالية</div>
        <div style={{ marginRight: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => setSubView("reports")}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", fontFamily: "var(--font-body)", fontSize: 12, cursor: "pointer" }}>
            التقارير
          </button>
          <button onClick={() => setSubView("settings")}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", fontFamily: "var(--font-body)", fontSize: 12, cursor: "pointer" }}>
            إعدادات الأسعار
          </button>
        </div>
      </div>

      {/* بطاقات الملخص */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, padding: "12px 20px", flexShrink: 0 }}>
        {[
          { label: "إجمالي المطلوب",  value: fmtAmt(totDueAll),  color: "var(--em8)",    unit: "ر.ق"  },
          { label: "إجمالي المحصل",   value: fmtAmt(totPaidAll), color: "var(--success)", unit: "ر.ق"  },
          { label: "إجمالي المتبقي",  value: fmtAmt(totBalAll),  color: "var(--danger)",  unit: "ر.ق"  },
          { label: "عدد المتأخرين",   value: String(lateCount),  color: "var(--warning)", unit: "حاج"  },
        ].map(card => (
          <div key={card.label} style={{ background: "var(--bg-card)", borderRadius: 12, padding: "14px 16px", textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{card.unit}</div>
          </div>
        ))}
      </div>

      {/* الجدول الرئيسي */}
      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>جارٍ التحميل...</div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                <tr>
                  {["م", "الاسم", "الباقة", "الإضافات", "المطلوب", "المدفوع", "المتبقي", "الحالة"].map(h => (
                    <th key={h} style={{ ...thStyle, textAlign: h === "م" ? "center" : "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedPassengers.map((p, i) => {
                  const due = calcTotalDue(p, pricing, customCharges);
                  const paid = calcTotalPaid(p.id, payments);
                  const bal = due - paid;
                  const st = financeStatus(due, paid);
                  const s = p.services;
                  const badges: string[] = [];
                  if (s.hotel_view === "مطلة")  badges.push("مطلة");
                  if (s.camp_mina === "خاص")   badges.push("منى خاص");
                  if (s.camp_arafa === "خاص")  badges.push("عرفة خاص");
                  if (s.bus === "VIP")          badges.push("VIP");
                  if ((p as any).flight_class === "درجة أولى") badges.push("درجة أولى");
                  if ((p as any).flight_class === "بدون")      badges.push("بدون تذكرة");
                  return (
                    <tr key={p.id} onClick={() => { setSelectedP(p); setSubView("detail"); }}
                      style={{ cursor: "pointer", background: i % 2 === 0 ? "white" : "var(--bg-2)" }}>
                      <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>{i + 1}</td>
                      <td style={tdStyle}>{p.short_ar || p.name_ar}</td>
                      <td style={{ ...tdStyle, fontSize: 11, color: "var(--text-muted)" }}>{pricing[getPackageKey(s.hotel_type)]?.label || "—"}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {badges.map(b => (
                            <span key={b} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "var(--warning-bg)", color: "var(--warning)" }}>{b}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center", color: "var(--em8)",    fontWeight: 700 }}>{fmtAmt(due)}</td>
                      <td style={{ ...tdStyle, textAlign: "center", color: "var(--success)", fontWeight: 700 }}>{fmtAmt(paid)}</td>
                      <td style={{ ...tdStyle, textAlign: "center", color: bal > 0 ? "var(--danger)" : "var(--success)", fontWeight: 700 }}>{fmtAmt(bal)}</td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 99, background: st.bg, color: st.color, fontWeight: 700 }}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
