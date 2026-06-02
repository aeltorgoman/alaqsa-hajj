import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";
// ===== TYPES =====
interface Passenger {
  id: number;
  name_ar: string;
  name_en: string;
  short_ar: string;
  short_en: string;
  passport: string;
  national_id: string;
  nat: string;
  dob: string;
  expiry: string;
  gender: string;
  phone: string;
  services: { bus: string; flight: string; hotel: string; camp_mina: string; camp_arafa: string; };
  rel: string;
  linked: number;
}
interface User { id: number; name: string; username: string; password: string; permissions: Record<string, boolean>; }
interface Bus { id: number; name: string; type: string; passengers: number[]; }
interface Camp { id: number; name: string; gender: "ذكر" | "أنثى"; type: "عادي" | "خاص"; passengers: number[]; }
interface Room { id: number; number: string; floor: string; type: "مطل" | "جانبي" | "داخلي" | "سويت"; passengers: number[]; }

const ALL_PERMISSIONS = [
  { key: "add_passenger", label: "إضافة حجاج" },
  { key: "edit_passenger", label: "تعديل حجاج" },
  { key: "delete_passenger", label: "حذف حجاج" },
  { key: "view_passengers", label: "عرض الحجاج" },
  { key: "manage_buses", label: "إدارة الباصات" },
  { key: "manage_camps", label: "إدارة المخيمات" },
  { key: "manage_hotel", label: "إدارة الفندق" },
  { key: "view_reports", label: "عرض التقارير" },
  { key: "export_reports", label: "تصدير التقارير" },
  { key: "print_reports", label: "طباعة التقارير" },
  { key: "manage_users", label: "إدارة المستخدمين" },
  { key: "view_archive", label: "عرض الأرشيف" },
];
const ADMIN_PERMS = Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, true]));
const INIT_USERS: User[] = [{ id: 1, name: "المدير العام", username: "admin", password: "admin123", permissions: ADMIN_PERMS }];
const ROOM_TYPES = ["مطل", "جانبي", "داخلي", "سويت"] as const;
const ROOM_COLORS: Record<string, [string, string]> = { "مطل": ["#E6F1FB", "#0C447C"], "جانبي": ["#FAEEDA", "#633806"], "داخلي": ["#E1F5EE", "#085041"], "سويت": ["#EEEDFE", "#3C3489"] };
const NAV = [
  { section: "الرئيسية", items: [{ id: "dash", label: "📊 لوحة التحكم" }] },
  { section: "التسجيل", items: [{ id: "scan", label: "🔍 رفع وثيقة" }, { id: "passengers", label: "👥 المسافرون" }] },
  { section: "التنظيم", items: [{ id: "buses", label: "🚌 الباصات" }, { id: "mina", label: "⛺ مخيمات منى" }, { id: "arafa", label: "🏔 مخيمات عرفة" }, { id: "hotel", label: "🏨 الفندق" }] },
  { section: "التقارير", items: [{ id: "reports", label: "📄 التقارير" }] },
  { section: "الإعدادات", items: [{ id: "users", label: "👥 المستخدمين" }] },
];

function Avatar({ name, gender, size = 32 }: { name: string; gender: string; size?: number }) {
  const initials = name.split(" ").slice(0, 2).map(w => w[0] || "").join("");
  const f = gender === "أنثى";
  return <div style={{ width: size, height: size, borderRadius: "50%", background: f ? "#FBEAF0" : "#E1F5EE", color: f ? "#72243E" : "#085041", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.33, fontWeight: 500, flexShrink: 0 }}>{initials}</div>;
}

function Modal({ show, onClose, title, children, maxWidth = 420 }: any) {
  if (!show) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 12, width: "92%", maxWidth, maxHeight: "88%", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
        <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "white", zIndex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#888" }}>✕</button>
        </div>
        <div style={{ padding: "14px 16px" }}>{children}</div>
      </div>
    </div>
  );
}

