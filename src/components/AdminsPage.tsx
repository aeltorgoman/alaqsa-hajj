import { useState, useRef } from "react";
import { supabase } from "../supabase";
import type { Passenger, Bus, Camp, Room, Flight } from "../types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { AlertModal, useAlert } from "./AlertModal";
import { inp, btnP, btnS, makeShort, scanDocument, uploadDoc } from "../utils";

// ============================================================
// ثوابت
// ============================================================
const ADMIN_TYPES = ["مشرف", "إداري", "مرافق"] as const;
type AdminType = typeof ADMIN_TYPES[number];

const TYPE_COLORS: Record<AdminType, [string, string]> = {
  "مشرف":  ["var(--info-bg)",    "var(--info)"],
  "إداري": ["var(--warning-bg)", "var(--warning)"],
  "مرافق": ["var(--success-bg)", "var(--primary-dark)"],
};

const DEFAULT_FORM = {
  name_ar: "", name_en: "", short_ar: "", short_en: "",
  passport: "", national_id: "", nat: "قطري",
  dob: "", expiry: "", id_expiry: "", gender: "ذكر", phone: "",
  passenger_type: "مشرف" as AdminType,
};

// ============================================================
// إحصائيات
// ============================================================
function AdminStats({ admins }: { admins: Passenger[] }) {
  const counts = ADMIN_TYPES.map(t => ({ label: t, val: admins.filter(p => p.passenger_type === t).length }));
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 100, background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "10px 14px", borderRight: "3px solid var(--primary)" }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>إجمالي الإداريين</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--primary)" }}>{admins.length}</div>
      </div>
      {counts.map(({ label, val }) => {
        const [bg, clr] = TYPE_COLORS[label as AdminType];
        return (
          <div key={label} style={{ flex: 1, minWidth: 100, background: bg, border: `0.5px solid ${clr}33`, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontSize: 11, color: clr }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: clr }}>{val}</div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// الصفحة الرئيسية
// ============================================================
function AdminsPage({
  passengers,
  setPassengers,
}: {
  passengers: Passenger[];
  setPassengers: React.Dispatch<React.SetStateAction<Passenger[]>>;
}) {
  const { alert, showAlert } = useAlert();

  // بيانات التعيين
  const [buses, setBuses]     = useState<Bus[]>([]);
  const [rooms, setRooms]     = useState<Room[]>([]);
  const [camps, setCamps]     = useState<Camp[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  // مودال الإضافة / التعديل
  const [showModal, setShowModal]   = useState(false);
  const [editTarget, setEditTarget] = useState<Passenger | null>(null);
  const [form, setForm]             = useState({ ...DEFAULT_FORM });
  const [saving, setSaving]         = useState(false);

  // مسح المستندات
  const [scanning, setScanning]         = useState(false);
  const [passportImg, setPassportImg]   = useState<string | null>(null);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [idImg, setIdImg]               = useState<string | null>(null);
  const [idFile, setIdFile]             = useState<File | null>(null);
  const passportInputRef = useRef<HTMLInputElement>(null);
  const idInputRef       = useRef<HTMLInputElement>(null);

  // مودال التعيين
  const [assignTarget, setAssignTarget] = useState<Passenger | null>(null);
  const [assign, setAssign] = useState({ bus_id: "", room_id: "", camp_mina_id: "", camp_arafa_id: "", flight_id: "", return_flight_id: "" });

  // حذف
  const [deleteTarget, setDeleteTarget] = useState<Passenger | null>(null);

  const admins = passengers.filter(p => p.passenger_type && p.passenger_type !== "حاج");

  // ============================================================
  // تحميل بيانات التعيين
  // ============================================================
  const loadAssignData = async () => {
    if (dataLoaded) return;
    const [{ data: b }, { data: r }, { data: c }, { data: f }] = await Promise.all([
      supabase.from("buses").select("*").order("created_at"),
      supabase.from("rooms").select("*").order("floor").order("number"),
      supabase.from("camps").select("*").order("name"),
      supabase.from("flights").select("*").order("date"),
    ]);
    if (b) setBuses(b);
    if (r) setRooms(r);
    if (c) setCamps(c);
    if (f) setFlights(f);
    setDataLoaded(true);
  };

  // ============================================================
  // مسح جواز
  // ============================================================
  const handleScanPassport = async (file: File) => {
    setScanning(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      setPassportImg(ev.target?.result as string);
      setPassportFile(file);
      try {
        const parsed = await scanDocument(file, "passport");
        setForm(prev => ({
          ...prev,
          name_en:    parsed.name_en    || prev.name_en,
          short_en:   parsed.name_en    ? makeShort(parsed.name_en)  : prev.short_en,
          name_ar:    parsed.name_ar    || prev.name_ar,
          short_ar:   parsed.name_ar    ? makeShort(parsed.name_ar)  : prev.short_ar,
          passport:   parsed.passport   || prev.passport,
          national_id:parsed.national_id|| prev.national_id,
          nat:        parsed.nationality|| prev.nat,
          dob:        parsed.dob        || prev.dob,
          expiry:     parsed.expiry     || prev.expiry,
          gender:     parsed.gender     || prev.gender,
        }));
      } catch { /* تجاهل */ }
      setScanning(false);
    };
    reader.readAsDataURL(file);
  };

  // ============================================================
  // مسح بطاقة
  // ============================================================
  const handleScanId = async (file: File) => {
    setScanning(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      setIdImg(ev.target?.result as string);
      setIdFile(file);
      try {
        const parsed = await scanDocument(file, "idcard");
        setForm(prev => ({
          ...prev,
          name_ar:     parsed.name_ar     || prev.name_ar,
          short_ar:    parsed.name_ar     ? makeShort(parsed.name_ar) : prev.short_ar,
          national_id: parsed.national_id || prev.national_id,
          dob:         parsed.dob         || prev.dob,
          id_expiry:   parsed.expiry      || prev.id_expiry,
          gender:      parsed.gender      || prev.gender,
        }));
      } catch { /* تجاهل */ }
      setScanning(false);
    };
    reader.readAsDataURL(file);
  };

  // ============================================================
  // إعادة ضبط المودال
  // ============================================================
  const resetModal = () => {
    setForm({ ...DEFAULT_FORM });
    setPassportImg(null); setPassportFile(null);
    setIdImg(null); setIdFile(null);
    setScanning(false);
    setEditTarget(null);
  };

  const openAdd = () => { resetModal(); setShowModal(true); };
  const openEdit = (p: Passenger) => {
    resetModal();
    setEditTarget(p);
    setForm({
      name_ar: p.name_ar || "", name_en: p.name_en || "",
      short_ar: p.short_ar || "", short_en: p.short_en || "",
      passport: p.passport || "", national_id: p.national_id || "",
      nat: p.nat || "قطري", dob: p.dob || "", expiry: p.expiry || "",
      id_expiry: p.id_expiry || "", gender: p.gender || "ذكر", phone: p.phone || "",
      passenger_type: (p.passenger_type as AdminType) || "مشرف",
    });
    setShowModal(true);
  };

  // ============================================================
  // حفظ الإداري
  // ============================================================
  const saveAdmin = async () => {
    if (!form.name_ar.trim() && !form.name_en.trim()) { showAlert("warning", "يرجى إدخال الاسم على الأقل"); return; }
    setSaving(true);
    const short_ar = form.short_ar.trim() || makeShort(form.name_ar);
    const short_en = form.short_en.trim() || makeShort(form.name_en);

    try {
      if (editTarget) {
        const { error } = await supabase.from("passengers")
          .update({ ...form, short_ar, short_en })
          .eq("id", editTarget.id);
        if (error) throw error;
        // رفع الصور لو تغيرت
        if (passportFile) await uploadDoc(passportFile, editTarget.id, "passport");
        if (idFile)       await uploadDoc(idFile,       editTarget.id, "national_id");
        setPassengers(prev => prev.map(p => p.id === editTarget.id
          ? { ...p, ...form, short_ar, short_en } : p));
        showAlert("success", "تم تعديل بيانات الإداري");
      } else {
        const { data, error } = await supabase.from("passengers")
          .insert([{ ...form, short_ar, short_en }])
          .select();
        if (error || !data?.[0]) throw error;
        const newId = data[0].id;
        // رفع الصور
        if (passportFile) await uploadDoc(passportFile, newId, "passport");
        if (idFile)       await uploadDoc(idFile,       newId, "national_id");
        const newP: Passenger = {
          ...data[0],
          services: { bus: "", flight: "", hotel_type: "", hotel_view: "", camp_mina: "", camp_arafa: "" },
        };
        setPassengers(prev => [...prev, newP]);
        showAlert("success", "تمت إضافة الإداري بنجاح");
      }
      setShowModal(false);
      resetModal();
    } catch {
      showAlert("error", "حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // حفظ التعيين
  // ============================================================
  const saveAssign = async () => {
    if (!assignTarget) return;
    const updates: any = {
      bus_id:           assign.bus_id           ? Number(assign.bus_id)           : null,
      room_id:          assign.room_id          ? Number(assign.room_id)          : null,
      camp_mina_id:     assign.camp_mina_id     ? Number(assign.camp_mina_id)     : null,
      camp_arafa_id:    assign.camp_arafa_id    ? Number(assign.camp_arafa_id)    : null,
      flight_id:        assign.flight_id        ? Number(assign.flight_id)        : null,
      return_flight_id: assign.return_flight_id ? Number(assign.return_flight_id) : null,
    };
    const { error } = await supabase.from("passengers").update(updates).eq("id", assignTarget.id);
    if (error) { showAlert("error", "حدث خطأ أثناء الحفظ"); return; }
    setPassengers(prev => prev.map(p => p.id === assignTarget.id ? { ...p, ...updates, passenger_type: p.passenger_type } : p));
    showAlert("success", "تم حفظ التعيينات");
    setAssignTarget(null);
  };

  // ============================================================
  // حذف
  // ============================================================
  const deleteAdmin = async (id: number) => {
    const { error } = await supabase.from("passengers").delete().eq("id", id);
    if (error) { showAlert("error", "حدث خطأ أثناء الحذف"); return; }
    setPassengers(prev => prev.filter(p => p.id !== id));
    setDeleteTarget(null);
    showAlert("success", "تم حذف الإداري");
  };

  // ============================================================
  // فتح مودال التعيين
  // ============================================================
  const openAssign = async (p: Passenger) => {
    await loadAssignData();
    setAssign({
      bus_id:           p.bus_id           ? String(p.bus_id)           : "",
      room_id:          p.room_id          ? String(p.room_id)          : "",
      camp_mina_id:     p.camp_mina_id     ? String(p.camp_mina_id)     : "",
      camp_arafa_id:    p.camp_arafa_id    ? String(p.camp_arafa_id)    : "",
      flight_id:        p.flight_id        ? String(p.flight_id)        : "",
      return_flight_id: p.return_flight_id ? String(p.return_flight_id) : "",
    });
    setAssignTarget(p);
  };

  // ============================================================
  // مساعدات عرض التعيينات
  // ============================================================
  const busName    = (p: Passenger) => buses.find(b => b.id === p.bus_id)?.name || "—";
  const roomName   = (p: Passenger) => { const r = rooms.find(r => r.id === p.room_id); return r ? `${r.number}${r.floor ? ` (ط${r.floor})` : ""}` : "—"; };
  const minaName   = (p: Passenger) => camps.find(c => c.id === p.camp_mina_id)?.name  || "—";
  const arafaName  = (p: Passenger) => camps.find(c => c.id === p.camp_arafa_id)?.name || "—";
  const flightName = (p: Passenger) => flights.find(f => f.id === p.flight_id)?.name   || "—";
  const retName    = (p: Passenger) => flights.find(f => f.id === p.return_flight_id)?.name || "—";

  // ============================================================
  // Render
  // ============================================================
  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <AlertModal alert={alert} onClose={() => showAlert(null)} />

      <AdminStats admins={admins} />

      {/* شريط الأزرار */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={openAdd} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          إضافة إداري
        </button>
      </div>

      {/* القائمة */}
      {admins.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)", fontSize: 13 }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 8 }}>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M22 11v6"/><path d="M19 14h6"/>
          </svg>
          <div>لا يوجد إداريون بعد</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {admins.map(p => {
            const type = (p.passenger_type || "إداري") as AdminType;
            const [bg, clr] = TYPE_COLORS[type] || ["var(--bg-2)", "var(--text)"];
            const hasAssign = p.bus_id || p.room_id || p.camp_mina_id || p.camp_arafa_id || p.flight_id || p.return_flight_id;
            return (
              <div key={p.id} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar gender={p.gender || "ذكر"} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{p.short_ar || p.name_ar}</span>
                    <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 99, background: bg, color: clr, fontWeight: 600 }}>{type}</span>
                    {p.passport && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.passport}</span>}
                  </div>
                  {p.phone && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.phone}</div>}
                  {hasAssign && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {p.bus_id           && <AssignTag label="باص"   val={busName(p)}    color="var(--info)" />}
                      {p.room_id          && <AssignTag label="غرفة"  val={roomName(p)}   color="var(--primary)" />}
                      {p.camp_mina_id     && <AssignTag label="منى"   val={minaName(p)}   color="var(--warning)" />}
                      {p.camp_arafa_id    && <AssignTag label="عرفة"  val={arafaName(p)}  color="var(--success)" />}
                      {p.flight_id        && <AssignTag label="ذهاب"  val={flightName(p)} color="#8B3A6B" />}
                      {p.return_flight_id && <AssignTag label="إياب"  val={retName(p)}    color="#5C7C2E" />}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => openAssign(p)} style={{ ...btnP({ padding: "5px 10px", fontSize: 11 }) }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: 4 }}><path d="M8 6H21"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>تعيين
                  </button>
                  <button onClick={() => openEdit(p)} style={{ ...btnS({ padding: "5px 10px", fontSize: 11 }) }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onClick={() => setDeleteTarget(p)} style={{ background: "var(--error-bg)", border: "none", color: "var(--error)", padding: "5px 8px", borderRadius: 8, cursor: "pointer" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================ */}
      {/* مودال الإضافة / التعديل */}
      {/* ============================================================ */}
      <Modal show={showModal} onClose={() => { setShowModal(false); resetModal(); }} title={editTarget ? "تعديل بيانات الإداري" : "إضافة إداري"} maxWidth={(passportImg || idImg) ? 820 : 500}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* البيانات */}
          <div style={{ flex: 1 }}>
            {/* أزرار المسح */}
            {!editTarget && (
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <label style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", borderRadius: 8, border: "1.5px dashed var(--border)", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                  {scanning ? "جاري المسح..." : "مسح جواز السفر"}
                  <input ref={passportInputRef} type="file" accept="image/*" style={{ display: "none" }} disabled={scanning} onChange={e => { const f = e.target.files?.[0]; if (f) handleScanPassport(f); e.target.value = ""; }} />
                </label>
                <label style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", borderRadius: 8, border: "1.5px dashed var(--border)", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                  {scanning ? "جاري المسح..." : "مسح البطاقة"}
                  <input ref={idInputRef} type="file" accept="image/*" style={{ display: "none" }} disabled={scanning} onChange={e => { const f = e.target.files?.[0]; if (f) handleScanId(f); e.target.value = ""; }} />
                </label>
              </div>
            )}

            {/* نوع الإداري */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>نوع الإداري</div>
              <div style={{ display: "flex", gap: 8 }}>
                {ADMIN_TYPES.map(t => {
                  const [bg, clr] = TYPE_COLORS[t];
                  const sel = form.passenger_type === t;
                  return (
                    <div key={t} onClick={() => setForm(f => ({ ...f, passenger_type: t }))}
                      style={{ flex: 1, padding: "7px", borderRadius: 8, border: `1.5px solid ${sel ? clr : "var(--border)"}`, background: sel ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: sel ? clr : "var(--text-muted)", fontWeight: sel ? 700 : 400 }}>
                      {t}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* الحقول */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {([
                ["الاسم بالعربي *", "name_ar"],
                ["الاسم بالإنجليزي", "name_en"],
                ["المختصر عربي", "short_ar"],
                ["المختصر إنجليزي", "short_en"],
                ["رقم الجواز", "passport"],
                ["رقم البطاقة", "national_id"],
                ["الجنسية", "nat"],
                ["رقم الهاتف", "phone"],
                ["تاريخ الميلاد", "dob"],
                ["انتهاء الجواز", "expiry"],
                ["انتهاء البطاقة", "id_expiry"],
              ] as [string, string][]).map(([label, key]) => (
                <div key={key}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>{label}</div>
                  <input style={inp} value={(form as any)[key]} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>الجنس</div>
                <select style={inp} value={form.gender} onChange={e => setForm(prev => ({ ...prev, gender: e.target.value }))}>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>
            </div>

            {/* أزرار الحفظ */}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveAdmin} disabled={saving} style={{ ...btnP({ flex: 1, opacity: saving ? 0.6 : 1 }) }}>
                {saving ? "جاري الحفظ..." : (editTarget ? "حفظ التعديل" : "إضافة")}
              </button>
              <button onClick={() => { setShowModal(false); resetModal(); }} style={btnS()}>إلغاء</button>
            </div>
          </div>

          {/* صور المستندات */}
          {(passportImg || idImg) && (
            <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {passportImg && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--em7)", marginBottom: 6 }}>صورة الجواز</div>
                  <img src={passportImg} alt="جواز" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)" }} />
                </div>
              )}
              {idImg && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--em7)", marginBottom: 6 }}>صورة البطاقة</div>
                  <img src={idImg} alt="بطاقة" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)" }} />
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ============================================================ */}
      {/* مودال التعيين */}
      {/* ============================================================ */}
      <Modal show={!!assignTarget} onClose={() => setAssignTarget(null)} title={`تعيين: ${assignTarget?.short_ar || assignTarget?.name_ar || ""}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <AssignSelect label="الباص"        value={assign.bus_id}           onChange={v => setAssign(a => ({ ...a, bus_id: v }))}
            options={[{ id: "", label: "— بدون —" }, ...buses.map(b => ({ id: String(b.id), label: `${b.name} (${b.type})` }))]} />
          <AssignSelect label="غرفة الفندق"  value={assign.room_id}          onChange={v => setAssign(a => ({ ...a, room_id: v }))}
            options={[{ id: "", label: "— بدون —" }, ...rooms.map(r => ({ id: String(r.id), label: `${r.number} — ${r.type}${r.floor ? ` (ط${r.floor})` : ""}` }))]} />
          <AssignSelect label="مخيم منى"     value={assign.camp_mina_id}     onChange={v => setAssign(a => ({ ...a, camp_mina_id: v }))}
            options={[{ id: "", label: "— بدون —" }, ...camps.filter(c => c.page_type === "منى").map(c => ({ id: String(c.id), label: c.name }))]} />
          <AssignSelect label="مخيم عرفة"    value={assign.camp_arafa_id}    onChange={v => setAssign(a => ({ ...a, camp_arafa_id: v }))}
            options={[{ id: "", label: "— بدون —" }, ...camps.filter(c => c.page_type === "عرفة").map(c => ({ id: String(c.id), label: c.name }))]} />
          <AssignSelect label="رحلة الذهاب"  value={assign.flight_id}        onChange={v => setAssign(a => ({ ...a, flight_id: v }))}
            options={[{ id: "", label: "— بدون —" }, ...flights.filter(f => f.type === "ذهاب").map(f => ({ id: String(f.id), label: `${f.name} — ${f.airline} (${f.date})` }))]} />
          <AssignSelect label="رحلة الإياب"  value={assign.return_flight_id} onChange={v => setAssign(a => ({ ...a, return_flight_id: v }))}
            options={[{ id: "", label: "— بدون —" }, ...flights.filter(f => f.type === "إياب").map(f => ({ id: String(f.id), label: `${f.name} — ${f.airline} (${f.date})` }))]} />
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={saveAssign} style={{ ...btnP({ flex: 1 }) }}>حفظ</button>
            <button onClick={() => setAssignTarget(null)} style={{ ...btnS({ flex: 1 }) }}>إلغاء</button>
          </div>
        </div>
      </Modal>

      {/* ============================================================ */}
      {/* مودال تأكيد الحذف */}
      {/* ============================================================ */}
      <Modal show={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="تأكيد الحذف">
        <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
          <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 16 }}>
            هل أنت متأكد من حذف <strong>{deleteTarget?.short_ar || deleteTarget?.name_ar}</strong>؟
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => deleteTarget && deleteAdmin(deleteTarget.id)} style={{ ...btnP({ background: "var(--error)", minWidth: 80 }) }}>حذف</button>
            <button onClick={() => setDeleteTarget(null)} style={{ ...btnS({ minWidth: 80 }) }}>إلغاء</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// مكوّنات مساعدة
// ============================================================
function AssignTag({ label, val, color }: { label: string; val: string; color: string }) {
  return (
    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: `${color}18`, color, border: `0.5px solid ${color}44`, display: "inline-flex", gap: 4 }}>
      <span style={{ opacity: 0.7 }}>{label}:</span> {val}
    </span>
  );
}

function AssignSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[] }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>{label}</label>
      <select style={inp} value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

export { AdminsPage };
