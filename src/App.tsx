import { useState } from "react";

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
  services: {
    bus: string;
    flight: string;
    hotel: string;
    camp_mina: string;
    camp_arafa: string;
  };
  rel: string;
  linked: number;
}

interface User {
  id: number;
  name: string;
  username: string;
  password: string;
  permissions: Record<string, boolean>;
}

interface Bus {
  id: number;
  name: string;
  type: string;
  passengers: number[];
}

// ===== PERMISSIONS =====
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

const ADMIN_PERMISSIONS = Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, true]));

const INIT_USERS: User[] = [
  { id: 1, name: "المدير العام", username: "admin", password: "admin123", permissions: ADMIN_PERMISSIONS },
];

// ===== NAV =====
const NAV = [
  { section: "الرئيسية", items: [{ id: "dash", label: "📊 لوحة التحكم" }] },
  { section: "التسجيل", items: [{ id: "scan", label: "🔍 رفع وثيقة" }, { id: "passengers", label: "👥 المسافرون" }] },
  { section: "التنظيم", items: [{ id: "buses", label: "🚌 الباصات" }, { id: "mina", label: "⛺ مخيمات منى" }, { id: "arafa", label: "🏔 مخيمات عرفة" }, { id: "hotel", label: "🏨 الفندق" }] },
  { section: "التقارير", items: [{ id: "reports", label: "📄 التقارير" }] },
  { section: "الإعدادات", items: [{ id: "users", label: "👥 المستخدمين" }] },
];

// ===== LOGIN PAGE =====
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

  const inp = { fontSize: 13, background: "#f5f5f5", border: "1px solid #e0e0e0", borderRadius: 8, padding: "10px 12px", width: "100%", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #E1F5EE 0%, #f0f9ff 100%)", direction: "rtl", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ background: "white", borderRadius: 16, padding: "40px 32px", width: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>✈️</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>نظام الحج</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>حملة الأقصى — قطر</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 5 }}>اسم المستخدم</div>
          <input style={inp} value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="أدخل اسم المستخدم" autoFocus />
        </div>

        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 5 }}>كلمة المرور</div>
          <div style={{ position: "relative" }}>
            <input style={{ ...inp, paddingLeft: 36 }} type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="أدخل كلمة المرور" />
            <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 16 }}>{showPass ? "🙈" : "👁"}</button>
          </div>
        </div>

        {error && <div style={{ fontSize: 12, color: "#c0392b", marginBottom: 12, textAlign: "center", background: "#FBEAF0", padding: "6px 10px", borderRadius: 8 }}>{error}</div>}

        <button onClick={handleLogin} style={{ width: "100%", background: "#1D9E75", color: "white", border: "none", padding: 12, borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 600, marginTop: 8 }}>دخول</button>

        <div style={{ marginTop: 20, padding: 12, background: "#f9f9f9", borderRadius: 8, fontSize: 11, color: "#888" }}>
          <div style={{ fontWeight: 500, marginBottom: 4, color: "#666" }}>حساب تجريبي:</div>
          <div>👑 admin / admin123</div>
        </div>
      </div>
    </div>
  );
}