const inp = { fontSize: 12, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 8, padding: "7px 10px", width: "100%", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const };
const btnP = (extra?: any) => ({ background: "#1D9E75", color: "white", border: "none", padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500, ...extra });
const btnS = (extra?: any) => ({ background: "transparent", border: "0.5px solid #ddd", padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#333", ...extra });

function Sidebar({ page, setPage, count, currentUser, onLogout }: any) {
  return (
    <div style={{ width: 200, background: "#f9f9f9", borderLeft: "0.5px solid #e5e5e5", padding: "12px 0", display: "flex", flexDirection: "column", flexShrink: 0, height: "100%" }}>
      <div style={{ padding: "0 12px 12px", borderBottom: "0.5px solid #e5e5e5", marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>✈️ نظام الحج</div>
        <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>حملة الأقصى — قطر</div>
      </div>
      {NAV.map(({ section, items }) => (
        <div key={section}>
          <div style={{ fontSize: 10, color: "#aaa", padding: "10px 12px 3px", letterSpacing: "0.04em" }}>{section}</div>
          {items.map(({ id, label }) => (
            <div key={id} onClick={() => setPage(id)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", fontSize: 12, color: page === id ? "#1D9E75" : "#666", cursor: "pointer", borderRight: page === id ? "2px solid #1D9E75" : "2px solid transparent", fontWeight: page === id ? 500 : 400, background: page === id ? "white" : "transparent" }}>
              {label}
              {id === "passengers" && count > 0 && <span style={{ background: "#E1F5EE", color: "#085041", borderRadius: 99, padding: "0 6px", fontSize: 10, marginRight: "auto" }}>{count}</span>}
            </div>
          ))}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{ padding: "10px 12px", borderTop: "0.5px solid #e5e5e5" }}>
        <div style={{ fontSize: 11, fontWeight: 500 }}>{currentUser.name}</div>
        <div style={{ fontSize: 10, color: "#888" }}>@{currentUser.username}</div>
        <button onClick={onLogout} style={{ marginTop: 8, width: "100%", background: "#FBEAF0", border: "none", padding: 5, borderRadius: 6, fontSize: 11, cursor: "pointer", color: "#c0392b" }}>تسجيل خروج</button>
      </div>
    </div>
  );
}

function LoginPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [users] = useState<User[]>(INIT_USERS);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const handleLogin = () => {
    const user = users.find(u => u.username === username && u.password === password);
    if (user) { setError(""); onLogin(user); }
    else setError("اسم المستخدم أو كلمة المرور غلط");
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#E1F5EE,#f0f9ff)", direction: "rtl", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ background: "white", borderRadius: 16, padding: "40px 32px", width: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✈️</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>نظام الحج</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>حملة الأقصى — قطر</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 5 }}>اسم المستخدم</div>
          <input style={{ ...inp, border: `1px solid ${error ? "#c0392b" : "#e0e0e0"}` }} value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="أدخل اسم المستخدم" autoFocus />
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 5 }}>كلمة المرور</div>
          <div style={{ position: "relative" }}>
            <input style={{ ...inp, border: `1px solid ${error ? "#c0392b" : "#e0e0e0"}`, paddingLeft: 36 }} type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="••••••••" />
            <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#aaa" }}>{showPass ? "🙈" : "👁"}</button>
          </div>
        </div>
        {error && <div style={{ fontSize: 12, color: "#c0392b", marginBottom: 10, textAlign: "center", background: "#FBEAF0", padding: "6px 10px", borderRadius: 8 }}>{error}</div>}
        <button onClick={handleLogin} style={{ width: "100%", background: "#1D9E75", color: "white", border: "none", padding: 12, borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 600, marginTop: 6 }}>دخول</button>
        <div style={{ marginTop: 16, padding: 10, background: "#f9f9f9", borderRadius: 8, fontSize: 11, color: "#888" }}>
          <div style={{ fontWeight: 500, marginBottom: 3, color: "#666" }}>حساب تجريبي:</div>
          <div>👑 admin / admin123</div>
        </div>
      </div>
    </div>
  );
}

function UsersPage({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<User[]>(INIT_USERS);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const openAdd = () => { setForm({ name: "", username: "", password: "" }); setPerms(Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, false]))); setEditUser(null); setShowAdd(true); };
  const openEdit = (u: User) => { setForm({ name: u.name, username: u.username, password: u.password }); setPerms({ ...u.permissions }); setEditUser(u); setShowAdd(true); };
  const togglePerm = (key: string) => setPerms(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleAll = () => { const allOn = ALL_PERMISSIONS.every(p => perms[p.key]); setPerms(Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, !allOn]))); };
  const saveUser = () => {
    if (!form.name || !form.username || !form.password) return;
    if (editUser) setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, ...form, permissions: perms } : u));
    else setUsers(prev => [...prev, { id: Date.now(), ...form, permissions: perms }]);
    setShowAdd(false);
  };
  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
      {currentUser.permissions.manage_users && <button onClick={openAdd} style={{ ...btnP(), width: "100%", marginBottom: 14 }}>+ مستخدم جديد</button>}
      {users.map(u => (
        <div key={u.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: u.id === 1 ? "#E1F5EE" : "#EEEDFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{u.id === 1 ? "👑" : "👤"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
            <div style={{ fontSize: 11, color: "#888" }}>@{u.username} · {Object.values(u.permissions).filter(Boolean).length} صلاحية</div>
          </div>
          {currentUser.permissions.manage_users && u.id !== 1 && (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => openEdit(u)} style={{ background: "#E6F1FB", border: "none", padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "#0C447C" }}>✏️</button>
              <button onClick={() => setUsers(prev => prev.filter(x => x.id !== u.id))} style={{ background: "#FBEAF0", border: "none", padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "#c0392b" }}>🗑</button>
            </div>
          )}
        </div>
      ))}
      <Modal show={showAdd} onClose={() => setShowAdd(false)} title={editUser ? "تعديل مستخدم" : "مستخدم جديد"}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 3 }}>الاسم</div><input style={inp} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 3 }}>اسم المستخدم</div><input style={inp} value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} /></div>
        </div>
        <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: "#666", marginBottom: 3 }}>كلمة المرور</div><input type="password" style={inp} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>الصلاحيات</div>
          <div onClick={toggleAll} style={{ fontSize: 11, color: "#1D9E75", cursor: "pointer" }}>{ALL_PERMISSIONS.every(p => perms[p.key]) ? "إلغاء الكل" : "تحديد الكل"}</div>
        </div>
        {ALL_PERMISSIONS.map(p => (
          <div key={p.key} onClick={() => togglePerm(p.key)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 3, background: perms[p.key] ? "#E1F5EE" : "#f9f9f9", border: `0.5px solid ${perms[p.key] ? "#5DCAA5" : "#e5e5e5"}` }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: perms[p.key] ? "#1D9E75" : "white", border: `1.5px solid ${perms[p.key] ? "#1D9E75" : "#ccc"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{perms[p.key] && <span style={{ color: "white", fontSize: 10 }}>✓</span>}</div>
            <span style={{ fontSize: 12 }}>{p.label}</span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={saveUser} style={{ ...btnP(), flex: 1 }}>✓ حفظ</button>
          <button onClick={() => setShowAdd(false)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}

function Dashboard({ passengers, setPage }: { passengers: Passenger[]; setPage: (p: string) => void }) {
  const males = passengers.filter(p => p.gender === "ذكر").length;
  const females = passengers.filter(p => p.gender === "أنثى").length;
  const vip = passengers.filter(p => p.services?.bus === "VIP").length;
  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        {[["👥 الحجاج", passengers.length, "#111"], ["👨 رجال", males, "#0C447C"], ["👩 نساء", females, "#72243E"], ["⭐ VIP", vip, "#633806"]].map(([l, v, c]) => (
          <div key={l as string} style={{ background: "#f5f5f5", borderRadius: 10, padding: "14px 12px" }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{l as string}</div>
            <div style={{ fontSize: 26, fontWeight: 600, color: c as string }}>{v as number}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "#f9f9f9", borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>⚡ وصول سريع</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[["🔍 رفع وثيقة", "scan"], ["👥 قائمة الحجاج", "passengers"], ["🚌 الباصات", "buses"], ["📄 التقارير", "reports"]].map(([l, id]) => (
            <div key={id as string} onClick={() => setPage(id as string)} style={{ padding: "10px 12px", border: "0.5px solid #e5e5e5", borderRadius: 8, cursor: "pointer", fontSize: 12, background: "white" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#E1F5EE")}
              onMouseLeave={e => (e.currentTarget.style.background = "white")}>{l as string}</div>
          ))}
        </div>
      </div>
      {passengers.length > 0 && (
        <div style={{ background: "white", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>🕐 آخر المضافين</div>
          {passengers.slice(-4).reverse().map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "0.5px solid #f5f5f5" }}>
              <Avatar name={p.name_ar} gender={p.gender} size={30} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar}</div><div style={{ fontSize: 10, color: "#888" }}>{p.nat} · {p.passport}</div></div>
              {p.services?.bus === "VIP" && <span style={{ fontSize: 10, background: "#FAEEDA", color: "#633806", padding: "1px 6px", borderRadius: 99 }}>⭐ VIP</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== SCAN PAGE =====
function ScanPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [showFields, setShowFields] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [form, setForm] = useState({ name_en: "", name_ar: "", short_en: "", short_ar: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", gender: "", phone: "" });
  const [services, setServices] = useState({ bus: "عادي", flight: "عادي", hotel: "مطل", camp_mina: "عادي", camp_arafa: "عادي" });
  const setField = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));
  const setService = (key: string, val: string) => setServices(prev => ({ ...prev, [key]: val }));
  const handleFile = (file: File) => {
    setPreviewImg(URL.createObjectURL(file));
    setLoading(true); setProgress(0); setShowFields(false); setSaved(false);
    const msgs = ["جاري تحليل الجواز...", "استخراج البيانات...", "التحقق..."];
    let p = 0;
    const iv = setInterval(() => { p = Math.min(p + Math.random() * 20, 85); setProgress(p); setStatusMsg(msgs[Math.min(Math.floor(p / 30), 2)]); }, 400);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      try {
        const response = await fetch("https://zkucwcnclbfvukhdqhgc.supabase.co/functions/v1/Scan-passport", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type })
        });
        const data = await response.json();
        clearInterval(iv); setProgress(100); setStatusMsg("تم الاستخراج بنجاح!");
        setTimeout(() => {
          setLoading(false);
          const text = data.content ? data.content.map((i: any) => i.text || "").join("") : JSON.stringify(data);
          let parsed: any = {};
          try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); } catch {}
          setForm(prev => ({ ...prev, name_en: parsed.name_en || "", name_ar: parsed.name_ar || "", short_en: parsed.short_en || "", short_ar: parsed.short_ar || "", passport: parsed.passport || "", national_id: parsed.national_id || "", nat: parsed.nationality || "قطري", dob: parsed.dob || "", expiry: parsed.expiry || "", gender: parsed.gender || "" }));
          setShowFields(true);
        }, 500);
      } catch { clearInterval(iv); setLoading(false); setShowFields(true); }
    };
    reader.readAsDataURL(file);
  };
  const handleSave = async () => {   const newPassenger = { id: Date.now(), ...form, services, rel: "", linked: -1 };   const { error } = await supabase.from("passengers").insert([{     name_ar: form.name_ar, name_en: form.name_en,     short_ar: form.short_ar, short_en: form.short_en,     passport: form.passport, national_id: form.national_id,     nat: form.nat, dob: form.dob, expiry: form.expiry,     gender: form.gender, phone: form.phone,     bus: services.bus, flight: services.flight,     hotel: services.hotel, camp_mina: services.camp_mina,     camp_arafa: services.camp_arafa   }]);   if (!error) { setPassengers([...passengers, newPassenger]); setSaved(true); }   else alert("حصل خطأ في الحفظ!"); };
  const reset = () => { setForm({ name_en: "", name_ar: "", short_en: "", short_ar: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", gender: "", phone: "" }); setServices({ bus: "عادي", flight: "عادي", hotel: "مطل", camp_mina: "عادي", camp_arafa: "عادي" }); setPreviewImg(null); setShowFields(false); setSaved(false); };
  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
      {saved && <div style={{ background: "#E1F5EE", border: "0.5px solid #5DCAA5", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 12, color: "#085041" }}>✓ تم حفظ الحاج! <button onClick={reset} style={{ marginRight: "auto", ...btnP({ fontSize: 11, padding: "3px 10px" }) }}>+ حاج جديد</button></div>}
      <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>🛂 رفع جواز السفر</div>
        {!previewImg ? (
          <div onClick={() => document.getElementById("pu")?.click()} style={{ border: "1.5px dashed #ddd", borderRadius: 10, padding: "24px", textAlign: "center", cursor: "pointer", background: "#f9f9f9" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🛂</div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3 }}>ارفع صورة جواز السفر</div>
            <div style={{ fontSize: 11, color: "#888" }}>الذكاء الاصطناعي يستخرج البيانات تلقائياً</div>
            <input id="pu" type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <img src={previewImg} style={{ width: 140, height: 100, objectFit: "cover", borderRadius: 8, border: "0.5px solid #e5e5e5" }} />
            <div style={{ flex: 1 }}>
              {loading ? (<><div style={{ background: "#f0f0f0", borderRadius: 99, height: 4, overflow: "hidden", marginBottom: 6 }}><div style={{ width: `${progress}%`, height: "100%", background: "#1D9E75", borderRadius: 99, transition: "width 0.3s" }} /></div><div style={{ fontSize: 11, color: "#888" }}>{statusMsg}</div></>) : <div style={{ fontSize: 11, color: "#1D9E75", fontWeight: 500 }}>✓ {statusMsg}</div>}
              <button onClick={reset} style={{ marginTop: 8, ...btnS({ fontSize: 10, padding: "3px 10px" }) }}>تغيير</button>
            </div>
          </div>
        )}
      </div>
      {showFields && (<>
        <div style={{ border: "0.5px solid #5DCAA5", borderRadius: 12, padding: "12px 14px", marginBottom: 12, background: "#FAFFFD" }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>👤 البيانات <span style={{ fontSize: 10, background: "#E1F5EE", color: "#085041", padding: "1px 7px", borderRadius: 99 }}>✨ مستخرجة</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["الاسم بالإنجليزي", "name_en", "1/-1"], ["الاسم بالعربي", "name_ar", "1/-1"], ["المختصر إنجليزي", "short_en", ""], ["المختصر عربي", "short_ar", ""], ["رقم الجواز", "passport", ""], ["الرقم الشخصي", "national_id", ""], ["الجنسية", "nat", ""], ["التليفون", "phone", ""], ["تاريخ الميلاد", "dob", ""], ["انتهاء الجواز", "expiry", ""]].map(([l, k, col]) => (
              <div key={k as string} style={{ gridColumn: col as string || "auto" }}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>{l as string}</div>
                <input style={{ ...inp, borderColor: "#5DCAA5", background: "#E1F5EE" }} value={(form as any)[k as string]} onChange={e => setField(k as string, e.target.value)} />
              </div>
            ))}
            <div><div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>الجنس</div>
              <select style={{ ...inp, borderColor: "#5DCAA5", background: "#E1F5EE" }} value={form.gender} onChange={e => setField("gender", e.target.value)}>
                <option value="">—</option><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option>
              </select>
            </div>
          </div>
        </div>
        <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>⭐ الخدمات المطلوبة</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["🚌 الباص", "bus", ["عادي", "VIP"]], ["✈️ الطيران", "flight", ["عادي", "درجة أولى"]], ["🏨 الفندق", "hotel", ["مطل", "جانبي", "داخلي"]], ["⛺ مخيم منى", "camp_mina", ["عادي", "خاص"]], ["🏔 مخيم عرفة", "camp_arafa", ["عادي", "خاص"]]].map(([l, k, opts]) => (
              <div key={k as string}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{l as string}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {(opts as string[]).map(o => <div key={o} onClick={() => setService(k as string, o)} style={{ flex: 1, padding: "5px 4px", borderRadius: 8, border: `1.5px solid ${(services as any)[k as string] === o ? "#1D9E75" : "#ddd"}`, background: (services as any)[k as string] === o ? "#E1F5EE" : "transparent", cursor: "pointer", fontSize: 10, color: (services as any)[k as string] === o ? "#085041" : "#666", textAlign: "center", fontWeight: (services as any)[k as string] === o ? 500 : 400 }}>{o}</div>)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleSave} style={{ ...btnP(), flex: 1 }}>{saved ? "✓ تم الحفظ" : "💾 حفظ الحاج"}</button>
          <button onClick={reset} style={btnS()}>مسح</button>
        </div>
      </>)}
    </div>
  );
}

function PassengersPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Passenger | null>(null);
  const [editing, setEditing] = useState<Passenger | null>(null);
  const filtered = passengers.filter(p => !search || [p.name_ar, p.name_en, p.passport, p.national_id, p.nat, p.phone, p.gender, p.services?.bus].join(" ").toLowerCase().includes(search.toLowerCase()));
  const deleteP = (id: number) => { setPassengers(passengers.filter(p => p.id !== id)); setSelected(null); };
  const saveEdit = (p: Passenger) => { setPassengers(passengers.map(x => x.id === p.id ? p : x)); setEditing(null); setSelected(p); };
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "0.5px solid #e5e5e5" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f5f5f5", border: "0.5px solid #e0e0e0", borderRadius: 8, padding: "6px 10px" }}>
            <span style={{ color: "#aaa" }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث بأي معلومة..." />
            {search && <span onClick={() => setSearch("")} style={{ cursor: "pointer", color: "#aaa" }}>✕</span>}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>{filtered.length} من {passengers.length} حاج</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
          {filtered.length === 0 ? <div style={{ textAlign: "center", padding: "2rem", color: "#aaa", fontSize: 12 }}>لا توجد نتائج</div> :
            filtered.map(p => (
              <div key={p.id} onClick={() => setSelected(p)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, marginBottom: 3, cursor: "pointer", background: selected?.id === p.id ? "#E1F5EE" : "transparent", border: `0.5px solid ${selected?.id === p.id ? "#5DCAA5" : "transparent"}` }}>
                <Avatar name={p.name_ar} gender={p.gender} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar || p.name_ar}</div>
                  <div style={{ fontSize: 10, color: "#888" }}>{p.nat} · {p.passport}</div>
                  <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
                    <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: p.gender === "أنثى" ? "#FBEAF0" : "#E6F1FB", color: p.gender === "أنثى" ? "#72243E" : "#0C447C" }}>{p.gender}</span>
                    {p.services?.bus === "VIP" && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: "#FAEEDA", color: "#633806" }}>⭐ VIP</span>}
                    {p.services?.flight === "درجة أولى" && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: "#EEEDFE", color: "#3C3489" }}>✈️ أولى</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={e => { e.stopPropagation(); setEditing(p); }} style={{ background: "#E6F1FB", border: "none", padding: "3px 7px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "#0C447C" }}>✏️</button>
                  <button onClick={e => { e.stopPropagation(); if (confirm("هتمسح الحاج ده؟")) deleteP(p.id); }} style={{ background: "#FBEAF0", border: "none", padding: "3px 7px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "#c0392b" }}>🗑</button>
                </div>
              </div>
            ))}
        </div>
      </div>
      {selected && !editing && (
        <div style={{ width: 260, borderRight: "0.5px solid #e5e5e5", overflowY: "auto", padding: 12 }}>
          <div style={{ textAlign: "center", marginBottom: 12, background: "#f9f9f9", borderRadius: 10, padding: 12 }}>
            <Avatar name={selected.name_ar} gender={selected.gender} size={48} />
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>{selected.name_ar}</div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{selected.name_en}</div>
          </div>
          {[["🛂", selected.passport], ["🪪", selected.national_id], ["🌍", selected.nat], ["🎂", selected.dob], ["📅", selected.expiry], ["📞", selected.phone]].filter(([, v]) => v).map(([icon, val]) => (
            <div key={icon as string} style={{ background: "#f9f9f9", borderRadius: 8, padding: "6px 10px", marginBottom: 5, fontSize: 12 }}>{icon as string} {val as string}</div>
          ))}
          <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginTop: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6 }}>⭐ الخدمات المطلوبة</div>
            {[["🚌", "الباص", selected.services?.bus], ["✈️", "الطيران", selected.services?.flight], ["🏨", "الفندق", selected.services?.hotel], ["⛺", "منى", selected.services?.camp_mina], ["🏔", "عرفة", selected.services?.camp_arafa]].map(([icon, label, val]) => (
              <div key={label as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "0.5px solid #f5f5f5" }}>
                <span style={{ color: "#888" }}>{icon as string} {label as string}</span>
                <span style={{ fontWeight: 500, color: (val === "VIP" || val === "درجة أولى" || val === "خاص") ? "#633806" : "#333" }}>{val as string}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditing(selected)} style={{ ...btnP({ background: "#E6F1FB", color: "#0C447C" }), flex: 1 }}>✏️ تعديل</button>
            <button onClick={() => { if (confirm("هتمسح الحاج ده؟")) deleteP(selected.id); }} style={{ background: "#FBEAF0", border: "none", padding: "7px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "#c0392b" }}>🗑</button>
          </div>
        </div>
      )}
      <Modal show={!!editing} onClose={() => setEditing(null)} title="تعديل بيانات الحاج">
        {editing && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[["الاسم بالعربي", "name_ar"], ["الاسم بالإنجليزي", "name_en"], ["المختصر عربي", "short_ar"], ["المختصر إنجليزي", "short_en"], ["رقم الجواز", "passport"], ["الرقم الشخصي", "national_id"], ["الجنسية", "nat"], ["التليفون", "phone"], ["تاريخ الميلاد", "dob"], ["انتهاء الجواز", "expiry"]].map(([l, k]) => (
                <div key={k as string}><div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>{l as string}</div><input style={inp} value={(editing as any)[k as string] || ""} onChange={e => setEditing({ ...editing, [k as string]: e.target.value })} /></div>
              ))}
              <div><div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>الجنس</div><select style={inp} value={editing.gender} onChange={e => setEditing({ ...editing, gender: e.target.value })}><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option></select></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => saveEdit(editing)} style={{ ...btnP(), flex: 1 }}>✓ حفظ</button>
              <button onClick={() => setEditing(null)} style={btnS()}>إلغاء</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function BusesPage({ passengers }: { passengers: Passenger[] }) {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [expanded, setExpanded] = useState(new Set<number>());
  const [showAdd, setShowAdd] = useState(false);
  const [showAddP, setShowAddP] = useState(false);
  const [busName, setBusName] = useState("");
  const [busType, setBusType] = useState("عادي");
  const [nameError, setNameError] = useState("");
  const [currentBusId, setCurrentBusId] = useState<number | null>(null);
  const [selectedP, setSelectedP] = useState(new Set<number>());
  const [pSearch, setPSearch] = useState("");
  const getAssigned = () => { const s = new Set<number>(); buses.forEach(b => b.passengers.forEach(id => s.add(id))); return s; };
  const assigned = getAssigned();
  const toggleBus = (id: number) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const addBus = () => {
    if (!busName.trim()) return;
    if (buses.some(b => b.name.trim() === busName.trim())) { setNameError(`باص باسم "${busName}" موجود بالفعل!`); return; }
    setNameError("");
    const id = Date.now(); setBuses(prev => [...prev, { id, name: busName.trim(), type: busType, passengers: [] }]); setExpanded(prev => new Set([...prev, id])); setBusName(""); setBusType("عادي"); setShowAdd(false);
  };
  const deleteBus = (id: number) => {
    const bus = buses.find(b => b.id === id);
    if (bus && bus.passengers.length > 0) { alert("مش هينفع تمسح باص فيه مسافرين!"); return; }
    setBuses(prev => prev.filter(b => b.id !== id));
  };
  const openAddP = (busId: number) => { setCurrentBusId(busId); setSelectedP(new Set()); setPSearch(""); setShowAddP(true); };
  const toggleSelectP = (id: number) => setSelectedP(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const confirmAddP = () => { setBuses(prev => prev.map(b => { if (b.id !== currentBusId) return b; const nl = [...b.passengers]; selectedP.forEach(id => { if (!nl.includes(id)) nl.push(id); }); return { ...b, passengers: nl }; })); setShowAddP(false); };
  const removeP = (pId: number, busId: number) => setBuses(prev => prev.map(b => b.id !== busId ? b : { ...b, passengers: b.passengers.filter(id => id !== pId) }));
  const moveP = (pId: number, fromId: number, toId: string) => { if (!toId) return; setBuses(prev => prev.map(b => { if (b.id === fromId) return { ...b, passengers: b.passengers.filter(id => id !== pId) }; if (b.id === parseInt(toId) && !b.passengers.includes(pId)) return { ...b, passengers: [...b.passengers, pId] }; return b; })); };
  const printBus = (bus: Bus) => {
    const bp = bus.passengers.map(id => passengers.find(p => p.id === id)).filter(Boolean) as Passenger[];
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>${bus.name}</title><style>body{font-family:Arial;direction:rtl;padding:20px}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:#1D9E75;color:white}</style></head><body><h2>🚌 ${bus.name} ${bus.type === "VIP" ? "(VIP)" : ""}</h2><table><tr><th>م</th><th>الاسم</th></tr>${bp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };
  const printAll = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>تقرير الباصات</title><style>body{font-family:Arial;direction:rtl;padding:20px}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{border:1px solid #ccc;padding:7px;text-align:right}th{background:#1D9E75;color:white}@media print{.bus{page-break-after:always}}</style></head><body><h1>🚌 تقرير الباصات</h1>${buses.map(bus => { const bp = bus.passengers.map(id => passengers.find(p => p.id === id)).filter(Boolean) as Passenger[]; return `<div class="bus"><h2>${bus.name} ${bus.type === "VIP" ? "(VIP)" : ""}</h2><table><tr><th>م</th><th>الاسم</th></tr>${bp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table></div>`; }).join("")}<script>window.print();</script></body></html>`);
    w.document.close();
  };
  const currentBus = buses.find(b => b.id === currentBusId);
  const filteredP = passengers.filter(p => !pSearch || p.name_ar.includes(pSearch));
  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
        {[["الباصات", buses.length, "#111"], ["موزّعون", assigned.size, "#1D9E75"], ["غير موزّعين", passengers.length - assigned.size, passengers.length - assigned.size > 0 ? "#c0392b" : "#1D9E75"]].map(([l, v, c]) => (
          <div key={l as string} style={{ background: "#f5f5f5", borderRadius: 8, padding: "10px 12px" }}><div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>{l as string}</div><div style={{ fontSize: 20, fontWeight: 500, color: c as string }}>{v as number}</div></div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setShowAdd(true)} style={{ ...btnP(), flex: 1 }}>+ باص جديد</button>
        {buses.length > 0 && <button onClick={printAll} style={btnS()}>🖨️ طباعة الكل</button>}
      </div>
      {!buses.length ? <div style={{ textAlign: "center", padding: "2rem", color: "#aaa", fontSize: 12 }}>🚌<br />لا يوجد باصات بعد</div> :
        buses.map(bus => {
          const isExpanded = expanded.has(bus.id);
          const bp = bus.passengers.map(id => passengers.find(p => p.id === id)).filter(Boolean) as Passenger[];
          const isVIP = bus.type === "VIP";
          return (
            <div key={bus.id} style={{ border: `0.5px solid ${isVIP ? "#F5C842" : "#e5e5e5"}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
              <div onClick={() => toggleBus(bus.id)} style={{ padding: "10px 12px", background: isVIP ? "#FFFBEA" : "#f9f9f9", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 18 }}>🚌</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>{bus.name} <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isVIP ? "#FAEEDA" : "#EEEDFE", color: isVIP ? "#633806" : "#3C3489" }}>{isVIP ? "⭐ VIP" : "عادي"}</span></div>
                  <div style={{ fontSize: 11, color: "#888" }}>{bp.length} مسافر</div>
                </div>
                <button onClick={e => { e.stopPropagation(); printBus(bus); }} style={{ background: "#f0f0f0", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>🖨️</button>
                <button onClick={e => { e.stopPropagation(); openAddP(bus.id); }} style={{ background: "#E1F5EE", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", color: "#085041" }}>+ إضافة</button>
                <button onClick={e => { e.stopPropagation(); deleteBus(bus.id); }} style={{ background: bp.length === 0 ? "#FBEAF0" : "#f5f5f5", border: "none", padding: "3px 7px", borderRadius: 6, fontSize: 11, cursor: bp.length === 0 ? "pointer" : "not-allowed", color: bp.length === 0 ? "#c0392b" : "#ccc" }}>🗑</button>
                <span style={{ color: "#aaa" }}>{isExpanded ? "▲" : "▼"}</span>
              </div>
              {isExpanded && (
                <div style={{ padding: "8px 12px", borderTop: `0.5px solid ${isVIP ? "#F5C842" : "#e5e5e5"}` }}>
                  {bp.length ? bp.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 4px", borderRadius: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "#aaa", width: 18, textAlign: "center" }}>{i + 1}</span>
                      <Avatar name={p.name_ar} gender={p.gender} size={24} />
                      <span style={{ fontSize: 11, flex: 1 }}>{p.short_ar || p.name_ar}</span>
                      {p.services?.bus === "VIP" && <span style={{ fontSize: 9, background: "#FAEEDA", color: "#633806", padding: "1px 5px", borderRadius: 99 }}>⭐ VIP</span>}
                      <select onChange={e => moveP(p.id, bus.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}>
                        <option value="">نقل لـ...</option>
                        {buses.filter(b => b.id !== bus.id).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <button onClick={() => removeP(p.id, bus.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 12 }}>✕</button>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "10px", color: "#aaa", fontSize: 11 }}>لا يوجد مسافرون</div>}
                </div>
              )}
            </div>
          );
        })}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNameError(""); }} title="🚌 إضافة باص جديد" maxWidth={340}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>اسم الباص</div>
          <input style={{ ...inp, borderColor: nameError ? "#c0392b" : "#ddd" }} value={busName} onChange={e => { setBusName(e.target.value); setNameError(""); }} placeholder="مثال: باص 1، باص VIP..." autoFocus onKeyDown={e => e.key === "Enter" && addBus()} />
          {nameError && <div style={{ fontSize: 11, color: "#c0392b", marginTop: 4 }}>{nameError}</div>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>نوع الباص</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["عادي", "VIP"].map(t => <div key={t} onClick={() => setBusType(t)} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1.5px solid ${busType === t ? "#1D9E75" : "#ddd"}`, background: busType === t ? "#E1F5EE" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: busType === t ? "#085041" : "#666", fontWeight: busType === t ? 500 : 400 }}>{t === "VIP" ? "⭐ VIP" : "🚌 عادي"}</div>)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addBus} style={{ ...btnP(), flex: 1 }}>✓ إضافة</button>
          <button onClick={() => { setShowAdd(false); setNameError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
      <Modal show={showAddP} onClose={() => setShowAddP(false)} title={`إضافة مسافرين — ${currentBus?.name}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "#aaa" }}>🔍</span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={pSearch} onChange={e => setPSearch(e.target.value)} />
        </div>
        {filteredP.map(p => {
          const isAssigned = assigned.has(p.id) && !currentBus?.passengers.includes(p.id);
          const isInBus = currentBus?.passengers.includes(p.id);
          const isSel = selectedP.has(p.id);
          return (
            <div key={p.id} onClick={() => !isAssigned && !isInBus && toggleSelectP(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: isAssigned || isInBus ? "not-allowed" : "pointer", background: isSel ? "#E1F5EE" : p.services?.bus === "VIP" ? "#FFFBEA" : "transparent", border: `0.5px solid ${isSel ? "#5DCAA5" : p.services?.bus === "VIP" ? "#F5C842" : "transparent"}`, opacity: isAssigned ? 0.4 : 1 }}>
              <Avatar name={p.name_ar} gender={p.gender} size={28} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar || p.name_ar}</div><div style={{ fontSize: 10, color: "#888" }}>{isInBus ? "✓ في هذا الباص" : isAssigned ? "موزّع" : "غير موزّع"}</div></div>
              {p.services?.bus === "VIP" && <span style={{ fontSize: 9, background: "#FAEEDA", color: "#633806", padding: "1px 5px", borderRadius: 99 }}>⭐ VIP</span>}
              {isSel && <span style={{ color: "#1D9E75" }}>✓</span>}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={confirmAddP} style={{ ...btnP(), flex: 1 }}>✓ إضافة ({selectedP.size})</button>
          <button onClick={() => setShowAddP(false)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}

function CampsPage({ pageType, passengers }: { pageType: "منى" | "عرفة"; passengers: Passenger[] }) {
  const [camps, setCamps] = useState<Camp[]>([]);
  const [expanded, setExpanded] = useState(new Set<number>());
  const [showAdd, setShowAdd] = useState(false);
  const [showAddP, setShowAddP] = useState(false);
  const [campName, setCampName] = useState("");
  const [campGender, setCampGender] = useState<"ذكر" | "أنثى">("ذكر");
  const [campType, setCampType] = useState<"عادي" | "خاص">("عادي");
  const [nameError, setNameError] = useState("");
  const [currentCampId, setCurrentCampId] = useState<number | null>(null);
  const [selectedP, setSelectedP] = useState(new Set<number>());
  const [pSearch, setPSearch] = useState("");
  const serviceKey = pageType === "منى" ? "camp_mina" : "camp_arafa";
  const icon = pageType === "منى" ? "⛺" : "🏔";
  const getAssigned = () => { const s = new Set<number>(); camps.forEach(c => c.passengers.forEach(id => s.add(id))); return s; };
  const assigned = getAssigned();
  const toggleCamp = (id: number) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const addCamp = () => {
    if (!campName.trim()) return;
    if (camps.some(c => c.name.trim() === campName.trim() && c.gender === campGender)) { setNameError(`مخيم ${campGender === "ذكر" ? "رجال" : "نساء"} باسم "${campName}" موجود!`); return; }
    setNameError(""); const id = Date.now();
    setCamps(prev => [...prev, { id, name: campName.trim(), gender: campGender, type: campType, passengers: [] }]);
    setExpanded(prev => new Set([...prev, id])); setCampName(""); setCampGender("ذكر"); setCampType("عادي"); setShowAdd(false);
  };
  const deleteCamp = (id: number) => { const c = camps.find(x => x.id === id); if (c && c.passengers.length > 0) { alert("أزل المسافرين الأول!"); return; } setCamps(prev => prev.filter(x => x.id !== id)); };
  const openAddP = (campId: number) => { setCurrentCampId(campId); setSelectedP(new Set()); setPSearch(""); setShowAddP(true); };
  const toggleSelectP = (id: number) => setSelectedP(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const confirmAddP = () => { setCamps(prev => prev.map(c => { if (c.id !== currentCampId) return c; const nl = [...c.passengers]; selectedP.forEach(id => { if (!nl.includes(id)) nl.push(id); }); return { ...c, passengers: nl }; })); setShowAddP(false); };
  const removeP = (pId: number, campId: number) => setCamps(prev => prev.map(c => c.id !== campId ? c : { ...c, passengers: c.passengers.filter(id => id !== pId) }));
  const moveP = (pId: number, fromId: number, toId: string) => { if (!toId) return; const fc = camps.find(c => c.id === fromId); const tc = camps.find(c => c.id === parseInt(toId)); if (!fc || !tc || fc.gender !== tc.gender) return; setCamps(prev => prev.map(c => { if (c.id === fromId) return { ...c, passengers: c.passengers.filter(id => id !== pId) }; if (c.id === parseInt(toId) && !c.passengers.includes(pId)) return { ...c, passengers: [...c.passengers, pId] }; return c; })); };
  const printCamp = (camp: Camp) => {
    const cp = camp.passengers.map(id => passengers.find(p => p.id === id)).filter(Boolean) as Passenger[];
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>مخيم ${camp.name}</title><style>body{font-family:Arial;direction:rtl;padding:20px}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:${camp.gender === "ذكر" ? "#0C447C" : "#72243E"};color:white}</style></head><body><h2>${icon} مخيم ${camp.name} — ${camp.gender === "ذكر" ? "رجال" : "نساء"} (${camp.type})</h2><table><tr><th>م</th><th>الاسم</th></tr>${cp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };
  const printAll = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>مخيمات ${pageType}</title><style>body{font-family:Arial;direction:rtl;padding:20px}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{border:1px solid #ccc;padding:7px;text-align:right}@media print{.c{page-break-after:always}}</style></head><body><h1>${icon} مخيمات ${pageType}</h1>${camps.map(camp => { const cp = camp.passengers.map(id => passengers.find(p => p.id === id)).filter(Boolean) as Passenger[]; return `<div class="c"><h2 style="background:${camp.gender === "ذكر" ? "#0C447C" : "#72243E"};color:white;padding:8px;border-radius:6px">مخيم ${camp.name} — ${camp.gender === "ذكر" ? "رجال" : "نساء"}</h2><table><tr><th style="background:#555;color:white">م</th><th style="background:#555;color:white">الاسم</th></tr>${cp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table></div>`; }).join("")}<script>window.print();</script></body></html>`);
    w.document.close();
  };
  const currentCamp = camps.find(c => c.id === currentCampId);
  const genderPool = passengers.filter(p => p.gender === currentCamp?.gender);
  const filteredP = genderPool.filter(p => !pSearch || p.name_ar.includes(pSearch));
  const maleCamps = camps.filter(c => c.gender === "ذكر");
  const femaleCamps = camps.filter(c => c.gender === "أنثى");
  const renderGroup = (groupCamps: Camp[], gender: "ذكر" | "أنثى") => (
    <div style={{ marginBottom: 16 }}>
      <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 99, background: gender === "ذكر" ? "#E6F1FB" : "#FBEAF0", color: gender === "ذكر" ? "#0C447C" : "#72243E", display: "inline-block", marginBottom: 10 }}>
        {gender === "ذكر" ? "👨 رجال" : "👩 نساء"} ({groupCamps.length})
      </span>
      {groupCamps.length === 0 ? <div style={{ fontSize: 11, color: "#aaa", padding: "6px 0" }}>لا يوجد مخيمات بعد</div> :
        groupCamps.map(camp => {
          const isExpanded = expanded.has(camp.id);
          const cp = camp.passengers.map(id => passengers.find(p => p.id === id)).filter(Boolean) as Passenger[];
          const sameCamps = camps.filter(c => c.id !== camp.id && c.gender === camp.gender);
          const isSpecial = camp.type === "خاص";
          return (
            <div key={camp.id} style={{ border: `0.5px solid ${isSpecial ? "#F5C842" : "#e5e5e5"}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
              <div onClick={() => toggleCamp(camp.id)} style={{ padding: "9px 12px", background: isSpecial ? "#FFFBEA" : "#f9f9f9", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>مخيم {camp.name} <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isSpecial ? "#FAEEDA" : "#f0f0f0", color: isSpecial ? "#633806" : "#555" }}>{isSpecial ? "⭐ خاص" : "عادي"}</span></div>
                  <div style={{ fontSize: 11, color: "#888" }}>{cp.length} مسافر</div>
                </div>
                <button onClick={e => { e.stopPropagation(); printCamp(camp); }} style={{ background: "#f0f0f0", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>🖨️</button>
                <button onClick={e => { e.stopPropagation(); openAddP(camp.id); }} style={{ background: "#E1F5EE", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", color: "#085041" }}>+ إضافة</button>
                <button onClick={e => { e.stopPropagation(); deleteCamp(camp.id); }} style={{ background: cp.length === 0 ? "#FBEAF0" : "#f5f5f5", border: "none", padding: "3px 7px", borderRadius: 6, fontSize: 11, cursor: cp.length === 0 ? "pointer" : "not-allowed", color: cp.length === 0 ? "#c0392b" : "#ccc" }}>🗑</button>
                <span style={{ color: "#aaa" }}>{isExpanded ? "▲" : "▼"}</span>
              </div>
              {isExpanded && (
                <div style={{ padding: "8px 12px", borderTop: `0.5px solid ${isSpecial ? "#F5C842" : "#e5e5e5"}` }}>
                  {cp.length ? cp.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 4px", borderRadius: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "#aaa", width: 18, textAlign: "center" }}>{i + 1}</span>
                      <Avatar name={p.name_ar} gender={p.gender} size={24} />
                      <span style={{ fontSize: 11, flex: 1 }}>{p.short_ar}</span>
                      {(p.services as any)[serviceKey] === "خاص" && <span style={{ fontSize: 9, background: "#FAEEDA", color: "#633806", padding: "1px 5px", borderRadius: 99 }}>⭐ خاص</span>}
                      {sameCamps.length > 0 && <select onChange={e => moveP(p.id, camp.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}><option value="">نقل لـ...</option>{sameCamps.map(c => <option key={c.id} value={c.id}>مخيم {c.name}</option>)}</select>}
                      <button onClick={() => removeP(p.id, camp.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 12 }}>✕</button>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "10px", color: "#aaa", fontSize: 11 }}>لا يوجد مسافرون</div>}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
        {[["المخيمات", camps.length, "#111"], ["رجال", maleCamps.length, "#0C447C"], ["نساء", femaleCamps.length, "#72243E"]].map(([l, v, c]) => (
          <div key={l as string} style={{ background: "#f5f5f5", borderRadius: 8, padding: "10px 12px" }}><div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>{l as string}</div><div style={{ fontSize: 18, fontWeight: 500, color: c as string }}>{v as number}</div></div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setShowAdd(true)} style={{ ...btnP(), flex: 1 }}>+ مخيم جديد</button>
        {camps.length > 0 && <button onClick={printAll} style={btnS()}>🖨️ طباعة الكل</button>}
      </div>
      {!camps.length ? <div style={{ textAlign: "center", padding: "2rem", color: "#aaa", fontSize: 12 }}><div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>لا يوجد مخيمات بعد</div> : (<>{renderGroup(maleCamps, "ذكر")}{renderGroup(femaleCamps, "أنثى")}</>)}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNameError(""); }} title={`${icon} مخيم جديد`} maxWidth={340}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>رقم / اسم المخيم</div>
          <input style={{ ...inp, borderColor: nameError ? "#c0392b" : "#ddd" }} value={campName} onChange={e => { setCampName(e.target.value); setNameError(""); }} placeholder="مثال: 15، 203..." autoFocus onKeyDown={e => e.key === "Enter" && addCamp()} />
          {nameError && <div style={{ fontSize: 11, color: "#c0392b", marginTop: 4 }}>{nameError}</div>}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>نوع المخيم</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["ذكر", "أنثى"] as const).map(g => <div key={g} onClick={() => setCampGender(g)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1.5px solid ${campGender === g ? (g === "ذكر" ? "#0C447C" : "#72243E") : "#ddd"}`, background: campGender === g ? (g === "ذكر" ? "#E6F1FB" : "#FBEAF0") : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: campGender === g ? (g === "ذكر" ? "#0C447C" : "#72243E") : "#666", fontWeight: campGender === g ? 500 : 400 }}>{g === "ذكر" ? "👨 رجال" : "👩 نساء"}</div>)}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>نوع الخيمة</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["عادي", "خاص"] as const).map(t => <div key={t} onClick={() => setCampType(t)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1.5px solid ${campType === t ? "#1D9E75" : "#ddd"}`, background: campType === t ? "#E1F5EE" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: campType === t ? "#085041" : "#666", fontWeight: campType === t ? 500 : 400 }}>{t === "خاص" ? "⭐ خاص" : "🏕 عادي"}</div>)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addCamp} style={{ ...btnP(), flex: 1 }}>✓ إضافة</button>
          <button onClick={() => { setShowAdd(false); setNameError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
      <Modal show={showAddP} onClose={() => setShowAddP(false)} title={`إضافة ${currentCamp?.gender === "ذكر" ? "رجال" : "نساء"} — مخيم ${currentCamp?.name}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "#aaa" }}>🔍</span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={pSearch} onChange={e => setPSearch(e.target.value)} />
        </div>
        {filteredP.length === 0 ? <div style={{ textAlign: "center", color: "#aaa", fontSize: 12, padding: "1rem" }}>لا يوجد مسافرين</div> :
          filteredP.map(p => {
            const isInCamp = currentCamp?.passengers.includes(p.id);
            const isAssigned = assigned.has(p.id) && !isInCamp;
            const isSel = selectedP.has(p.id);
            const wantsSpecial = (p.services as any)[serviceKey] === "خاص";
            return (
              <div key={p.id} onClick={() => !isAssigned && !isInCamp && toggleSelectP(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: isAssigned || isInCamp ? "not-allowed" : "pointer", background: isSel ? "#E1F5EE" : wantsSpecial ? "#FFFBEA" : "transparent", border: `0.5px solid ${isSel ? "#5DCAA5" : wantsSpecial ? "#F5C842" : "transparent"}`, opacity: isAssigned ? 0.4 : 1 }}>
                <Avatar name={p.name_ar} gender={p.gender} size={28} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar}</div><div style={{ fontSize: 10, color: "#888" }}>{isInCamp ? "✓ في المخيم" : isAssigned ? "موزّع" : "غير موزّع"}</div></div>
                {wantsSpecial && <span style={{ fontSize: 9, background: "#FAEEDA", color: "#633806", padding: "1px 5px", borderRadius: 99 }}>⭐ خاص</span>}
                {isSel && <span style={{ color: "#1D9E75" }}>✓</span>}
              </div>
            );
          })}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={confirmAddP} style={{ ...btnP(), flex: 1 }}>✓ إضافة ({selectedP.size})</button>
          <button onClick={() => setShowAddP(false)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}

function HotelPage({ passengers }: { passengers: Passenger[] }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [expanded, setExpanded] = useState(new Set<number>());
  const [showAdd, setShowAdd] = useState(false);
  const [showRange, setShowRange] = useState(false);
  const [showAddP, setShowAddP] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomFloor, setRoomFloor] = useState("");
  const [roomType, setRoomType] = useState<Room["type"]>("مطل");
  const [numberError, setNumberError] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeFloor, setRangeFloor] = useState("");
  const [rangeType, setRangeType] = useState<Room["type"]>("مطل");
  const [rangeError, setRangeError] = useState("");
  const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
  const [selectedP, setSelectedP] = useState(new Set<number>());
  const [pSearch, setPSearch] = useState("");
  const [printFilter, setPrintFilter] = useState<"all" | "floor" | "type">("all");
  const [printFloor, setPrintFloor] = useState("");
  const [printType, setPrintType] = useState<Room["type"]>("مطل");
  const fileRef = useRef<HTMLInputElement>(null);
  const getAssigned = () => { const s = new Set<number>(); rooms.forEach(r => r.passengers.forEach(id => s.add(id))); return s; };
  const assigned = getAssigned();
  const floors = [...new Set(rooms.filter(r => r.floor).map(r => r.floor))].sort();
  const toggleRoom = (id: number) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const addRoom = () => {
    if (!roomNumber.trim()) return;
    if (rooms.some(r => r.number === roomNumber.trim())) { setNumberError(`غرفة "${roomNumber}" موجودة!`); return; }
    setNumberError(""); const id = Date.now();
    setRooms(prev => [...prev, { id, number: roomNumber.trim(), floor: roomFloor.trim(), type: roomType, passengers: [] }]);
    setExpanded(prev => new Set([...prev, id])); setRoomNumber(""); setRoomFloor(""); setRoomType("مطل"); setShowAdd(false);
  };
  const addRange = () => {
    const from = parseInt(rangeFrom), to = parseInt(rangeTo);
    if (!from || !to || from > to) { setRangeError("تأكد من الأرقام"); return; }
    const newRooms: Room[] = [];
    const existingNums = new Set(rooms.map(r => r.number));
    for (let n = from; n <= to; n++) {
      const num = String(n);
      if (!existingNums.has(num)) newRooms.push({ id: Date.now() + n, number: num, floor: rangeFloor.trim(), type: rangeType, passengers: [] });
    }
    if (newRooms.length === 0) { setRangeError("كل الغرف في هذا النطاق موجودة بالفعل!"); return; }
    setRangeError(""); setRooms(prev => [...prev, ...newRooms]);
    setRangeFrom(""); setRangeTo(""); setRangeFloor(""); setRangeType("مطل"); setShowRange(false);
  };
  const handleExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").slice(1);
      const newRooms: Room[] = [];
      const existingNums = new Set(rooms.map(r => r.number));
      lines.forEach(line => {
        const parts = line.split(",");
        if (parts.length >= 2) {
          const num = parts[0]?.trim();
          const type = parts[1]?.trim() as Room["type"];
          const floor = parts[2]?.trim() || "";
          if (num && !existingNums.has(num) && ROOM_TYPES.includes(type)) newRooms.push({ id: Date.now() + Math.random(), number: num, floor, type, passengers: [] });
        }
      });
      if (newRooms.length > 0) setRooms(prev => [...prev, ...newRooms]);
      else alert("لم يتم إضافة غرف. تأكد من شكل الملف.");
    };
    reader.readAsText(file);
  };
  const deleteRoom = (id: number) => { const r = rooms.find(x => x.id === id); if (r && r.passengers.length > 0) { alert("أزل المسافرين الأول!"); return; } setRooms(prev => prev.filter(x => x.id !== id)); };
  const openAddP = (roomId: number) => { setCurrentRoomId(roomId); setSelectedP(new Set()); setPSearch(""); setShowAddP(true); };
  const toggleSelectP = (id: number) => setSelectedP(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const confirmAddP = () => { setRooms(prev => prev.map(r => { if (r.id !== currentRoomId) return r; const nl = [...r.passengers]; selectedP.forEach(id => { if (!nl.includes(id)) nl.push(id); }); return { ...r, passengers: nl }; })); setShowAddP(false); };
  const removeP = (pId: number, roomId: number) => setRooms(prev => prev.map(r => r.id !== roomId ? r : { ...r, passengers: r.passengers.filter(id => id !== pId) }));
  const moveP = (pId: number, fromId: number, toId: string) => { if (!toId) return; setRooms(prev => prev.map(r => { if (r.id === fromId) return { ...r, passengers: r.passengers.filter(id => id !== pId) }; if (r.id === parseInt(toId) && !r.passengers.includes(pId)) return { ...r, passengers: [...r.passengers, pId] }; return r; })); };
  const doPrint = (roomsToPrint: Room[]) => {
    const w = window.open("", "_blank"); if (!w) return;
    const half = Math.ceil(roomsToPrint.length / 2);
    const left = roomsToPrint.slice(0, half), right = roomsToPrint.slice(half);
    const renderRoom = (room: Room) => {
      const rp = room.passengers.map(id => passengers.find(p => p.id === id)).filter(Boolean) as Passenger[];
      const [bg] = ROOM_COLORS[room.type] || ["#f5f5f5"];
      return `<div style="margin-bottom:12px"><div style="background:${bg};padding:5px 10px;border:1px solid #ddd;border-bottom:none;font-size:11px;font-weight:bold;display:flex;justify-content:space-between"><span>${room.type}</span><span>${room.number}${room.floor ? ` (طابق ${room.floor})` : ""}</span></div><table style="width:100%;border-collapse:collapse;font-size:11px"><tr style="background:#f5f5f5"><th style="padding:4px 8px;border:1px solid #ddd;text-align:center;width:28px">م</th><th style="padding:4px 8px;border:1px solid #ddd;text-align:right">الاسم</th></tr>${rp.map((p, i) => `<tr><td style="padding:4px 8px;border:1px solid #ddd;text-align:center">${i + 1}</td><td style="padding:4px 8px;border:1px solid #ddd">${p.short_ar}</td></tr>`).join("")}</table></div>`;
    };
    w.document.write(`<html><head><title>تقرير الفندق</title><style>body{font-family:Arial;direction:rtl;padding:16px}h1{text-align:center}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}</style></head><body><h1>🏨 تقرير الفندق</h1><div class="grid"><div>${left.map(renderRoom).join("")}</div><div>${right.map(renderRoom).join("")}</div></div><script>window.print();</script></body></html>`);
    w.document.close();
  };
  const handlePrint = () => {
    let r = rooms;
    if (printFilter === "floor") r = rooms.filter(x => x.floor === printFloor);
    else if (printFilter === "type") r = rooms.filter(x => x.type === printType);
    doPrint(r); setShowPrint(false);
  };
  const currentRoom = rooms.find(r => r.id === currentRoomId);
  const filteredP = passengers.filter(p => !pSearch || p.name_ar.includes(pSearch));
  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
        {[["الغرف", rooms.length, "#111"], ["موزّعون", assigned.size, "#1D9E75"], ["غير موزّعين", passengers.length - assigned.size, passengers.length - assigned.size > 0 ? "#c0392b" : "#1D9E75"], ["الطوابق", floors.length, "#534AB7"]].map(([l, v, c]) => (
          <div key={l as string} style={{ background: "#f5f5f5", borderRadius: 8, padding: "10px 12px" }}><div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>{l as string}</div><div style={{ fontSize: 18, fontWeight: 500, color: c as string }}>{v as number}</div></div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={() => setShowAdd(true)} style={btnP({ flex: 1 })}>+ غرفة</button>
        <button onClick={() => setShowRange(true)} style={btnS({ flex: 1 })}>📋 نطاق</button>
        <button onClick={() => fileRef.current?.click()} style={btnS({ flex: 1 })}>📊 Excel</button>
        {rooms.length > 0 && <button onClick={() => setShowPrint(true)} style={btnS({ flex: 1 })}>🖨️ طباعة</button>}
        <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleExcel(e.target.files[0])} />
      </div>
      {!rooms.length ? <div style={{ textAlign: "center", padding: "2rem", color: "#aaa", fontSize: 12 }}><div style={{ fontSize: 32, marginBottom: 8 }}>🏨</div>لا يوجد غرف بعد</div> :
        rooms.map(room => {
          const isExpanded = expanded.has(room.id);
          const rp = room.passengers.map(id => passengers.find(p => p.id === id)).filter(Boolean) as Passenger[];
          const [typeBg, typeClr] = ROOM_COLORS[room.type] || ["#f5f5f5", "#333"];
          return (
            <div key={room.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
              <div onClick={() => toggleRoom(room.id)} style={{ padding: "9px 12px", background: "#f9f9f9", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: typeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🛏</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>غرفة {room.number} {room.floor && <span style={{ fontSize: 10, color: "#888" }}>ط{room.floor}</span>} <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: typeBg, color: typeClr }}>{room.type}</span></div>
                  <div style={{ fontSize: 11, color: "#888" }}>{rp.length} مسافر</div>
                </div>
                <button onClick={e => { e.stopPropagation(); openAddP(room.id); }} style={{ background: "#E1F5EE", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", color: "#085041" }}>+ إضافة</button>
                <button onClick={e => { e.stopPropagation(); deleteRoom(room.id); }} style={{ background: rp.length === 0 ? "#FBEAF0" : "#f5f5f5", border: "none", padding: "3px 7px", borderRadius: 6, fontSize: 11, cursor: rp.length === 0 ? "pointer" : "not-allowed", color: rp.length === 0 ? "#c0392b" : "#ccc" }}>🗑</button>
                <span style={{ color: "#aaa" }}>{isExpanded ? "▲" : "▼"}</span>
              </div>
              {isExpanded && (
                <div style={{ padding: "8px 12px", borderTop: "0.5px solid #e5e5e5" }}>
                  {rp.length ? rp.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 4px", borderRadius: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "#aaa", width: 18, textAlign: "center" }}>{i + 1}</span>
                      <Avatar name={p.name_ar} gender={p.gender} size={24} />
                      <span style={{ fontSize: 11, flex: 1 }}>{p.short_ar}</span>
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: ROOM_COLORS[p.services.hotel]?.[0] || "#f0f0f0", color: ROOM_COLORS[p.services.hotel]?.[1] || "#555" }}>طلب {p.services.hotel}</span>
                      {p.services.hotel !== room.type && <span style={{ fontSize: 9, color: "#e67e22" }}>⚠️</span>}
                      <select onChange={e => moveP(p.id, room.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}><option value="">نقل لـ...</option>{rooms.filter(r => r.id !== room.id).map(r => <option key={r.id} value={r.id}>غرفة {r.number}</option>)}</select>
                      <button onClick={() => removeP(p.id, room.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 12 }}>✕</button>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "10px", color: "#aaa", fontSize: 11 }}>لا يوجد مسافرون</div>}
                </div>
              )}
            </div>
          );
        })}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNumberError(""); }} title="🛏 غرفة جديدة" maxWidth={340}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>رقم الغرفة</div><input style={{ ...inp, borderColor: numberError ? "#c0392b" : "#ddd" }} value={roomNumber} onChange={e => { setRoomNumber(e.target.value); setNumberError(""); }} autoFocus onKeyDown={e => e.key === "Enter" && addRoom()} />{numberError && <div style={{ fontSize: 10, color: "#c0392b", marginTop: 3 }}>{numberError}</div>}</div>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>الطابق</div><input style={inp} value={roomFloor} onChange={e => setRoomFloor(e.target.value)} placeholder="مثال: 16" /></div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>نوع الغرفة</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {ROOM_TYPES.map(t => { const [bg, clr] = ROOM_COLORS[t]; return <div key={t} onClick={() => setRoomType(t)} style={{ flex: 1, minWidth: "45%", padding: 7, borderRadius: 8, border: `1.5px solid ${roomType === t ? clr : "#ddd"}`, background: roomType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: roomType === t ? clr : "#666", fontWeight: roomType === t ? 500 : 400 }}>{t}</div>; })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}><button onClick={addRoom} style={{ ...btnP(), flex: 1 }}>✓ إضافة</button><button onClick={() => { setShowAdd(false); setNumberError(""); }} style={btnS()}>إلغاء</button></div>
      </Modal>
      <Modal show={showRange} onClose={() => { setShowRange(false); setRangeError(""); }} title="📋 إضافة نطاق غرف" maxWidth={360}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>من رقم</div><input style={inp} type="number" value={rangeFrom} onChange={e => { setRangeFrom(e.target.value); setRangeError(""); }} placeholder="1601" /></div>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>إلى رقم</div><input style={inp} type="number" value={rangeTo} onChange={e => { setRangeTo(e.target.value); setRangeError(""); }} placeholder="1620" /></div>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>الطابق</div><input style={inp} value={rangeFloor} onChange={e => setRangeFloor(e.target.value)} placeholder="16" /></div>
        </div>
        {rangeError && <div style={{ fontSize: 11, color: "#c0392b", marginBottom: 8 }}>{rangeError}</div>}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>نوع الغرف</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {ROOM_TYPES.map(t => { const [bg, clr] = ROOM_COLORS[t]; return <div key={t} onClick={() => setRangeType(t)} style={{ flex: 1, minWidth: "45%", padding: 7, borderRadius: 8, border: `1.5px solid ${rangeType === t ? clr : "#ddd"}`, background: rangeType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: rangeType === t ? clr : "#666", fontWeight: rangeType === t ? 500 : 400 }}>{t}</div>; })}
          </div>
        </div>
        {rangeFrom && rangeTo && parseInt(rangeFrom) <= parseInt(rangeTo) && <div style={{ fontSize: 11, color: "#1D9E75", marginBottom: 10, background: "#E1F5EE", padding: "6px 10px", borderRadius: 8 }}>سيتم إضافة {parseInt(rangeTo) - parseInt(rangeFrom) + 1} غرفة</div>}
        <div style={{ display: "flex", gap: 8 }}><button onClick={addRange} style={{ ...btnP(), flex: 1 }}>✓ إضافة</button><button onClick={() => { setShowRange(false); setRangeError(""); }} style={btnS()}>إلغاء</button></div>
      </Modal>
      <Modal show={showAddP} onClose={() => setShowAddP(false)} title={`إضافة مسافرين — غرفة ${currentRoom?.number}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "#aaa" }}>🔍</span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={pSearch} onChange={e => setPSearch(e.target.value)} />
        </div>
        {filteredP.map(p => {
          const isInRoom = currentRoom?.passengers.includes(p.id);
          const isAssigned = assigned.has(p.id) && !isInRoom;
          const isSel = selectedP.has(p.id);
          const [reqBg, reqClr] = ROOM_COLORS[p.services.hotel] || ["#f0f0f0", "#555"];
          return (
            <div key={p.id} onClick={() => !isAssigned && !isInRoom && toggleSelectP(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: isAssigned || isInRoom ? "not-allowed" : "pointer", background: isSel ? "#E1F5EE" : "transparent", border: `0.5px solid ${isSel ? "#5DCAA5" : "transparent"}`, opacity: isAssigned ? 0.4 : 1 }}>
              <Avatar name={p.name_ar} gender={p.gender} size={28} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar}</div><div style={{ fontSize: 10, color: "#888" }}>{isInRoom ? "✓ في الغرفة" : isAssigned ? "موزّع" : "غير موزّع"}</div></div>
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: reqBg, color: reqClr }}>طلب {p.services.hotel}</span>
              {isSel && <span style={{ color: "#1D9E75" }}>✓</span>}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button onClick={confirmAddP} style={{ ...btnP(), flex: 1 }}>✓ إضافة ({selectedP.size})</button><button onClick={() => setShowAddP(false)} style={btnS()}>إلغاء</button></div>
      </Modal>
      <Modal show={showPrint} onClose={() => setShowPrint(false)} title="🖨️ خيارات الطباعة" maxWidth={340}>
        {[["all", "طباعة كل الغرف"], ["floor", "طباعة دور معين"], ["type", "طباعة نوع معين"]].map(([val, label]) => (
          <div key={val} onClick={() => setPrintFilter(val as any)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 6, background: printFilter === val ? "#E1F5EE" : "#f9f9f9", border: `0.5px solid ${printFilter === val ? "#5DCAA5" : "#e5e5e5"}` }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: printFilter === val ? "#1D9E75" : "white", border: `2px solid ${printFilter === val ? "#1D9E75" : "#ccc"}` }} />
            <span style={{ fontSize: 12 }}>{label}</span>
          </div>
        ))}
        {printFilter === "floor" && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>اختر الطابق</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {floors.map(f => <div key={f} onClick={() => setPrintFloor(f)} style={{ padding: "5px 12px", borderRadius: 99, border: `1.5px solid ${printFloor === f ? "#1D9E75" : "#ddd"}`, background: printFloor === f ? "#E1F5EE" : "transparent", cursor: "pointer", fontSize: 12, color: printFloor === f ? "#085041" : "#666" }}>طابق {f}</div>)}
              {floors.length === 0 && <div style={{ fontSize: 11, color: "#aaa" }}>لا يوجد طوابق</div>}
            </div>
          </div>
        )}
        {printFilter === "type" && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>اختر نوع الغرفة</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {ROOM_TYPES.map(t => { const [bg, clr] = ROOM_COLORS[t]; return <div key={t} onClick={() => setPrintType(t)} style={{ flex: 1, padding: 6, borderRadius: 8, border: `1.5px solid ${printType === t ? clr : "#ddd"}`, background: printType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: printType === t ? clr : "#666" }}>{t}</div>; })}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button onClick={handlePrint} style={{ ...btnP(), flex: 1 }}>🖨️ طباعة</button><button onClick={() => setShowPrint(false)} style={btnS()}>إلغاء</button></div>
      </Modal>
    </div>
  );
}

function ReportsPage({ passengers }: { passengers: Passenger[] }) {
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const reports = [
    { id: "flight", name: "تقرير الطيران", icon: "✈️", desc: "كشف الحجاج (التذاكر)", color: "#E6F1FB" },
    { id: "buses", name: "تقرير الباصات", icon: "🚌", desc: "توزيع المسافرين", color: "#EEEDFE" },
    { id: "mina", name: "تقرير منى", icon: "⛺", desc: "مخيمات منى", color: "#E1F5EE" },
    { id: "arafa", name: "تقرير عرفة", icon: "🏔", desc: "مخيمات عرفة", color: "#FAEEDA" },
    { id: "hotel", name: "تقرير الفندق", icon: "🏨", desc: "توزيع الغرف", color: "#FBEAF0" },
  ];
  const printFlightReport = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>كشف الحجاج</title><style>body{font-family:Arial;direction:rtl;padding:20px}h1{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:7px 10px;text-align:center}th{background:#1D9E75;color:white}tr:nth-child(even){background:#f9f9f9}</style></head><body><h1>كشف الحجاج ( التذاكر )</h1><table><tr><th>S.N.</th><th>NAME</th><th>NAT.</th><th>P.NO.</th><th>TEL. NO.</th><th>GENDER</th><th>NOTE</th></tr>${passengers.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name_en}</td><td>${p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat}</td><td>${p.passport}</td><td>${p.phone || "—"}</td><td>${p.gender === "ذكر" ? "MR." : "MRS."}</td><td>${p.services?.flight === "درجة أولى" ? "First Class" : ""}</td></tr>`).join("")}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };
  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      {!activeReport ? (
        <>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>اختر التقرير</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {reports.map(r => (
              <div key={r.id} onClick={() => setActiveReport(r.id)} style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                onMouseEnter={e => e.currentTarget.style.background = "#f9f9f9"} onMouseLeave={e => e.currentTarget.style.background = "white"}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: r.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{r.icon}</div>
                <div><div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div><div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{r.desc}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "#E1F5EE", color: "#085041" }}>Excel</span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "#FAEEDA", color: "#633806" }}>PDF</span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "#f0f0f0", color: "#555" }}>🖨️</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div>
          <button onClick={() => setActiveReport(null)} style={{ ...btnS(), marginBottom: 14 }}>← رجوع</button>
          {activeReport === "flight" && (
            <>
              <div style={{ textAlign: "center", fontSize: 16, fontWeight: 600, marginBottom: 14 }}>كشف الحجاج ( التذاكر )</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, direction: "ltr" }}>
                <thead><tr style={{ background: "#1D9E75", color: "white" }}>{["S.N.", "NAME", "NAT.", "P.NO.", "TEL.", "GENDER", "NOTE"].map(h => <th key={h} style={{ padding: "7px 8px", border: "1px solid #ccc", textAlign: "center" }}>{h}</th>)}</tr></thead>
                <tbody>{passengers.map((p, i) => (<tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#f9f9f9" }}>
                  <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", textAlign: "center" }}>{i + 1}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", fontWeight: 500 }}>{p.name_en}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", textAlign: "center" }}>{p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", textAlign: "center" }}>{p.passport}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", textAlign: "center" }}>{p.phone || "—"}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", textAlign: "center" }}>{p.gender === "ذكر" ? "MR." : "MRS."}</td>
                  <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", textAlign: "center" }}>{p.services?.flight === "درجة أولى" ? "⭐ First" : ""}</td>
                </tr>))}</tbody>
              </table>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button style={btnP({ flex: 1 })}>⬇️ Excel</button>
                <button style={btnS({ flex: 1 })}>📄 PDF</button>
                <button onClick={printFlightReport} style={btnS({ flex: 1 })}>🖨️ طباعة</button>
              </div>
            </>
          )}
          {activeReport !== "flight" && <div style={{ textAlign: "center", padding: "2rem", color: "#aaa" }}><div style={{ fontSize: 32, marginBottom: 8 }}>{reports.find(r => r.id === activeReport)?.icon}</div><div style={{ fontSize: 13 }}>وزّع الحجاج أول من صفحات التنظيم</div></div>}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [page, setPage] = useState("dash");
  const [passengers, setPassengers] = useState<Passenger[]>([]);

  useEffect(() => {
    const loadPassengers = async () => {
      const { data, error } = await supabase.from("passengers").select("*").order("created_at", { ascending: false });
      if (!error && data) {
        const mapped = data.map((p: any) => ({
          id: p.id, name_ar: p.name_ar || "", name_en: p.name_en || "",
          short_ar: p.short_ar || "", short_en: p.short_en || "",
          passport: p.passport || "", national_id: p.national_id || "",
          nat: p.nat || "", dob: p.dob || "", expiry: p.expiry || "",
          gender: p.gender || "", phone: p.phone || "",
          services: { bus: p.bus || "عادي", flight: p.flight || "عادي", hotel: p.hotel || "مطل", camp_mina: p.camp_mina || "عادي", camp_arafa: p.camp_arafa || "عادي" },
          rel: "", linked: -1
        }));
        setPassengers(mapped);
      }
    };
    loadPassengers();
  }, []);
  if (!currentUser) return <LoginPage onLogin={setCurrentUser} />;
  const pageTitles: Record<string, string> = { dash: "لوحة التحكم", scan: "رفع وثيقة", passengers: "المسافرون", buses: "الباصات", mina: "مخيمات منى", arafa: "مخيمات عرفة", hotel: "الفندق", reports: "التقارير", users: "المستخدمين" };
  const renderPage = () => {
    switch (page) {
      case "dash": return <Dashboard passengers={passengers} setPage={setPage} />;
      case "scan": return <ScanPage passengers={passengers} setPassengers={setPassengers} />;
      case "passengers": return <PassengersPage passengers={passengers} setPassengers={setPassengers} />;
      case "buses": return <BusesPage passengers={passengers} />;
      case "mina": return <CampsPage pageType="منى" passengers={passengers} />;
      case "arafa": return <CampsPage pageType="عرفة" passengers={passengers} />;
      case "hotel": return <HotelPage passengers={passengers} />;
      case "reports": return <ReportsPage passengers={passengers} />;
      case "users": return <UsersPage currentUser={currentUser} />;
      default: return <Dashboard passengers={passengers} setPage={setPage} />;
    }
  };
  return (
    <div style={{ display: "flex", height: "100vh", direction: "rtl", fontFamily: "system-ui,-apple-system,sans-serif", background: "white", overflow: "hidden" }}>
      <Sidebar page={page} setPage={setPage} count={passengers.length} currentUser={currentUser} onLogout={() => { setCurrentUser(null); setPage("dash"); }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: "0.5px solid #e5e5e5", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{pageTitles[page]}</div>
          <div style={{ fontSize: 11, color: "#888" }}>حملة الأقصى · موسم 1447</div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>{renderPage()}</div>
      </div>
    </div>
  );
}