// ===== USERS PAGE =====
function UsersPage({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<User[]>(INIT_USERS);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [perms, setPerms] = useState<Record<string, boolean>>({});

  const openAdd = () => { setForm({ name: "", username: "", password: "" }); setPerms(Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, false]))); setShowAdd(true); setEditUser(null); };
  const openEdit = (u: User) => { setForm({ name: u.name, username: u.username, password: u.password }); setPerms({ ...u.permissions }); setEditUser(u); setShowAdd(true); };
  const togglePerm = (key: string) => setPerms(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleAll = () => { const allOn = ALL_PERMISSIONS.every(p => perms[p.key]); setPerms(Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, !allOn]))); };

  const saveUser = () => {
    if (!form.name || !form.username || !form.password) return;
    if (editUser) {
      setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, ...form, permissions: perms } : u));
    } else {
      setUsers(prev => [...prev, { id: Date.now(), ...form, permissions: perms }]);
    }
    setShowAdd(false);
  };

  const deleteUser = (id: number) => { if (id === 1) return; setUsers(prev => prev.filter(u => u.id !== id)); };

  const inp = { fontSize: 12, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 8, padding: "8px 10px", width: "100%", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const };

  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%", position: "relative" }}>
      {currentUser.permissions.manage_users && (
        <button onClick={openAdd} style={{ width: "100%", background: "#1D9E75", color: "white", border: "none", padding: 9, borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500, marginBottom: 14 }}>+ مستخدم جديد</button>
      )}

      {users.map(u => (
        <div key={u.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: u.id === 1 ? "#E1F5EE" : "#EEEDFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{u.id === 1 ? "👑" : "👤"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>@{u.username} · {Object.values(u.permissions).filter(Boolean).length} صلاحية</div>
          </div>
          {currentUser.permissions.manage_users && u.id !== 1 && (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => openEdit(u)} style={{ background: "#E6F1FB", border: "none", padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "#0C447C" }}>✏️ تعديل</button>
              <button onClick={() => deleteUser(u.id)} style={{ background: "#FBEAF0", border: "none", padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "#c0392b" }}>🗑</button>
            </div>
          )}
        </div>
      ))}

      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 12, width: "90%", maxWidth: 440, maxHeight: "88%", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "white" }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{editUser ? "تعديل مستخدم" : "مستخدم جديد"}</div>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div><div style={{ fontSize: 11, color: "#666", marginBottom: 3 }}>الاسم</div><input style={inp} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="الاسم الكامل" /></div>
                <div><div style={{ fontSize: 11, color: "#666", marginBottom: 3 }}>اسم المستخدم</div><input style={inp} value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder="username" /></div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 3 }}>كلمة المرور</div>
                <input style={inp} type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>الصلاحيات</div>
                <div onClick={toggleAll} style={{ fontSize: 11, color: "#1D9E75", cursor: "pointer" }}>{ALL_PERMISSIONS.every(p => perms[p.key]) ? "إلغاء الكل" : "تحديد الكل"}</div>
              </div>
              {ALL_PERMISSIONS.map(p => (
                <div key={p.key} onClick={() => togglePerm(p.key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 4, background: perms[p.key] ? "#E1F5EE" : "#f9f9f9", border: `0.5px solid ${perms[p.key] ? "#5DCAA5" : "#e5e5e5"}` }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, background: perms[p.key] ? "#1D9E75" : "white", border: `1.5px solid ${perms[p.key] ? "#1D9E75" : "#ccc"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {perms[p.key] && <span style={{ color: "white", fontSize: 11 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 12 }}>{p.label}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={saveUser} style={{ flex: 1, background: "#1D9E75", color: "white", border: "none", padding: 9, borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>✓ حفظ</button>
                <button onClick={() => setShowAdd(false)} style={{ background: "transparent", border: "0.5px solid #ddd", padding: "9px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== AVATAR =====
function Avatar({ name, gender, size = 32 }: { name: string; gender: string; size?: number }) {
  const initials = name.split(" ").slice(0, 2).map((w: string) => w[0] || "").join("");
  const isFemale = gender === "أنثى";
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: isFemale ? "#FBEAF0" : "#E1F5EE", color: isFemale ? "#72243E" : "#085041", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.33, fontWeight: 500, flexShrink: 0 }}>{initials}</div>
  );
}

// ===== SIDEBAR =====
function Sidebar({ page, setPage, count, currentUser, onLogout }: { page: string; setPage: (p: string) => void; count: number; currentUser: User; onLogout: () => void }) {
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
        <div style={{ fontSize: 11, fontWeight: 500, color: "#333" }}>{currentUser.name}</div>
        <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>@{currentUser.username}</div>
        <button onClick={onLogout} style={{ marginTop: 8, width: "100%", background: "#FBEAF0", border: "none", padding: "5px", borderRadius: 6, fontSize: 11, cursor: "pointer", color: "#c0392b" }}>تسجيل خروج</button>
      </div>
    </div>
  );
}

// ===== DASHBOARD =====
function Dashboard({ passengers, setPage }: { passengers: Passenger[]; setPage: (p: string) => void }) {
  const males = passengers.filter(p => p.gender === "ذكر").length;
  const females = passengers.filter(p => p.gender === "أنثى").length;
  const vip = passengers.filter(p => p.services?.bus === "VIP").length;
  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
        {[["👥 إجمالي الحجاج", passengers.length, "#111"], ["👨 رجال", males, "#0C447C"], ["👩 نساء", females, "#72243E"], ["⭐ VIP", vip, "#633806"]].map(([label, val, color]) => (
          <div key={label as string} style={{ background: "#f5f5f5", borderRadius: 10, padding: "14px 12px" }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label as string}</div>
            <div style={{ fontSize: 26, fontWeight: 600, color: color as string }}>{val as number}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "#f9f9f9", borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>⚡ وصول سريع</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[["🔍 رفع وثيقة جديدة", "scan"], ["👥 قائمة الحجاج", "passengers"], ["🚌 توزيع الباصات", "buses"], ["📄 التقارير", "reports"]].map(([label, id]) => (
            <div key={id as string} onClick={() => setPage(id as string)} style={{ padding: "10px 12px", border: "0.5px solid #e5e5e5", borderRadius: 8, cursor: "pointer", fontSize: 12, background: "white" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#E1F5EE")}
              onMouseLeave={e => (e.currentTarget.style.background = "white")}>{label as string}</div>
          ))}
        </div>
      </div>
      {passengers.length > 0 && (
        <div style={{ background: "white", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>🕐 آخر المضافين</div>
          {passengers.slice(-4).reverse().map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "0.5px solid #f5f5f5" }}>
              <Avatar name={p.name_ar} gender={p.gender} size={30} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar}</div>
                <div style={{ fontSize: 10, color: "#888" }}>{p.nat} · {p.passport}</div>
              </div>
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
    const msgs = ["جاري تحليل الجواز...", "استخراج البيانات...", "التحقق من المعلومات..."];
    let p = 0;
    const iv = setInterval(() => { p = Math.min(p + Math.random() * 20, 85); setProgress(p); setStatusMsg(msgs[Math.min(Math.floor(p / 30), 2)]); }, 400);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1000,
            messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: file.type, data: base64 } }, { type: "text", text: `استخرج بيانات جواز السفر وأجب فقط بـ JSON: {"name_en":"","name_ar":"","short_en":"","short_ar":"","passport":"","national_id":"الرقم الشخصي من الجواز القطري أو المصري","nationality":"","dob":"","expiry":"","gender":"ذكر أو أنثى"}` }] }]
          })
        });
        const data = await res.json();
        clearInterval(iv); setProgress(100); setStatusMsg("تم الاستخراج بنجاح!");
        setTimeout(() => {
          setLoading(false);
          const text = data.content.map((i: any) => i.text || "").join("");
          let parsed: any = {};
          try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); } catch {}
          setForm(prev => ({ ...prev, name_en: parsed.name_en || "", name_ar: parsed.name_ar || "", short_en: parsed.short_en || "", short_ar: parsed.short_ar || "", passport: parsed.passport || "", national_id: parsed.national_id || "", nat: parsed.nationality || "قطري", dob: parsed.dob || "", expiry: parsed.expiry || "", gender: parsed.gender || "" }));
          setShowFields(true);
        }, 500);
      } catch { clearInterval(iv); setLoading(false); setShowFields(true); }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const newP: Passenger = { id: Date.now(), ...form, services, rel: "", linked: -1 };
    setPassengers([...passengers, newP]);
    setSaved(true);
  };

  const reset = () => { setForm({ name_en: "", name_ar: "", short_en: "", short_ar: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", gender: "", phone: "" }); setServices({ bus: "عادي", flight: "عادي", hotel: "مطل", camp_mina: "عادي", camp_arafa: "عادي" }); setPreviewImg(null); setShowFields(false); setSaved(false); };

  const inp = { fontSize: 12, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 8, padding: "7px 10px", width: "100%", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const };

  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
      {saved && <div style={{ background: "#E1F5EE", border: "0.5px solid #5DCAA5", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 12, color: "#085041" }}>✓ تم حفظ الحاج! <button onClick={reset} style={{ marginRight: "auto", background: "#1D9E75", color: "white", border: "none", padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>+ حاج جديد</button></div>}
      <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>🛂 رفع جواز السفر</div>
        {!previewImg ? (
          <div onClick={() => document.getElementById("passport-upload")?.click()} style={{ border: "1.5px dashed #ddd", borderRadius: 10, padding: "24px", textAlign: "center", cursor: "pointer", background: "#f9f9f9" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🛂</div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3 }}>ارفع صورة جواز السفر</div>
            <div style={{ fontSize: 11, color: "#888" }}>الذكاء الاصطناعي يستخرج البيانات تلقائياً</div>
            <input id="passport-upload" type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <img src={previewImg} style={{ width: 140, height: 100, objectFit: "cover", borderRadius: 8, border: "0.5px solid #e5e5e5" }} />
            <div style={{ flex: 1 }}>
              {loading ? (<><div style={{ background: "#f0f0f0", borderRadius: 99, height: 4, overflow: "hidden", marginBottom: 6 }}><div style={{ width: `${progress}%`, height: "100%", background: "#1D9E75", borderRadius: 99, transition: "width 0.3s" }} /></div><div style={{ fontSize: 11, color: "#888" }}>{statusMsg}</div></>) : (<div style={{ fontSize: 11, color: "#1D9E75", fontWeight: 500 }}>✓ {statusMsg}</div>)}
              <button onClick={reset} style={{ marginTop: 8, background: "none", border: "0.5px solid #ddd", padding: "3px 10px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "#888" }}>تغيير</button>
            </div>
          </div>
        )}
      </div>
      {showFields && (<>
        <div style={{ border: "0.5px solid #5DCAA5", borderRadius: 12, padding: "12px 14px", marginBottom: 12, background: "#FAFFFD" }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>👤 البيانات الشخصية <span style={{ fontSize: 10, background: "#E1F5EE", color: "#085041", padding: "1px 7px", borderRadius: 99 }}>✨ مستخرجة تلقائياً</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["الاسم الكامل بالإنجليزي", "name_en", "1/-1"], ["الاسم الكامل بالعربي", "name_ar", "1/-1"], ["الاسم المختصر إنجليزي", "short_en", ""], ["الاسم المختصر عربي", "short_ar", ""], ["رقم الجواز", "passport", ""], ["الرقم الشخصي", "national_id", ""], ["الجنسية", "nat", ""], ["رقم التليفون", "phone", ""], ["تاريخ الميلاد", "dob", ""], ["انتهاء الجواز", "expiry", ""]].map(([label, key, col]) => (
              <div key={key as string} style={{ gridColumn: col as string || "auto" }}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>{label as string}</div>
                <input style={{ ...inp, borderColor: "#5DCAA5", background: "#E1F5EE" }} value={(form as any)[key as string]} onChange={e => setField(key as string, e.target.value)} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>الجنس</div>
              <select style={{ ...inp, borderColor: "#5DCAA5", background: "#E1F5EE" }} value={form.gender} onChange={e => setField("gender", e.target.value)}>
                <option value="">—</option><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option>
              </select>
            </div>
          </div>
        </div>
        <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>⭐ الخدمات المطلوبة</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["🚌 الباص", "bus", ["عادي", "VIP"]], ["✈️ الطيران", "flight", ["عادي", "درجة أولى"]], ["🏨 الفندق", "hotel", ["مطل", "جانبي", "داخلي"]], ["⛺ مخيم منى", "camp_mina", ["عادي", "خاص"]], ["🏔 مخيم عرفة", "camp_arafa", ["عادي", "خاص"]]].map(([label, key, opts]) => (
              <div key={key as string}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{label as string}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {(opts as string[]).map(o => (
                    <div key={o} onClick={() => setService(key as string, o)} style={{ flex: 1, padding: "5px 4px", borderRadius: 8, border: `1.5px solid ${(services as any)[key as string] === o ? "#1D9E75" : "#ddd"}`, background: (services as any)[key as string] === o ? "#E1F5EE" : "transparent", cursor: "pointer", fontSize: 10, color: (services as any)[key as string] === o ? "#085041" : "#666", textAlign: "center", fontWeight: (services as any)[key as string] === o ? 500 : 400 }}>{o}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleSave} style={{ flex: 1, background: "#1D9E75", color: "white", border: "none", padding: "10px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 500 }}>{saved ? "✓ تم الحفظ" : "💾 حفظ الحاج"}</button>
          <button onClick={reset} style={{ background: "transparent", border: "0.5px solid #ddd", padding: "10px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", color: "#333" }}>مسح</button>
        </div>
      </>)}
    </div>
  );
}

// ===== PASSENGERS PAGE =====
function PassengersPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Passenger | null>(null);
  const [editing, setEditing] = useState<Passenger | null>(null);

  const filtered = passengers.filter(p => !search || [p.name_ar, p.name_en, p.passport, p.national_id, p.nat, p.phone, p.gender, p.services?.bus].join(" ").toLowerCase().includes(search.toLowerCase()));
  const deleteP = (id: number) => { setPassengers(passengers.filter(p => p.id !== id)); setSelected(null); };
  const saveEdit = (p: Passenger) => { setPassengers(passengers.map(x => x.id === p.id ? p : x)); setEditing(null); setSelected(p); };

  const inp = { fontSize: 12, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 8, padding: "7px 10px", width: "100%", fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const };

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
          {[["🛂", selected.passport], ["🪪", selected.national_id], ["🌍", selected.nat], ["🎂", selected.dob], ["📞", selected.phone]].filter(([, v]) => v).map(([icon, val]) => (
            <div key={icon as string} style={{ background: "#f9f9f9", borderRadius: 8, padding: "6px 10px", marginBottom: 5, fontSize: 12 }}>{icon as string} {val as string}</div>
          ))}
          <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginTop: 10, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6 }}>⭐ الخدمات</div>
            {[["🚌", selected.services?.bus], ["✈️", selected.services?.flight], ["🏨", selected.services?.hotel], ["⛺", selected.services?.camp_mina], ["🏔", selected.services?.camp_arafa]].map(([icon, val]) => (
              <div key={icon as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "0.5px solid #f5f5f5" }}>
                <span style={{ color: "#888" }}>{icon as string}</span>
                <span style={{ fontWeight: 500 }}>{val as string}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditing(selected)} style={{ flex: 1, background: "#E6F1FB", border: "none", padding: "8px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "#0C447C" }}>✏️ تعديل</button>
            <button onClick={() => { if (confirm("هتمسح الحاج ده؟")) deleteP(selected.id); }} style={{ background: "#FBEAF0", border: "none", padding: "8px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "#c0392b" }}>🗑</button>
          </div>
        </div>
      )}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 12, width: "90%", maxWidth: 460, maxHeight: "85%", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "white" }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>تعديل بيانات الحاج</div>
              <button onClick={() => setEditing(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[["الاسم بالعربي", "name_ar"], ["الاسم بالإنجليزي", "name_en"], ["المختصر عربي", "short_ar"], ["المختصر إنجليزي", "short_en"], ["رقم الجواز", "passport"], ["الرقم الشخصي", "national_id"], ["الجنسية", "nat"], ["التليفون", "phone"], ["تاريخ الميلاد", "dob"], ["انتهاء الجواز", "expiry"]].map(([label, key]) => (
                  <div key={key as string}>
                    <div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>{label as string}</div>
                    <input style={inp} value={(editing as any)[key as string] || ""} onChange={e => setEditing({ ...editing, [key as string]: e.target.value })} />
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>الجنس</div>
                  <select style={inp} value={editing.gender} onChange={e => setEditing({ ...editing, gender: e.target.value })}>
                    <option value="ذكر">ذكر</option><option value="أنثى">أنثى</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={() => saveEdit(editing)} style={{ flex: 1, background: "#1D9E75", color: "white", border: "none", padding: "9px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>✓ حفظ</button>
                <button onClick={() => setEditing(null)} style={{ background: "transparent", border: "0.5px solid #ddd", padding: "9px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== BUSES PAGE =====
function BusesPage({ passengers }: { passengers: Passenger[] }) {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [expanded, setExpanded] = useState(new Set<number>());
  const [showAdd, setShowAdd] = useState(false);
  const [showAddP, setShowAddP] = useState(false);
  const [busName, setBusName] = useState("");
  const [busType, setBusType] = useState("عادي");
  const [currentBusId, setCurrentBusId] = useState<number | null>(null);
  const [selectedP, setSelectedP] = useState(new Set<number>());
  const [pSearch, setPSearch] = useState("");

  const getAssigned = () => { const s = new Set<number>(); buses.forEach(b => b.passengers.forEach(id => s.add(id))); return s; };
  const assigned = getAssigned();
  const toggleBus = (id: number) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const addBus = () => { if (!busName.trim()) return; const id = Date.now(); setBuses(prev => [...prev, { id, name: busName.trim(), type: busType, passengers: [] }]); setExpanded(prev => new Set([...prev, id])); setBusName(""); setBusType("عادي"); setShowAdd(false); };
  const openAddP = (busId: number) => { setCurrentBusId(busId); setSelectedP(new Set()); setPSearch(""); setShowAddP(true); };
  const toggleSelectP = (id: number) => setSelectedP(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const confirmAddP = () => { setBuses(prev => prev.map(b => { if (b.id !== currentBusId) return b; const newList = [...b.passengers]; selectedP.forEach(id => { if (!newList.includes(id)) newList.push(id); }); return { ...b, passengers: newList }; })); setShowAddP(false); };
  const removeP = (pId: number, busId: number) => setBuses(prev => prev.map(b => b.id !== busId ? b : { ...b, passengers: b.passengers.filter(id => id !== pId) }));
  const moveP = (pId: number, fromId: number, toId: string) => { if (!toId) return; setBuses(prev => prev.map(b => { if (b.id === fromId) return { ...b, passengers: b.passengers.filter(id => id !== pId) }; if (b.id === parseInt(toId) && !b.passengers.includes(pId)) return { ...b, passengers: [...b.passengers, pId] }; return b; })); };

  const currentBus = buses.find(b => b.id === currentBusId);
  const filteredP = passengers.filter(p => !pSearch || p.name_ar.includes(pSearch));

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%", position: "relative" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
        {[["الباصات", buses.length, "#111"], ["موزّعون", assigned.size, "#1D9E75"], ["غير موزّعين", passengers.length - assigned.size, passengers.length - assigned.size > 0 ? "#c0392b" : "#1D9E75"]].map(([l, v, c]) => (
          <div key={l as string} style={{ background: "#f5f5f5", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 3 }}>{l as string}</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: c as string }}>{v as number}</div>
          </div>
        ))}
      </div>
      <button onClick={() => setShowAdd(true)} style={{ width: "100%", background: "#1D9E75", color: "white", border: "none", padding: "9px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500, marginBottom: 12 }}>+ باص جديد</button>
      {!buses.length ? <div style={{ textAlign: "center", padding: "2rem", color: "#aaa", fontSize: 12 }}>🚌<br />لا يوجد باصات بعد</div> :
        buses.map(bus => {
          const isExpanded = expanded.has(bus.id);
          const busPassengers = bus.passengers.map(id => passengers.find(p => p.id === id)).filter(Boolean) as Passenger[];
          const isVIP = bus.type === "VIP";
          return (
            <div key={bus.id} style={{ border: `0.5px solid ${isVIP ? "#F5C842" : "#e5e5e5"}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
              <div onClick={() => toggleBus(bus.id)} style={{ padding: "10px 12px", background: isVIP ? "#FFFBEA" : "#f9f9f9", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 18 }}>🚌</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>{bus.name} <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isVIP ? "#FAEEDA" : "#EEEDFE", color: isVIP ? "#633806" : "#3C3489" }}>{isVIP ? "⭐ VIP" : "عادي"}</span></div>
                  <div style={{ fontSize: 11, color: "#888" }}>{busPassengers.length} مسافر</div>
                </div>
                <button onClick={e => { e.stopPropagation(); openAddP(bus.id); }} style={{ background: "#E1F5EE", border: "none", padding: "3px 9px", borderRadius: 6, fontSize: 11, cursor: "pointer", color: "#085041" }}>+ إضافة</button>
                <button onClick={e => { e.stopPropagation(); setBuses(prev => prev.filter(b => b.id !== bus.id)); }} style={{ background: "none", border: "0.5px solid #fcc", padding: "3px 7px", borderRadius: 6, fontSize: 11, cursor: "pointer", color: "#c0392b" }}>🗑</button>
                <span style={{ color: "#aaa" }}>{isExpanded ? "▲" : "▼"}</span>
              </div>
              {isExpanded && (
                <div style={{ padding: "8px 12px", borderTop: `0.5px solid ${isVIP ? "#F5C842" : "#e5e5e5"}` }}>
                  {busPassengers.length ? busPassengers.map((p, i) => (
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
      {showAdd && (
        <div onClick={() => setShowAdd(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 12, width: 340, padding: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>🚌 إضافة باص جديد</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>اسم الباص</div>
              <input value={busName} onChange={e => setBusName(e.target.value)} style={{ fontSize: 12, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 8, padding: "8px 10px", width: "100%", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} placeholder="مثال: باص 1، باص VIP..." autoFocus onKeyDown={e => e.key === "Enter" && addBus()} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>نوع الباص</div>
              <div style={{ display: "flex", gap: 8 }}>
                {["عادي", "VIP"].map(t => <div key={t} onClick={() => setBusType(t)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1.5px solid ${busType === t ? "#1D9E75" : "#ddd"}`, background: busType === t ? "#E1F5EE" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: busType === t ? "#085041" : "#666", fontWeight: busType === t ? 500 : 400 }}>{t === "VIP" ? "⭐ VIP" : "🚌 عادي"}</div>)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addBus} style={{ flex: 1, background: "#1D9E75", color: "white", border: "none", padding: "9px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>✓ إضافة</button>
              <button onClick={() => setShowAdd(false)} style={{ background: "transparent", border: "0.5px solid #ddd", padding: "9px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
      {showAddP && (
        <div onClick={() => setShowAddP(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "white", borderRadius: 12, width: "90%", maxWidth: 400, maxHeight: "80%", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
            <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #e5e5e5", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "white" }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>إضافة مسافرين — {currentBus?.name}</div>
              <button onClick={() => setShowAddP(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            <div style={{ padding: 14 }}>
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
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar || p.name_ar}</div>
                      <div style={{ fontSize: 10, color: "#888" }}>{isInBus ? "✓ في هذا الباص" : isAssigned ? "موزّع" : "غير موزّع"}</div>
                    </div>
                    {p.services?.bus === "VIP" && <span style={{ fontSize: 9, background: "#FAEEDA", color: "#633806", padding: "1px 5px", borderRadius: 99 }}>⭐ VIP</span>}
                    {isSel && <span style={{ color: "#1D9E75" }}>✓</span>}
                  </div>
                );
              })}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={confirmAddP} style={{ flex: 1, background: "#1D9E75", color: "white", border: "none", padding: "9px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>✓ إضافة ({selectedP.size})</button>
                <button onClick={() => setShowAddP(false)} style={{ background: "transparent", border: "0.5px solid #ddd", padding: "9px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== REPORTS PAGE =====
function ReportsPage({ passengers }: { passengers: Passenger[] }) {
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const reports = [
    { id: "flight", name: "تقرير الطيران", icon: "✈️", desc: "كشف الحجاج (التذاكر)", color: "#E6F1FB" },
    { id: "buses", name: "تقرير الباصات", icon: "🚌", desc: "توزيع المسافرين", color: "#EEEDFE" },
    { id: "mina", name: "تقرير منى", icon: "⛺", desc: "مخيمات منى", color: "#E1F5EE" },
    { id: "arafa", name: "تقرير عرفة", icon: "🏔", desc: "مخيمات عرفة", color: "#FAEEDA" },
    { id: "hotel", name: "تقرير الفندق", icon: "🏨", desc: "توزيع الغرف", color: "#FBEAF0" },
  ];
  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      {!activeReport ? (
        <>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>اختر التقرير</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {reports.map(r => (
              <div key={r.id} onClick={() => setActiveReport(r.id)} style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                onMouseEnter={e => e.currentTarget.style.background = "#f9f9f9"}
                onMouseLeave={e => e.currentTarget.style.background = "white"}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: r.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{r.icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{r.desc}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "#E1F5EE", color: "#085041" }}>Excel</span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "#FAEEDA", color: "#633806" }}>PDF</span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "#f0f0f0", color: "#555" }}>🖨️ طباعة</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div>
          <button onClick={() => setActiveReport(null)} style={{ background: "transparent", border: "0.5px solid #ddd", padding: "5px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", marginBottom: 14, color: "#333" }}>← رجوع</button>
          {activeReport === "flight" && (
            <div>
              <div style={{ textAlign: "center", fontSize: 16, fontWeight: 600, marginBottom: 14 }}>كشف الحجاج ( التذاكر )</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, direction: "ltr" }}>
                <thead>
                  <tr style={{ background: "#1D9E75", color: "white" }}>
                    {["S.N.", "NAME", "NAT.", "P.NO.", "TEL. NO.", "GENDER", "NOTE"].map(h => <th key={h} style={{ padding: "7px 8px", border: "1px solid #ccc", textAlign: "center" }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {passengers.map((p, i) => (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#f9f9f9" }}>
                      <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", textAlign: "center" }}>{i + 1}</td>
                      <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", fontWeight: 500 }}>{p.name_en}</td>
                      <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", textAlign: "center" }}>{p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat}</td>
                      <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", textAlign: "center" }}>{p.passport}</td>
                      <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", textAlign: "center" }}>{p.phone || "—"}</td>
                      <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", textAlign: "center" }}>{p.gender === "ذكر" ? "MR." : "MRS."}</td>
                      <td style={{ padding: "6px 8px", border: "1px solid #e0e0e0", textAlign: "center" }}>{p.services?.flight === "درجة أولى" ? "⭐ First Class" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button style={{ flex: 1, background: "#1D9E75", color: "white", border: "none", padding: "9px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>⬇️ Excel</button>
                <button style={{ flex: 1, background: "transparent", border: "0.5px solid #ddd", padding: "9px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>📄 PDF</button>
                <button onClick={() => window.print()} style={{ flex: 1, background: "transparent", border: "0.5px solid #ddd", padding: "9px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>🖨️ طباعة</button>
              </div>
            </div>
          )}
          {activeReport !== "flight" && (
            <div style={{ textAlign: "center", padding: "2rem", color: "#aaa" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{reports.find(r => r.id === activeReport)?.icon}</div>
              <div style={{ fontSize: 13 }}>التقرير ده بيتجمع من بيانات التوزيع</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== SIMPLE PAGE =====
function SimplePage({ title, icon }: { title: string; icon: string }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", color: "#aaa" }}><div style={{ fontSize: 40, marginBottom: 10 }}>{icon}</div><div style={{ fontSize: 14 }}>صفحة {title}</div><div style={{ fontSize: 12, marginTop: 4 }}>قريباً...</div></div>;
}

// ===== MAIN APP =====
export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [page, setPage] = useState("dash");
  const [passengers, setPassengers] = useState<Passenger[]>([]);

  if (!currentUser) return <LoginPage onLogin={setCurrentUser} />;

  const pageTitles: Record<string, string> = { dash: "لوحة التحكم", scan: "رفع وثيقة", passengers: "المسافرون", buses: "الباصات", mina: "مخيمات منى", arafa: "مخيمات عرفة", hotel: "الفندق", reports: "التقارير", users: "المستخدمين" };

  const renderPage = () => {
    switch (page) {
      case "dash": return <Dashboard passengers={passengers} setPage={setPage} />;
      case "scan": return <ScanPage passengers={passengers} setPassengers={setPassengers} />;
      case "passengers": return <PassengersPage passengers={passengers} setPassengers={setPassengers} />;
      case "buses": return <BusesPage passengers={passengers} />;
      case "reports": return <ReportsPage passengers={passengers} />;
      case "users": return <UsersPage currentUser={currentUser} />;
      case "mina": return <SimplePage title="مخيمات منى" icon="⛺" />;
      case "arafa": return <SimplePage title="مخيمات عرفة" icon="🏔" />;
      case "hotel": return <SimplePage title="الفندق" icon="🏨" />;
      default: return <Dashboard passengers={passengers} setPage={setPage} />;
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", direction: "rtl", fontFamily: "system-ui, -apple-system, sans-serif", background: "white", overflow: "hidden" }}>
      <Sidebar page={page} setPage={setPage} count={passengers.length} currentUser={currentUser} onLogout={() => setCurrentUser(null)} />
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
