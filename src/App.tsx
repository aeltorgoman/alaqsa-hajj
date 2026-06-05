import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";
import { useConfig } from "./config/ConfigContext";

function makeShort(fullName: string): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 3) return parts.join(" ");
  return [parts[0], parts[1], parts[parts.length - 1]].join(" ");
}

function isExpiringSoon(dateStr: string): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  const now = new Date();
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  return d >= now && d < sixMonths;
}

function isExpired(dateStr: string): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  return d < new Date();
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  let d: Date | null = null;
  const parts = dateStr.split(/[\/\-.]/).map(s => s.trim());
  if (parts.length === 3) {
    if (parts[0].length === 4) d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    else d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
  }
  if (!d || isNaN(d.getTime())) return null;
  return d;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve((e.target?.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function scanDocument(file: File, mode: "passport" | "idcard"): Promise<any> {
  const base64 = await fileToBase64(file);
  const response = await fetch("https://zkucwcnclbfvukhdqhgc.supabase.co/functions/v1/Scan-passport", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64, mediaType: file.type, mode })
  });
  const data = await response.json();
  const text = data.content ? data.content.map((i: any) => i.text || "").join("") : JSON.stringify(data);
  let parsed: any = {};
  try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); } catch {}
  return parsed;
}

async function downloadFile(url: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = url.split("/").pop() || "file";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch { window.open(url, "_blank"); }
}

function getStoragePath(url: string): string {
  const prefix = "/storage/v1/object/public/passengers-docs/";
  const idx = url.indexOf(prefix);
  if (idx === -1) return "";
  return decodeURIComponent(url.slice(idx + prefix.length));
}

function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) { resolve(file); return; }
    const img = new Image();
    img.onload = () => {
      const maxDim = 1400;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = height * maxDim / width; width = maxDim; }
        else { width = width * maxDim / height; height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob(b => resolve(b || file), "image/jpeg", 0.8);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

async function uploadDoc(file: File, passengerId: number, docType: string): Promise<string | null> {
  const compressed = await compressImage(file);
  const ext = file.type === "application/pdf" ? "pdf" : "jpg";
  const path = `${passengerId}/${docType}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("passengers-docs").upload(path, compressed, { upsert: true, contentType: file.type === "application/pdf" ? "application/pdf" : "image/jpeg" });
  if (error) { console.error("upload error", error); return null; }
  const { data } = supabase.storage.from("passengers-docs").getPublicUrl(path);
  return data?.publicUrl || null;
}

interface Passenger {
  id: number; name_ar: string; name_en: string; short_ar: string; short_en: string;
  passport: string; national_id: string; nat: string; dob: string; expiry: string;
  gender: string; phone: string;
  services: { bus: string; flight: string; hotel_type: string; hotel_view: string; camp_mina: string; camp_arafa: string; };
  rel: string; linked: number;
  bus_id?: number | null; camp_mina_id?: number | null; camp_arafa_id?: number | null; room_id?: number | null;
  family_id?: string | null;
  flight_id?: number | null; flight_class?: string | null;
}
interface User { id: number; name: string; username: string; password: string; permissions: Record<string, boolean>; }
interface Bus { id: number; name: string; type: string; }
interface Camp { id: number; name: string; gender: "ذكر" | "أنثى"; type: "عادي" | "خاص"; page_type: string; }
interface Room { id: number; number: string; floor: string; type: "ثنائية" | "ثلاثية" | "رباعية" | "سويت"; }
interface Flight { id: number; name: string; type: "ذهاب" | "إياب"; airline: string; date: string; time: string; from_airport: string; to_airport: string; }

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
  { key: "manage_flights", label: "إدارة الطيران" },
];

const ROOM_TYPES = ["ثنائية", "ثلاثية", "رباعية", "سويت"] as const;
const ROOM_COLORS: Record<string, [string, string]> = { "ثنائية": ["#E6F1FB", "#0C447C"], "ثلاثية": ["#FAEEDA", "#633806"], "رباعية": ["#E1F5EE", "#085041"], "سويت": ["#EEEDFE", "#3C3489"] };

const NAV = [
  { section: "الرئيسية", items: [{ id: "dash", label: "🏠 الرئيسية", perm: "" }] },
  { section: "التنظيم", items: [{ id: "passengers", label: "🕌 الحجاج", perm: "view_passengers" }, { id: "buses", label: "🚌 الباصات", perm: "manage_buses" }, { id: "flights", label: "✈️ الطيران", perm: "manage_flights" }, { id: "mina", label: "⛺ مخيمات منى", perm: "manage_camps" }, { id: "arafa", label: "🏔 مخيمات عرفة", perm: "manage_camps" }, { id: "hotel", label: "🏨 الفندق", perm: "manage_hotel" }] },
  { section: "التقارير", items: [{ id: "reports", label: "📄 التقارير", perm: "view_reports" }] },
  { section: "الأرشيف", items: [{ id: "archive", label: "🗄 الأرشيف", perm: "view_archive" }] },
  { section: "الإعدادات", items: [{ id: "users", label: "👥 المستخدمين", perm: "manage_users" }] },
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
  const config = useConfig();
  return (
    <div style={{ width: 200, background: config.color_sidebar, borderLeft: "0.5px solid #e5e5e5", padding: "12px 0", display: "flex", flexDirection: "column", flexShrink: 0, height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "0 12px 12px", borderBottom: "0.5px solid #e5e5e5", marginBottom: 6, flexShrink: 0 }}>
        {config.logo_url
          ? <img src={config.logo_url} alt={config.name_ar} style={{ height: 36, marginBottom: 4 }} />
          : <div style={{ fontSize: 15, fontWeight: 600 }}>✈️ {config.name_ar}</div>
        }
        <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{config.tagline}</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {NAV.map(({ section, items }) => {
          const allowed = items.filter(it => !it.perm || currentUser.permissions?.[it.perm]);
          if (allowed.length === 0) return null;
          return (
            <div key={section}>
              <div style={{ fontSize: 10, color: "#aaa", padding: "10px 12px 3px", letterSpacing: "0.04em" }}>{section}</div>
              {allowed.map(({ id, label }) => (
                <div key={id} onClick={() => setPage(id)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", fontSize: 12, color: page === id ? config.color_primary : "#666", cursor: "pointer", borderRight: page === id ? `2px solid ${config.color_primary}` : "2px solid transparent", fontWeight: page === id ? 500 : 400, background: page === id ? "white" : "transparent" }}>
                  {label}
                  {id === "passengers" && count > 0 && <span style={{ background: "#E1F5EE", color: config.color_accent, borderRadius: 99, padding: "0 6px", fontSize: 10, marginRight: "auto" }}>{count}</span>}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div style={{ padding: "10px 12px", borderTop: "0.5px solid #e5e5e5", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 500 }}>{currentUser.name}</div>
        <div style={{ fontSize: 10, color: "#888" }}>@{currentUser.username}</div>
        <button onClick={onLogout} style={{ marginTop: 8, width: "100%", background: "#FBEAF0", border: "none", padding: 5, borderRadius: 6, fontSize: 11, cursor: "pointer", color: "#c0392b" }}>تسجيل خروج</button>
      </div>
    </div>
  );
}

function LoginPage({ onLogin }: { onLogin: (u: User) => void }) {
  const config = useConfig();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) return;
    setLoading(true); setError("");
    const { data } = await supabase.from("users").select("*").eq("username", username).eq("password", password).single();
    if (data) { onLogin(data as User); }
    else setError("اسم المستخدم أو كلمة المرور غلط");
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#E1F5EE,#f0f9ff)", direction: "rtl", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ background: "white", borderRadius: 16, padding: "40px 32px", width: 360, boxShadow: "0 8px 32px rgba(0,0,0,0.1)" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          {config.logo_url
            ? <img src={config.logo_url} alt={config.name_ar} style={{ height: 56, marginBottom: 8 }} />
            : <div style={{ fontSize: 48, marginBottom: 8 }}>✈️</div>
          }
          <div style={{ fontSize: 20, fontWeight: 700 }}>{config.name_ar}</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{config.tagline}</div>
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
        <button onClick={handleLogin} disabled={loading} style={{ width: "100%", background: config.color_primary, color: "white", border: "none", padding: 12, borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 600, marginTop: 6, opacity: loading ? 0.7 : 1 }}>{loading ? "⏳ جاري التحقق..." : "دخول"}</button>
      </div>
    </div>
  );
}
function UsersPage({ currentUser }: { currentUser: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [perms, setPerms] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase.from("users").select("*").order("id").then(({ data }: any) => { if (data) setUsers(data); });
  }, []);

  const openAdd = () => { setForm({ name: "", username: "", password: "" }); setPerms(Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, false]))); setEditUser(null); setShowAdd(true); };
  const openEdit = (u: User) => { setForm({ name: u.name, username: u.username, password: u.password }); setPerms({ ...u.permissions }); setEditUser(u); setShowAdd(true); };
  const togglePerm = (key: string) => setPerms(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleAll = () => { const allOn = ALL_PERMISSIONS.every(p => perms[p.key]); setPerms(Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, !allOn]))); };

  const saveUser = async () => {
    if (!form.name || !form.username || !form.password) return;
    if (editUser) {
      await supabase.from("users").update({ ...form, permissions: perms }).eq("id", editUser.id);
      setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, ...form, permissions: perms } : u));
    } else {
      const { data } = await supabase.from("users").insert([{ ...form, permissions: perms }]).select();
      if (data?.[0]) setUsers(prev => [...prev, data[0] as User]);
    }
    setShowAdd(false);
  };

  const deleteUser = async (id: number) => {
    if (!confirm("هتمسح المستخدم ده؟")) return;
    await supabase.from("users").delete().eq("id", id);
    setUsers(prev => prev.filter(x => x.id !== id));
  };

  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
      {currentUser.permissions.manage_users && <button onClick={openAdd} style={{ ...btnP(), width: "100%", marginBottom: 14 }}>+ مستخدم جديد</button>}
      {users.map(u => (
        <div key={u.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: u.username === "admin" ? "#E1F5EE" : "#EEEDFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{u.username === "admin" ? "👑" : "👤"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
            <div style={{ fontSize: 11, color: "#888" }}>@{u.username} · {Object.values(u.permissions).filter(Boolean).length} صلاحية</div>
          </div>
          {currentUser.permissions.manage_users && u.username !== "admin" && (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => openEdit(u)} style={{ background: "#E6F1FB", border: "none", padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "#0C447C" }}>✏️</button>
              <button onClick={() => deleteUser(u.id)} style={{ background: "#FBEAF0", border: "none", padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "#c0392b" }}>🗑</button>
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
  const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleScanFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      sessionStorage.setItem("hajj_scan_file", "pending");
      setPage("scan");
    }
    e.currentTarget.value = "";
  };

  return (
    <div style={{ padding: 12, overflowY: "auto", height: "100%" }}>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleScanFile} />
      {/* زرارين الإضافة */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div onClick={() => fileRef.current?.click()} style={{ background: "#1D9E75", borderRadius: 10, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📷</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "white" }}>مسح جواز</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", marginTop: 1 }}>إضافة بالمسح</div>
          </div>
        </div>
        <div onClick={() => setPage("manual")} style={{ background: "white", border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>✏️</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>إضافة يدوي</div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>إدخال يدوي</div>
          </div>
        </div>
      </div>
      {/* الإحصائيات */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
        <div style={{ background: "#f5f5f5", borderRadius: 8, padding: "10px 10px" }}>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>إجمالي الحجاج</div>
          <div style={{ fontSize: 22, fontWeight: 500 }}>{passengers.length}</div>
        </div>
        <div style={{ background: "#E6F1FB", borderRadius: 8, padding: "10px 10px" }}>
          <div style={{ fontSize: 11, color: "#0C447C", marginBottom: 2 }}>رجال</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: "#0C447C" }}>{males}</div>
        </div>
        <div style={{ background: "#FBEAF0", borderRadius: 8, padding: "10px 10px" }}>
          <div style={{ fontSize: 11, color: "#72243E", marginBottom: 2 }}>نساء</div>
          <div style={{ fontSize: 22, fontWeight: 500, color: "#72243E" }}>{females}</div>
        </div>
      </div>
      {/* آخر المضافين */}
      {passengers.length > 0 && (
        <div style={{ background: "white", border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
            <span>🕐</span> آخر المضافين
          </div>
          {passengers.slice(-5).reverse().map((p, i, arr) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < arr.length - 1 ? "0.5px solid #f5f5f5" : "none" }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: p.gender === "ذكر" ? "#E6F1FB" : "#FBEAF0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, color: p.gender === "ذكر" ? "#0C447C" : "#72243E", flexShrink: 0 }}>{initials(p.name_ar)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12 }}>{p.short_ar || p.name_ar}</div>
                <div style={{ fontSize: 10, color: "#888" }}>{p.nat} · {p.passport}</div>
              </div>
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
  const [locked, setLocked] = useState(false);
  const [uploading, setUploading] = useState(false);
  // جواز السفر
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  // البطاقة الشخصية
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [idCardPreview, setIdCardPreview] = useState<string | null>(null);
  const [idScanLoading, setIdScanLoading] = useState(false);
  const [idExpiry, setIdExpiry] = useState("");
  // البيانات
  const [form, setForm] = useState({ name_en: "", name_ar: "", short_en: "", short_ar: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", gender: "", phone: "" });
  const [services, setServices] = useState({ bus: "عادي", flight: "عادي", hotel_type: "ثنائية", hotel_view: "غير مطلة", camp_mina: "عادي", camp_arafa: "عادي" });
  // مستندات إضافية (بدون الجواز والبطاقة — هم بيتعاملوا فوق)
  const [docs, setDocs] = useState<{ photo: File | null; contract: File | null }>({ photo: null, contract: null });

  const setField = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));
  const setService = (key: string, val: string) => setServices(prev => ({ ...prev, [key]: val }));

  // رفع وقراءة جواز السفر
  const handleFile = (file: File) => {
    setPassportFile(file);
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
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type, mode: "passport" })
        });
        const data = await response.json();
        clearInterval(iv); setProgress(100); setStatusMsg("تم الاستخراج بنجاح!");
        setTimeout(() => {
          setLoading(false);
          const text = data.content ? data.content.map((i: any) => i.text || "").join("") : JSON.stringify(data);
          let parsed: any = {};
          try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); } catch {}
          setForm(prev => ({
            ...prev,
            name_en: parsed.name_en || prev.name_en,
            name_ar: parsed.name_ar || prev.name_ar,
            short_en: parsed.short_en || prev.short_en,
            short_ar: parsed.short_ar || prev.short_ar,
            passport: parsed.passport || prev.passport,
            nat: parsed.nationality || prev.nat,
            dob: parsed.dob || prev.dob,
            expiry: parsed.expiry || prev.expiry,
            gender: parsed.gender || prev.gender
          }));
          setShowFields(true);
        }, 500);
      } catch { clearInterval(iv); setLoading(false); setShowFields(true); }
    };
    reader.readAsDataURL(file);
  };

  // رفع وقراءة البطاقة الشخصية بالـ AI
  const handleIdCard = async (file: File) => {
    setIdCardFile(file);
    setIdCardPreview(URL.createObjectURL(file));
    setIdScanLoading(true);
    try {
      const parsed = await scanDocument(file, "idcard");
      if (parsed.national_id) setForm(prev => ({ ...prev, national_id: parsed.national_id }));
      if (parsed.id_expiry) setIdExpiry(parsed.id_expiry);
    } catch {}
    setIdScanLoading(false);
  };

  const handleSave = async () => {
    const dupPassport = form.passport && passengers.some(p => p.passport && p.passport === form.passport);
    const dupNational = form.national_id && passengers.some(p => p.national_id && p.national_id === form.national_id);
    if (dupPassport) { alert("⚠️ رقم الجواز ده مسجل بالفعل!"); return; }
    if (dupNational) { alert("⚠️ رقم البطاقة ده مسجل بالفعل!"); return; }
    setUploading(true);
    const short_en = makeShort(form.name_en);
    const short_ar = makeShort(form.name_ar);
    const { data, error } = await supabase.from("passengers").insert([{
      name_ar: form.name_ar, name_en: form.name_en,
      short_ar, short_en,
      passport: form.passport, national_id: form.national_id,
      nat: form.nat, dob: form.dob, expiry: form.expiry,
      gender: form.gender, phone: form.phone,
      id_expiry: idExpiry,
      bus: services.bus, flight: services.flight,
      hotel_type: services.hotel_type, hotel_view: services.hotel_view, camp_mina: services.camp_mina,
      camp_arafa: services.camp_arafa
    }]).select();
    if (!error && data && data[0]) {
      const pid = data[0].id;
      const urls: any = {};
      if (passportFile) urls.passport_url = await uploadDoc(passportFile, pid, "passport_doc");
      if (idCardFile) urls.national_id_url = await uploadDoc(idCardFile, pid, "idcard");
      if (docs.photo) urls.photo_url = await uploadDoc(docs.photo, pid, "photo");
      if (docs.contract) urls.contract_url = await uploadDoc(docs.contract, pid, "contract");
      if (Object.keys(urls).length > 0) await supabase.from("passengers").update(urls).eq("id", pid);
      setPassengers([...passengers, { id: pid, ...form, short_ar, short_en, services, rel: "", linked: -1, id_expiry: idExpiry, ...urls } as any]);
      setSaved(true); setLocked(true);
    } else alert("حصل خطأ في الحفظ!");
    setUploading(false);
  };

  const reset = () => {
    setForm({ name_en: "", name_ar: "", short_en: "", short_ar: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", gender: "", phone: "" });
    setServices({ bus: "عادي", flight: "عادي", hotel_type: "ثنائية", hotel_view: "غير مطلة", camp_mina: "عادي", camp_arafa: "عادي" });
    setPreviewImg(null); setPassportFile(null); setShowFields(false); setSaved(false); setLocked(false);
    setIdCardFile(null); setIdCardPreview(null); setIdExpiry(""); setDocs({ photo: null, contract: null });
  };

  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
      {saved && <div style={{ background: "#E1F5EE", border: "0.5px solid #5DCAA5", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 12, color: "#085041" }}>✓ تم حفظ الحاج! <button onClick={reset} style={{ marginRight: "auto", ...btnP({ fontSize: 11, padding: "3px 10px" }) }}>➕ حاج جديد</button></div>}

      {/* رفع جواز السفر */}
      <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>🛂 جواز السفر</div>
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
        {/* البيانات المستخرجة */}
        <div style={{ border: "0.5px solid #5DCAA5", borderRadius: 12, padding: "12px 14px", marginBottom: 12, background: "#FAFFFD" }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>👤 البيانات <span style={{ fontSize: 10, background: "#E1F5EE", color: "#085041", padding: "1px 7px", borderRadius: 99 }}>✨ مستخرجة</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {([["الاسم بالإنجليزي", "name_en", "1/-1"], ["الاسم بالعربي", "name_ar", "1/-1"], ["المختصر إنجليزي", "short_en", ""], ["المختصر عربي", "short_ar", ""], ["رقم الجواز", "passport", ""], ["الجنسية", "nat", ""], ["التليفون", "phone", ""], ["تاريخ الميلاد", "dob", ""], ["انتهاء الجواز", "expiry", ""]] as [string,string,string][]).map(([l, k, col]) => (
              <div key={k} style={{ gridColumn: col || "auto" }}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>{l}</div>
                <input disabled={locked} style={{ ...inp, borderColor: "#5DCAA5", background: locked ? "#f5f5f5" : "#E1F5EE", color: locked ? "#666" : "#000" }} value={(form as any)[k]} onChange={e => setField(k, e.target.value)} />
              </div>
            ))}
            <div><div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>الجنس</div>
              <select disabled={locked} style={{ ...inp, borderColor: "#5DCAA5", background: locked ? "#f5f5f5" : "#E1F5EE" }} value={form.gender} onChange={e => setField("gender", e.target.value)}>
                <option value="">—</option><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option>
              </select>
            </div>
          </div>
        </div>

        {/* البطاقة الشخصية */}
        <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>🪪 البطاقة الشخصية <span style={{ fontSize: 10, color: "#888" }}>(اختياري)</span></div>
          {!idCardPreview ? (
            <div onClick={() => !locked && document.getElementById("id-card-upload")?.click()} style={{ border: "1.5px dashed #ddd", borderRadius: 8, padding: "14px", textAlign: "center", cursor: locked ? "not-allowed" : "pointer", background: "#f9f9f9", opacity: locked ? 0.6 : 1 }}>
              <div style={{ fontSize: 11, color: "#666" }}>ارفع البطاقة لاستخراج الرقم والصلاحية تلقائياً</div>
              <input id="id-card-upload" type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleIdCard(e.target.files[0])} />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
              <img src={idCardPreview} style={{ width: 100, height: 65, objectFit: "cover", borderRadius: 6, border: "0.5px solid #e5e5e5" }} />
              <div style={{ flex: 1 }}>
                {idScanLoading ? <div style={{ fontSize: 11, color: "#888" }}>⏳ جاري قراءة البطاقة...</div> : <div style={{ fontSize: 11, color: "#1D9E75", fontWeight: 500 }}>✓ تم استخراج البيانات</div>}
                <button onClick={() => { setIdCardFile(null); setIdCardPreview(null); setIdExpiry(""); setForm(prev => ({ ...prev, national_id: "" })); }} style={{ marginTop: 6, ...btnS({ fontSize: 10, padding: "2px 8px" }) }}>تغيير</button>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div><div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>رقم البطاقة</div>
              <input disabled={locked} style={{ ...inp }} value={form.national_id} onChange={e => setField("national_id", e.target.value)} placeholder="يتعبى تلقائياً من البطاقة" />
            </div>
            <div><div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>انتهاء البطاقة</div>
              <input disabled={locked} style={{ ...inp }} value={idExpiry} onChange={e => setIdExpiry(e.target.value)} placeholder="DD/MM/YYYY" />
            </div>
          </div>
        </div>

        {/* الخدمات */}
        <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>⭐ الخدمات المطلوبة</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {([["🚌 الباص", "bus", ["عادي", "VIP"]], ["✈️ الطيران", "flight", ["عادي", "درجة أولى", "بدون"]], ["🏨 نوع الغرفة", "hotel_type", ["ثنائية", "ثلاثية", "رباعية", "سويت"]], ["🪟 إطلالة الغرفة", "hotel_view", ["مطلة", "غير مطلة"]], ["⛺ مخيم منى", "camp_mina", ["عادي", "خاص"]], ["🏔 مخيم عرفة", "camp_arafa", ["عادي", "خاص"]]] as [string,string,string[]][]).map(([l, k, opts]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{l}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {opts.map(o => <div key={o} onClick={() => setService(k, o)} style={{ flex: 1, padding: "5px 4px", borderRadius: 8, border: `1.5px solid ${(services as any)[k] === o ? "#1D9E75" : "#ddd"}`, background: (services as any)[k] === o ? "#E1F5EE" : "transparent", cursor: "pointer", fontSize: 10, color: (services as any)[k] === o ? "#085041" : "#666", textAlign: "center", fontWeight: (services as any)[k] === o ? 500 : 400 }}>{o}</div>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* مستندات إضافية */}
        <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>📎 مستندات إضافية <span style={{ fontSize: 10, color: "#888" }}>(اختياري)</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {([["📷 صورة شخصية", "photo", "image/*"], ["📄 عقد الانتفاق", "contract", "image/*,application/pdf"]] as [string, "photo"|"contract", string][]).map(([label, key, accept]) => (
              <div key={key}>
                <input id={`doc-${key}`} type="file" accept={accept} disabled={locked} style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) setDocs(prev => ({ ...prev, [key]: f })); }} />
                <div onClick={() => !locked && document.getElementById(`doc-${key}`)?.click()} style={{ border: `1.5px dashed ${docs[key] ? "#1D9E75" : "#ddd"}`, borderRadius: 8, padding: "12px 6px", textAlign: "center", cursor: locked ? "not-allowed" : "pointer", background: docs[key] ? "#E1F5EE" : "#f9f9f9", opacity: locked ? 0.6 : 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: docs[key] ? "#085041" : "#666" }}>{label}</div>
                  <div style={{ fontSize: 9, color: "#999", marginTop: 3 }}>{docs[key] ? "✓ تم الاختيار" : "اضغط للرفع"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* الأزرار */}
        <div style={{ display: "flex", gap: 8 }}>
          {locked ? (<>
            <button onClick={() => setLocked(false)} style={{ ...btnP({ background: "#E6F1FB", color: "#0C447C" }), flex: 1 }}>✏️ تعديل</button>
            <button onClick={reset} style={{ ...btnP(), flex: 1 }}>➕ حاج جديد</button>
          </>) : (<>
            <button onClick={handleSave} disabled={uploading} style={{ ...btnP(), flex: 1, opacity: uploading ? 0.6 : 1 }}>{uploading ? "⏳ جاري الحفظ..." : "💾 حفظ الحاج"}</button>
            <button onClick={reset} style={btnS()}>مسح</button>
          </>)}
        </div>
      </>)}
    </div>
  );
}


// ===== دائرة النسبة =====
function StatRing({ pct, count, total, color, label }: { pct: number; count: number; total: number; color: string; label: string }) {
  const r = 24, circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div style={{ position: "relative", width: 62, height: 62 }}>
        <svg width="62" height="62" viewBox="0 0 62 62">
          <circle cx="31" cy="31" r={r} fill="none" stroke="#eeeeee" strokeWidth="6" />
          <circle cx="31" cy="31" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            transform="rotate(-90 31 31)"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color }}>{pct}%</div>
      </div>
      <div style={{ fontSize: 10, color: "#555", textAlign: "center", lineHeight: 1.4 }}>
        {label}<br />
        <span style={{ color: "#aaa", fontSize: 9 }}>{count} / {total}</span>
      </div>
    </div>
  );
}

// ===== ملخص إحصائي في أعلى صفحة الحجاج =====
function PassengersStats({ passengers }: { passengers: any[] }) {
  const total = passengers.length;
  const males = passengers.filter(p => p.gender === "ذكر").length;
  const females = passengers.filter(p => p.gender === "أنثى").length;

  // اكتمال المستندات = الصورة + الجواز + البطاقة
  const docsComplete = (p: any) => !!(p.photo_url && p.passport_url && p.national_id_url);

  // اكتمال البيانات = كل الحقول الأساسية متعباية
  const DATA_FIELDS = ["name_ar", "name_en", "passport", "national_id", "nat", "dob", "expiry", "gender", "phone"];
  const dataComplete = (p: any) => DATA_FIELDS.every(f => p[f] && String(p[f]).trim());

  const docsDone = passengers.filter(docsComplete).length;
  const dataDone = passengers.filter(dataComplete).length;
  const docPct = total ? Math.round(docsDone / total * 100) : 0;
  const dataPct = total ? Math.round(dataDone / total * 100) : 0;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "0.5px solid #e5e5e5", flexShrink: 0, background: "#fafafa" }}>
      {/* بطاقات العدد */}
      <div style={{ background: "#f0f0f0", borderRadius: 10, padding: "7px 14px", minWidth: 72, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#888", marginBottom: 1 }}>إجمالي الحجاج</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#333", lineHeight: 1 }}>{total}</div>
      </div>
      <div style={{ background: "#E6F1FB", borderRadius: 10, padding: "7px 14px", minWidth: 64, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#0C447C", marginBottom: 1 }}>رجال</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#0C447C", lineHeight: 1 }}>{males}</div>
      </div>
      <div style={{ background: "#FBEAF0", borderRadius: 10, padding: "7px 14px", minWidth: 64, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#72243E", marginBottom: 1 }}>نساء</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#72243E", lineHeight: 1 }}>{females}</div>
      </div>

      {/* خط فاصل */}
      <div style={{ width: 1, height: 44, background: "#e5e5e5", marginInline: 4 }} />

      {/* دوائر النسبة */}
      <div style={{ display: "flex", gap: 16, marginInlineStart: "auto" }}>
        <StatRing pct={docPct} count={docsDone} total={total} color="#1D9E75" label="اكتمال المستندات" />
        <StatRing pct={dataPct} count={dataDone} total={total} color="#185FA5" label="اكتمال البيانات" />
      </div>
    </div>
  );
}

function PassengersPage({ passengers, setPassengers, initialShowManual }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void; initialShowManual?: boolean }) {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "table">("list");
  const [selected, setSelected] = useState<Passenger | null>(null);
  const [editing, setEditing] = useState<Passenger | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  const COLS = [
    { key: "name_ar", label: "الاسم بالعربي" },
    { key: "name_en", label: "الاسم بالإنجليزي" },
    { key: "passport", label: "رقم الجواز" },
    { key: "national_id", label: "رقم البطاقة" },
    { key: "nat", label: "الجنسية" },
    { key: "gender", label: "الجنس" },
    { key: "dob", label: "تاريخ الميلاد" },
    { key: "expiry", label: "انتهاء الجواز" },
    { key: "phone", label: "التليفون" },
    { key: "bus", label: "الباص", get: (p: Passenger) => p.services?.bus },
    { key: "flight", label: "الطيران", get: (p: Passenger) => p.services?.flight },
    { key: "hotel_type", label: "نوع الغرفة", get: (p: Passenger) => p.services?.hotel_type },
    { key: "hotel_view", label: "إطلالة الغرفة", get: (p: Passenger) => p.services?.hotel_view },
    { key: "camp_mina", label: "منى", get: (p: Passenger) => p.services?.camp_mina },
    { key: "camp_arafa", label: "عرفة", get: (p: Passenger) => p.services?.camp_arafa },
  ] as { key: string; label: string; get?: (p: Passenger) => string }[];

  const getVal = (p: Passenger, key: string, getter?: (p: Passenger) => string) => {
    if (getter) return getter(p) || "";
    return (p as any)[key] || "";
  };

  const filtered = passengers.filter(p => {
    const fullName = `${p.name_ar} ${p.name_en}`;
    const searchMatch = !search || fullName.toLowerCase().includes(search.toLowerCase()) ||
      [p.passport, p.national_id, p.nat, p.phone, p.gender, p.services?.bus].join(" ").toLowerCase().includes(search.toLowerCase());
    if (!searchMatch) return false;
    return COLS.every(col => {
      const filter = colFilters[col.key];
      if (!filter) return true;
      return getVal(p, col.key, col.get).toLowerCase().includes(filter.toLowerCase());
    });
  });

  const [docUploading, setDocUploading] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(initialShowManual || false);
  const [manualForm, setManualForm] = useState({ name_ar: "", name_en: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", id_expiry: "", gender: "ذكر", phone: "" });
  const [manualServices, setManualServices] = useState({ bus: "عادي", flight: "عادي", hotel_type: "ثنائية", hotel_view: "غير مطلة", camp_mina: "عادي", camp_arafa: "عادي" });
  const [manualSaving, setManualSaving] = useState(false);

  const handleManualSave = async () => {
    if (!manualForm.name_ar && !manualForm.name_en) { alert("اكتب الاسم على الأقل!"); return; }
    const dupP = manualForm.passport && passengers.some((p: any) => p.passport === manualForm.passport);
    const dupN = manualForm.national_id && passengers.some((p: any) => p.national_id === manualForm.national_id);
    if (dupP) { alert("⚠️ رقم الجواز ده مسجل بالفعل!"); return; }
    if (dupN) { alert("⚠️ رقم البطاقة ده مسجل بالفعل!"); return; }
    setManualSaving(true);
    const short_ar = makeShort(manualForm.name_ar);
    const short_en = makeShort(manualForm.name_en);
    const { data, error } = await supabase.from("passengers").insert([{ ...manualForm, short_ar, short_en, bus: manualServices.bus, flight: manualServices.flight, hotel_type: manualServices.hotel_type, hotel_view: manualServices.hotel_view, camp_mina: manualServices.camp_mina, camp_arafa: manualServices.camp_arafa }]).select();
    if (!error && data && data[0]) {
      setPassengers([...passengers, { id: data[0].id, ...manualForm, short_ar, short_en, services: manualServices, rel: "", linked: -1 } as any]);
      setShowManual(false);
      setManualForm({ name_ar: "", name_en: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", id_expiry: "", gender: "ذكر", phone: "" });
    } else alert("حصل خطأ في الحفظ!");
    setManualSaving(false);
  };

  const [showVerify, setShowVerify] = useState(false);
  const [verifyData, setVerifyData] = useState<{ passportUrl: string; idUrl: string; passenger: any; updates: any; isQatari: boolean; idMismatch: boolean; } | null>(null);

  const handleDocUpload = async (p: any, docType: string, field: string, file: File) => {
    setDocUploading(docType);
    if (docType === "passport_doc") {
      const [url, parsed] = await Promise.all([uploadDoc(file, p.id, docType), scanDocument(file, "passport")]);
      const updates: any = {};
      if (url) updates.passport_url = url;
      if (parsed.name_en) { updates.name_en = parsed.name_en; updates.short_en = makeShort(parsed.name_en); }
      if (parsed.name_ar) { updates.name_ar = parsed.name_ar; updates.short_ar = makeShort(parsed.name_ar); }
      if (parsed.passport) updates.passport = parsed.passport;
      if (parsed.nationality) updates.nat = parsed.nationality;
      if (parsed.dob) updates.dob = parsed.dob;
      if (parsed.expiry) updates.expiry = parsed.expiry;
      if (parsed.gender) updates.gender = parsed.gender;
      setDocUploading(null);
      // لو في بطاقة موجودة → عرض مودال التحقق
      if (p.national_id_url) {
        setVerifyData({ passportUrl: url || p.passport_url, idUrl: p.national_id_url, passenger: p, updates, isQatari: p.nat === "قطري", idMismatch: false });
        setShowVerify(true);
      } else {
        await saveDocUpdates(p, updates);
      }
    } else if (docType === "idcard") {
      const [url, parsed] = await Promise.all([uploadDoc(file, p.id, docType), scanDocument(file, "idcard")]);
      const updates: any = {};
      if (url) updates.national_id_url = url;
      if (parsed.national_id) updates.national_id = parsed.national_id;
      if (parsed.id_expiry) updates.id_expiry = parsed.id_expiry;
      setDocUploading(null);
      // لو في جواز موجود → عرض مودال التحقق
      if (p.passport_url) {
        const isQatari = p.nat === "قطري";
        const idMismatch = isQatari && parsed.national_id && p.national_id && parsed.national_id !== p.national_id;
        setVerifyData({ passportUrl: p.passport_url, idUrl: url || p.national_id_url, passenger: p, updates, isQatari, idMismatch: !!idMismatch });
        setShowVerify(true);
      } else {
        await saveDocUpdates(p, updates);
      }
    } else {
      const url = await uploadDoc(file, p.id, docType);
      if (url) {
        await supabase.from("passengers").update({ [field]: url }).eq("id", p.id);
        const updated = { ...p, [field]: url };
        setPassengers(passengers.map((x: any) => x.id === p.id ? updated : x));
        setSelected(updated);
      }
      setDocUploading(null);
    }
  };

  const saveDocUpdates = async (p: any, updates: any) => {
    await supabase.from("passengers").update(updates).eq("id", p.id);
    const updated = { ...p, ...updates };
    setPassengers(passengers.map((x: any) => x.id === p.id ? updated : x));
    setSelected(updated);
  };

  const confirmVerify = async () => {
    if (!verifyData) return;
    await saveDocUpdates(verifyData.passenger, verifyData.updates);
    setShowVerify(false); setVerifyData(null);
  };

  const handleDocDelete = async (p: any, field: string, url: string) => {
    if (!confirm("هتمسح المستند ده؟")) return;
    const path = getStoragePath(url);
    if (path) await supabase.storage.from("passengers-docs").remove([path]);
    await supabase.from("passengers").update({ [field]: null }).eq("id", p.id);
    const updated = { ...p, [field]: null };
    setPassengers(passengers.map((x: any) => x.id === p.id ? updated : x));
    setSelected(updated);
  };
  const [showLinkFamily, setShowLinkFamily] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");

  const handleLinkFamily = async (p1: Passenger, p2: Passenger) => {
    const familyId = p1.family_id || p2.family_id || `fam_${Date.now()}`;
    await supabase.from("passengers").update({ family_id: familyId }).eq("id", p1.id);
    await supabase.from("passengers").update({ family_id: familyId }).eq("id", p2.id);
    const updated1 = { ...p1, family_id: familyId };
    const updated2 = { ...p2, family_id: familyId };
    setPassengers(passengers.map(p => p.id === p1.id ? updated1 : p.id === p2.id ? updated2 : p));
    setSelected(updated1);
    setShowLinkFamily(false); setLinkSearch("");
  };

  const handleUnlinkFamily = async (p: Passenger) => {
    if (!confirm("هتفك الارتباط العائلي لهذا الحاج؟")) return;
    await supabase.from("passengers").update({ family_id: null }).eq("id", p.id);
    const updated = { ...p, family_id: null };
    setPassengers(passengers.map(x => x.id === p.id ? updated : x));
    setSelected(updated);
  };

  const getFamilyMembers = (p: Passenger) => p.family_id ? passengers.filter(x => x.family_id === p.family_id && x.id !== p.id) : [];

  const deleteP = async (id: number) => {
    await supabase.from("passengers").delete().eq("id", id);
    setPassengers(passengers.filter(p => p.id !== id));
    setSelected(null);
  };
  const saveEdit = async (p: Passenger) => {
    const { error } = await supabase.from("passengers").update({
      name_ar: p.name_ar, name_en: p.name_en, short_ar: p.short_ar, short_en: p.short_en,
      passport: p.passport, national_id: p.national_id, nat: p.nat,
      dob: p.dob, expiry: p.expiry, gender: p.gender, phone: p.phone,
      bus: p.services?.bus, flight: p.services?.flight, hotel_type: p.services?.hotel_type, hotel_view: p.services?.hotel_view,
      camp_mina: p.services?.camp_mina, camp_arafa: p.services?.camp_arafa
    }).eq("id", p.id);
    if (error) { alert("حصل خطأ في الحفظ!"); return; }
    setPassengers(passengers.map(x => x.id === p.id ? p : x));
    setEditing(null); setSelected(p);
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <PassengersStats passengers={passengers} />
        <div style={{ padding: "10px 14px", borderBottom: "0.5px solid #e5e5e5", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "#f5f5f5", border: "0.5px solid #e0e0e0", borderRadius: 8, padding: "6px 10px" }}>
              <span style={{ color: "#aaa" }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث بالاسم الكامل أو أي معلومة..." />
              {search && <span onClick={() => setSearch("")} style={{ cursor: "pointer", color: "#aaa" }}>✕</span>}
            </div>
            <div style={{ display: "flex", border: "0.5px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
              <div onClick={() => setViewMode("list")} style={{ padding: "6px 12px", cursor: "pointer", fontSize: 12, background: viewMode === "list" ? "#1D9E75" : "white", color: viewMode === "list" ? "white" : "#666" }}>☰ قائمة</div>
              <div onClick={() => setViewMode("table")} style={{ padding: "6px 12px", cursor: "pointer", fontSize: 12, background: viewMode === "table" ? "#1D9E75" : "white", color: viewMode === "table" ? "white" : "#666" }}>⊞ جدول</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11, color: "#888" }}>{filtered.length} من {passengers.length} حاج</div>
            <button onClick={() => setShowManual(true)} style={{ ...btnP({ fontSize: 10, padding: "3px 8px" }) }}>➕ إضافة يدوي</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {viewMode === "list" ? (
            <div style={{ padding: "8px 10px" }}>
              {filtered.length === 0 ? <div style={{ textAlign: "center", padding: "2rem", color: "#aaa", fontSize: 12 }}>لا توجد نتائج</div> :
                filtered.map(p => (
                  <div key={p.id} onClick={() => setSelected(p)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, marginBottom: 3, cursor: "pointer", background: selected?.id === p.id ? "#E1F5EE" : "transparent", border: `0.5px solid ${selected?.id === p.id ? "#5DCAA5" : "transparent"}` }}>
                    <Avatar name={p.name_ar} gender={p.gender} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                        {p.short_ar || p.name_ar}
                        {(isExpired(p.expiry) || isExpired((p as any).id_expiry)) ? <span style={{ color: "#c0392b", fontSize: 11 }}>❌</span> : (isExpiringSoon(p.expiry) || isExpiringSoon((p as any).id_expiry)) && <span style={{ color: "#e67e22", fontSize: 11 }}>⚠️</span>}
                        {p.family_id && <span title="مرتبط بأقارب" style={{ fontSize: 10 }}>👨‍👩‍👧</span>}
                      </div>
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
          ) : (
            <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "max-content", width: "100%" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                <tr style={{ background: "#1D9E75", color: "white" }}>
                  <th style={{ padding: "8px 10px", border: "0.5px solid #17836", textAlign: "center" }}>م</th>
                  {COLS.map(col => <th key={col.key} style={{ padding: "8px 10px", border: "0.5px solid #17836", whiteSpace: "nowrap", textAlign: "right" }}>{col.label}</th>)}
                  <th style={{ padding: "8px 10px", border: "0.5px solid #17836", textAlign: "center" }}>إجراءات</th>
                </tr>
                <tr style={{ background: "#f0f0f0" }}>
                  <td style={{ padding: "4px 6px", border: "0.5px solid #ddd" }}></td>
                  {COLS.map(col => (
                    <td key={col.key} style={{ padding: "4px 6px", border: "0.5px solid #ddd" }}>
                      <input value={colFilters[col.key] || ""} onChange={e => setColFilters(prev => ({ ...prev, [col.key]: e.target.value }))} style={{ ...inp, padding: "2px 6px", fontSize: 10, minWidth: 60 }} placeholder="فلتر..." />
                    </td>
                  ))}
                  <td style={{ padding: "4px 6px", border: "0.5px solid #ddd" }}></td>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.id} onClick={() => setSelected(p)} style={{ cursor: "pointer", background: selected?.id === p.id ? "#E1F5EE" : i % 2 === 0 ? "white" : "#fafafa" }}>
                    <td style={{ padding: "6px 10px", border: "0.5px solid #eee", textAlign: "center", color: "#888" }}>{i + 1}</td>
                    {COLS.map(col => (
                      <td key={col.key} style={{ padding: "6px 10px", border: "0.5px solid #eee", whiteSpace: "nowrap" }}>
                        {getVal(p, col.key, col.get)}
                        {col.key === "name_ar" && ((isExpired(p.expiry) || isExpired((p as any).id_expiry)) ? <span style={{ marginRight: 4, color: "#c0392b" }}>❌</span> : (isExpiringSoon(p.expiry) || isExpiringSoon((p as any).id_expiry)) && <span style={{ marginRight: 4, color: "#e67e22" }}>⚠️</span>)}
                      </td>
                    ))}
                    <td style={{ padding: "6px 10px", border: "0.5px solid #eee", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button onClick={e => { e.stopPropagation(); setEditing(p); }} style={{ background: "#E6F1FB", border: "none", padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: "pointer", color: "#0C447C" }}>✏️</button>
                        <button onClick={e => { e.stopPropagation(); if (confirm("هتمسح الحاج ده؟")) deleteP(p.id); }} style={{ background: "#FBEAF0", border: "none", padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: "pointer", color: "#c0392b" }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && !editing && (
        <div style={{ width: 280, borderRight: "0.5px solid #e5e5e5", overflowY: "auto", padding: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>ملف الحاج</div>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: 16 }}>✕</button>
          </div>
          <div style={{ textAlign: "center", marginBottom: 12, background: "#f9f9f9", borderRadius: 10, padding: 12 }}>
            {(selected as any).photo_url ? (
              <img src={(selected as any).photo_url} alt={selected.name_ar} style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", margin: "0 auto", display: "block", border: "2px solid #5DCAA5" }} />
            ) : <Avatar name={selected.name_ar} gender={selected.gender} size={48} />}
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>{selected.name_ar}</div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{selected.name_en}</div>
          </div>
          {(isExpired(selected.expiry) || isExpired((selected as any).id_expiry)) ? (
            <div style={{ background: "#FBEAF0", border: "1.5px solid #c0392b", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontSize: 11, color: "#c0392b", fontWeight: 700, textAlign: "center" }}>
              ❌ {isExpired(selected.expiry) ? "الجواز منتهي" : "البطاقة منتهية"}
            </div>
          ) : (isExpiringSoon(selected.expiry) || isExpiringSoon((selected as any).id_expiry)) && (
            <div style={{ background: "#FAEEDA", border: "1px solid #e67e22", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontSize: 11, color: "#a85318", fontWeight: 600, textAlign: "center" }}>
              ⚠️ صلاحية {isExpiringSoon(selected.expiry) ? "الجواز" : "البطاقة"} ستنتهي خلال أقل من 6 شهور
            </div>
          )}
          {[["🛂 الجواز", selected.passport], ["🪪 البطاقة", selected.national_id], ["🌍 الجنسية", selected.nat], ["⚧ الجنس", selected.gender], ["🎂 الميلاد", selected.dob], ["📅 انتهاء الجواز", selected.expiry], ["📞 التليفون", selected.phone]].filter(([, v]) => v).map(([icon, val]) => (
            <div key={icon as string} style={{ background: "#f9f9f9", borderRadius: 8, padding: "6px 10px", marginBottom: 4, fontSize: 11 }}>{icon as string} {val as string}</div>
          ))}
          <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginTop: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6 }}>⭐ الخدمات</div>
            {[["🚌", "الباص", selected.services?.bus], ["✈️", "الطيران", selected.services?.flight], ["🏨", "الفندق", `${selected.services?.hotel_type || ""} ${selected.services?.hotel_view || ""}`.trim()], ["⛺", "منى", selected.services?.camp_mina], ["🏔", "عرفة", selected.services?.camp_arafa]].map(([icon, label, val]) => (
              <div key={label as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "0.5px solid #f5f5f5" }}>
                <span style={{ color: "#888" }}>{icon as string} {label as string}</span>
                <span style={{ fontWeight: 500, color: (val === "VIP" || val === "درجة أولى" || val === "خاص") ? "#633806" : "#333" }}>{val as string}</span>
              </div>
            ))}
          </div>
          <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8 }}>📎 المستندات</div>
            {([
              ["📷 صورة شخصية", (selected as any).photo_url, "photo_url", "photo", "image/*"],
              ["🛂 جواز السفر", (selected as any).passport_url, "passport_url", "passport_doc", "image/*"],
              ["🪪 البطاقة", (selected as any).national_id_url, "national_id_url", "idcard", "image/*"],
              ["📄 العقد", (selected as any).contract_url, "contract_url", "contract", "image/*,application/pdf"],
            ] as [string, string, string, string, string][]).map(([label, url, field, docType, accept]) => (
              <div key={label} style={{ padding: "7px 0", borderBottom: "0.5px solid #f5f5f5" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: url ? "#333" : "#bbb" }}>{label}</span>
                  {docUploading === docType ? (
                    <span style={{ fontSize: 10, color: "#888" }}>⏳ جاري الرفع...</span>
                  ) : url ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => window.open(url, "_blank")} style={{ background: "#E6F1FB", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "#0C447C" }}>👁 عرض</button>
                      <button onClick={() => downloadFile(url)} style={{ background: "#E1F5EE", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "#085041" }}>⬇️</button>
                      <button onClick={() => handleDocDelete(selected, field, url)} style={{ background: "#FBEAF0", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "#c0392b" }}>🗑</button>
                    </div>
                  ) : (
                    <>
                      <input id={`upload-${docType}`} type="file" accept={accept} style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(selected, docType, field, f); e.currentTarget.value = ""; }} />
                      <button onClick={() => document.getElementById(`upload-${docType}`)?.click()} style={{ background: "#E1F5EE", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "#085041" }}>⬆️ رفع</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* الأقارب */}
          <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 500 }}>👨‍👩‍👧 الأقارب</div>
              <button onClick={() => { setShowLinkFamily(true); setLinkSearch(""); }} style={{ background: "#E1F5EE", border: "none", padding: "2px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "#085041" }}>+ ربط</button>
            </div>
            {getFamilyMembers(selected).length === 0 ? (
              <div style={{ fontSize: 10, color: "#aaa" }}>لا يوجد أقارب مرتبطين</div>
            ) : (
              getFamilyMembers(selected).map(fm => (
                <div key={fm.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "0.5px solid #f5f5f5" }}>
                  <div onClick={() => setSelected(fm)} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer" }}>
                    <Avatar name={fm.name_ar} gender={fm.gender} size={24} />
                    <span style={{ fontSize: 11 }}>{fm.short_ar || fm.name_ar}</span>
                  </div>
                  <button onClick={() => handleUnlinkFamily(fm)} title="فك الارتباط مع هذا الشخص" style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 12 }}>✕</button>
                </div>
              ))
            )}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditing(selected)} style={{ ...btnP({ background: "#E6F1FB", color: "#0C447C" }), flex: 1 }}>✏️ تعديل</button>
            <button onClick={() => { if (confirm("هتمسح الحاج ده؟")) deleteP(selected.id); }} style={{ background: "#FBEAF0", border: "none", padding: "7px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "#c0392b" }}>🗑</button>
          </div>
        </div>
      )}

      {/* مودال التحقق من الهوية */}
      <Modal show={showVerify} onClose={() => { setShowVerify(false); setVerifyData(null); }} title="🛡️ تأكيد هوية الحاج" maxWidth={520}>
        <p style={{ fontSize: 12, color: "#888", margin: "0 0 14px", lineHeight: 1.6 }}>تأكد إن صورة الجواز وصورة البطاقة لنفس الشخص قبل الحفظ</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          {[["🛂 صورة الجواز", verifyData?.passportUrl], ["🪪 صورة البطاقة", verifyData?.idUrl]].map(([label, url]) => (
            <div key={label as string} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ background: "#f5f5f5", padding: "6px 10px", fontSize: 11, fontWeight: 500, borderBottom: "0.5px solid #e5e5e5" }}>{label as string}</div>
              {url ? (
                <img src={url as string} alt={label as string} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc", fontSize: 12 }}>لم يتم الرفع</div>
              )}
            </div>
          ))}
        </div>
        {verifyData?.idMismatch && (
          <div style={{ background: "#FAEEDA", border: "0.5px solid #e67e22", borderRadius: 8, padding: "8px 12px", marginBottom: 14, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span style={{ fontSize: 12, color: "#633806", lineHeight: 1.6 }}>الرقم الشخصي في البطاقة مختلف عن المسجل في الجواز — تأكد قبل الحفظ</span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={confirmVerify} style={{ background: "#1D9E75", color: "white", border: "none", padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>✅ نعم، نفس الشخص — حفظ</button>
          <button onClick={() => { setShowVerify(false); setVerifyData(null); }} style={{ background: "#FBEAF0", color: "#c0392b", border: "0.5px solid #f0c0cc", padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>❌ لا، مش نفس الشخص</button>
        </div>
      </Modal>

      <Modal show={showLinkFamily} onClose={() => setShowLinkFamily(false)} title="👨‍👩‍👧 ربط بأقارب">
        <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>اختر الحاج اللي عايز تربطه بـ {selected?.short_ar}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f5f5f5", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "#aaa" }}>🔍</span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={linkSearch} onChange={e => setLinkSearch(e.target.value)} autoFocus />
        </div>
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {passengers.filter(p => selected && p.id !== selected.id && (!linkSearch || p.name_ar.includes(linkSearch) || p.short_ar.includes(linkSearch))).map(p => (
            <div key={p.id} onClick={() => selected && handleLinkFamily(selected, p)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: "pointer", background: "transparent" }}
              onMouseEnter={e => e.currentTarget.style.background = "#E1F5EE"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <Avatar name={p.name_ar} gender={p.gender} size={28} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar || p.name_ar}</div>
                <div style={{ fontSize: 10, color: "#888" }}>{p.nat} · {p.gender}</div>
              </div>
              {p.family_id && <span style={{ fontSize: 9, background: "#E1F5EE", color: "#085041", padding: "1px 5px", borderRadius: 99 }}>عنده أقارب</span>}
            </div>
          ))}
        </div>
        <button onClick={() => setShowLinkFamily(false)} style={{ ...btnS(), width: "100%", marginTop: 10 }}>إلغاء</button>
      </Modal>

      <Modal show={!!editing} onClose={() => setEditing(null)} title="تعديل بيانات الحاج" maxWidth={460}>
        {editing && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              {[["الاسم بالعربي", "name_ar"], ["الاسم بالإنجليزي", "name_en"], ["المختصر عربي", "short_ar"], ["المختصر إنجليزي", "short_en"], ["رقم الجواز", "passport"], ["الرقم الشخصي", "national_id"], ["الجنسية", "nat"], ["التليفون", "phone"], ["تاريخ الميلاد", "dob"], ["انتهاء الجواز", "expiry"]].map(([l, k]) => (
                <div key={k as string}><div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>{l as string}</div><input style={inp} value={(editing as any)[k as string] || ""} onChange={e => setEditing({ ...editing, [k as string]: e.target.value })} /></div>
              ))}
              <div><div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>الجنس</div><select style={inp} value={editing.gender} onChange={e => setEditing({ ...editing, gender: e.target.value })}><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option></select></div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8 }}>⭐ الخدمات المطلوبة</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {([["🚌 الباص", "bus", ["عادي","VIP"]], ["✈️ الطيران", "flight", ["عادي","درجة أولى","بدون"]], ["🏨 نوع الغرفة", "hotel_type", ["ثنائية","ثلاثية","رباعية","سويت"]], ["🪟 إطلالة", "hotel_view", ["مطلة","غير مطلة"]], ["⛺ منى", "camp_mina", ["عادي","خاص"]], ["🏔 عرفة", "camp_arafa", ["عادي","خاص"]]] as [string,string,string[]][]).map(([l,k,opts]) => (
                  <div key={k}><div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{l}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {opts.map(o => <div key={o} onClick={() => setEditing({ ...editing, services: { ...editing.services, [k]: o } })} style={{ flex: 1, padding: "4px 2px", borderRadius: 6, border: "1.5px solid " + (editing.services?.[k as keyof typeof editing.services] === o ? "#1D9E75" : "#ddd"), background: editing.services?.[k as keyof typeof editing.services] === o ? "#E1F5EE" : "transparent", cursor: "pointer", fontSize: 10, color: editing.services?.[k as keyof typeof editing.services] === o ? "#085041" : "#666", textAlign: "center" as const }}>{o}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => saveEdit(editing)} style={{ ...btnP(), flex: 1 }}>✓ حفظ</button>
              <button onClick={() => setEditing(null)} style={btnS()}>إلغاء</button>
            </div>
          </>
        )}
      </Modal>

      {/* مودال الإضافة اليدوية */}
      <Modal show={showManual} onClose={() => setShowManual(false)} title="➕ إضافة حاج يدوياً" maxWidth={460}>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>أدخل البيانات يدوياً — المستندات تقدر ترفعها بعدين من ملف الحاج</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {([["الاسم بالعربي *", "name_ar"], ["الاسم بالإنجليزي", "name_en"], ["رقم الجواز", "passport"], ["رقم البطاقة", "national_id"], ["الجنسية", "nat"], ["التليفون", "phone"], ["تاريخ الميلاد", "dob"], ["انتهاء الجواز", "expiry"], ["انتهاء البطاقة", "id_expiry"]] as [string,string][]).map(([l, k]) => (
            <div key={k}><div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>{l}</div>
              <input style={inp} value={(manualForm as any)[k]} onChange={e => setManualForm(prev => ({ ...prev, [k]: e.target.value }))} />
            </div>
          ))}
          <div><div style={{ fontSize: 10, color: "#666", marginBottom: 3 }}>الجنس</div>
            <select style={inp} value={manualForm.gender} onChange={e => setManualForm(prev => ({ ...prev, gender: e.target.value }))}>
              <option value="ذكر">ذكر</option><option value="أنثى">أنثى</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8 }}>⭐ الخدمات</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {([["🚌 الباص", "bus", ["عادي","VIP"]], ["✈️ الطيران", "flight", ["عادي","درجة أولى","بدون"]], ["🏨 نوع الغرفة", "hotel_type", ["ثنائية","ثلاثية","رباعية","سويت"]], ["🪟 إطلالة", "hotel_view", ["مطلة","غير مطلة"]], ["⛺ منى", "camp_mina", ["عادي","خاص"]], ["🏔 عرفة", "camp_arafa", ["عادي","خاص"]]] as [string,string,string[]][]).map(([l,k,opts]) => (
              <div key={k}><div style={{ fontSize: 10, color: "#666", marginBottom: 4 }}>{l}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {opts.map(o => <div key={o} onClick={() => setManualServices(prev => ({ ...prev, [k]: o }))} style={{ flex: 1, padding: "4px 2px", borderRadius: 6, border: `1.5px solid ${(manualServices as any)[k] === o ? "#1D9E75" : "#ddd"}`, background: (manualServices as any)[k] === o ? "#E1F5EE" : "transparent", cursor: "pointer", fontSize: 10, color: (manualServices as any)[k] === o ? "#085041" : "#666", textAlign: "center" }}>{o}</div>)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleManualSave} disabled={manualSaving} style={{ ...btnP(), flex: 1, opacity: manualSaving ? 0.6 : 1 }}>{manualSaving ? "⏳ جاري الحفظ..." : "💾 حفظ"}</button>
          <button onClick={() => setShowManual(false)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}


// ===== ملخص صفحة الطيران =====
function FlightsStats({ passengers }: { passengers: any[] }) {
  const total = passengers.length;
  const assigned = passengers.filter(p => p.flight_id != null).length;
  const noTicket = passengers.filter(p => p.flight_id == null).length;
  const firstClass = passengers.filter(p => p.services?.flight === "درجة أولى").length;
  const withoutTicket = passengers.filter(p => p.services?.flight === "بدون").length;
  const pct = total ? Math.round(assigned / total * 100) : 0;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "0.5px solid #e5e5e5", marginBottom: 12, background: "#fafafa" }}>
      <div style={{ background: "#E1F5EE", borderRadius: 10, padding: "7px 14px", minWidth: 68, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#085041", marginBottom: 1 }}>موزّع</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1D9E75", lineHeight: 1 }}>{assigned}</div>
      </div>
      <div style={{ background: noTicket > 0 ? "#f0f0f0" : "#f0f0f0", borderRadius: 10, padding: "7px 14px", minWidth: 68, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#888", marginBottom: 1 }}>غير موزّع</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#aaa", lineHeight: 1 }}>{noTicket}</div>
      </div>
      <div style={{ width: 1, height: 44, background: "#e5e5e5", marginInline: 2 }} />
      <div style={{ background: "#FAEEDA", borderRadius: 10, padding: "7px 12px", minWidth: 62, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#633806", marginBottom: 1 }}>درجة أولى ⭐</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#633806", lineHeight: 1 }}>{firstClass}</div>
      </div>
      <div style={{ background: withoutTicket > 0 ? "#FBEAF0" : "#f0f0f0", borderRadius: 10, padding: "7px 12px", minWidth: 62, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: withoutTicket > 0 ? "#72243E" : "#888", marginBottom: 1 }}>بدون تذكرة</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: withoutTicket > 0 ? "#c0392b" : "#aaa", lineHeight: 1 }}>{withoutTicket}</div>
      </div>
      <div style={{ marginInlineStart: "auto" }}>
        <StatRing pct={pct} count={assigned} total={total} color="#1D9E75" label="نسبة التوزيع" />
      </div>
    </div>
  );
}

// ===== صفحة الطيران =====
function FlightsPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [expanded, setExpanded] = useState(new Set<number>());
  const [showAdd, setShowAdd] = useState(false);
  const [flightName, setFlightName] = useState("");
  const [flightType, setFlightType] = useState<"ذهاب" | "إياب">("ذهاب");
  const [airline, setAirline] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [flightTime, setFlightTime] = useState("");
  const [fromAirport, setFromAirport] = useState("");
  const [toAirport, setToAirport] = useState("");
  const [nameError, setNameError] = useState("");
  const [showAddP, setShowAddP] = useState(false);
  const [currentFlightId, setCurrentFlightId] = useState<number | null>(null);
  const [addFlightClass, setAddFlightClass] = useState("عادي");
  const [selectedP, setSelectedP] = useState(new Set<number>());
  const [pSearch, setPSearch] = useState("");

  useEffect(() => {
    supabase.from("flights").select("*").order("created_at").then(({ data }: any) => { if (data) setFlights(data as Flight[]); });
  }, []);

  const getFlightPassengers = (flightId: number) => passengers.filter(p => (p as any).flight_id === flightId);
  const toggleFlight = (id: number) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const addFlight = async () => {
    if (!flightName.trim()) return;
    if (flights.some(f => f.name.trim() === flightName.trim() && f.type === flightType)) { setNameError(`رحلة ${flightType} باسم "${flightName}" موجودة!`); return; }
    setNameError("");
    const { data, error } = await supabase.from("flights").insert([{ name: flightName.trim(), type: flightType, airline: airline.trim(), date: flightDate, time: flightTime, from_airport: fromAirport.trim(), to_airport: toAirport.trim() }]).select();
    if (!error && data?.[0]) {
      const newFlight = data[0] as Flight;
      setFlights(prev => [...prev, newFlight]);
      setExpanded(prev => new Set([...prev, newFlight.id]));
      setFlightName(""); setFlightType("ذهاب"); setAirline(""); setFlightDate(""); setFlightTime(""); setFromAirport(""); setToAirport(""); setShowAdd(false);
    }
  };

  const deleteFlight = async (id: number) => {
    if (getFlightPassengers(id).length > 0) { alert("مش هينفع تمسح رحلة فيها مسافرين!"); return; }
    await supabase.from("flights").delete().eq("id", id);
    setFlights(prev => prev.filter(f => f.id !== id));
  };

  const openAddP = (flightId: number) => { setCurrentFlightId(flightId); setSelectedP(new Set()); setPSearch(""); setAddFlightClass("عادي"); setShowAddP(true); };
  const toggleSelectP = (id: number) => setSelectedP(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const confirmAddP = async () => {
    await Promise.all([...selectedP].map(id => supabase.from("passengers").update({ flight_id: currentFlightId, flight_class: effectiveClass }).eq("id", id)));
    setPassengers(passengers.map(p => selectedP.has(p.id) ? { ...p, flight_id: currentFlightId, flight_class: effectiveClass } : p));
    setShowAddP(false);
  };

  const removeP = async (pId: number) => {
    await supabase.from("passengers").update({ flight_id: null }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, flight_id: null } : p));
  };

  const printFlight = (flight: Flight) => {
    const fp = getFlightPassengers(flight.id);
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>${flight.name}</title><style>body{font-family:Arial;direction:rtl;padding:20px}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:#1D9E75;color:white}</style></head><body><h2>✈️ ${flight.name} (${flight.type}) — ${flight.airline || ""}</h2><p style="text-align:center">${flight.from_airport || ""} ← ${flight.to_airport || ""} | ${flight.date || ""} ${flight.time || ""}</p><table><tr><th>م</th><th>الاسم</th><th>الدرجة</th></tr>${fp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar || p.name_ar}</td><td>${(p as any).flight_class || "عادي"}</td></tr>`).join("")}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };

  const printAll = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>تقرير الرحلات</title><style>body{font-family:Arial;direction:rtl;padding:20px}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin-bottom:16px}th,td{border:1px solid #ccc;padding:7px;text-align:right}th{background:#1D9E75;color:white}@media print{.f{page-break-after:always}}</style></head><body><h1>✈️ تقرير الرحلات</h1>${flights.map(f => { const fp = getFlightPassengers(f.id); return `<div class="f"><h2>${f.name} (${f.type}) — ${f.airline || ""}</h2><p style="text-align:center">${f.from_airport || ""} ← ${f.to_airport || ""} | ${f.date || ""} ${f.time || ""}</p><table><tr><th>م</th><th>الاسم</th><th>الدرجة</th></tr>${fp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar || p.name_ar}</td><td>${(p as any).flight_class || "عادي"}</td></tr>`).join("")}</table></div>`; }).join("")}<script>window.print();</script></body></html>`);
    w.document.close();
  };

  const currentFlight = flights.find(f => f.id === currentFlightId);
  const availableP = passengers.filter(p => {
    if (p.services?.flight === "بدون") return false;
    if (!currentFlight) return false;
    if ((p as any).flight_id === currentFlightId) return false;
    if ((p as any).flight_id == null) return true;
    const existing = flights.find(f => f.id === (p as any).flight_id);
    return existing?.type !== currentFlight.type;
  });
  const allSelectedWantFirst = selectedP.size > 0 && [...selectedP].every(id => passengers.find(p => p.id === id)?.services?.flight === "درجة أولى");
  const effectiveClass = (!allSelectedWantFirst && addFlightClass === "درجة أولى") ? "عادي" : addFlightClass;
  const filteredP = availableP.filter(p => !pSearch || p.name_ar.includes(pSearch) || p.passport.includes(pSearch));
  const goFlights = flights.filter(f => f.type === "ذهاب");
  const retFlights = flights.filter(f => f.type === "إياب");

  const renderGroup = (groupFlights: Flight[], type: "ذهاب" | "إياب") => (
    <div style={{ marginBottom: 16 }}>
      <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 99, background: type === "ذهاب" ? "#E6F1FB" : "#FBEAF0", color: type === "ذهاب" ? "#0C447C" : "#72243E", display: "inline-block", marginBottom: 10 }}>
        {type === "ذهاب" ? "✈ رحلات الذهاب" : "✈ رحلات الإياب"} ({groupFlights.length})
      </span>
      {groupFlights.length === 0 ? <div style={{ fontSize: 11, color: "#aaa", padding: "6px 0" }}>لا يوجد رحلات بعد</div> :
        groupFlights.map(flight => {
          const isExpanded = expanded.has(flight.id);
          const fp = getFlightPassengers(flight.id);
          return (
            <div key={flight.id} style={{ border: `0.5px solid ${type === "ذهاب" ? "#B8D4F0" : "#F0B8C8"}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
              <div onClick={() => toggleFlight(flight.id)} style={{ padding: "10px 12px", background: type === "ذهاب" ? "#F5F9FF" : "#FFF5F8", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 18 }}>✈️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{flight.name} {flight.airline && <span style={{ fontSize: 10, color: "#888" }}>— {flight.airline}</span>}</div>
                  <div style={{ fontSize: 10, color: "#888" }}>{flight.from_airport} {flight.to_airport ? `← ${flight.to_airport}` : ""} {flight.date ? `| ${flight.date}` : ""} {flight.time || ""}</div>
                </div>
                <span style={{ fontSize: 11, color: "#888" }}>{fp.length} مسافر</span>
                <button onClick={e => { e.stopPropagation(); printFlight(flight); }} style={{ background: "#f0f0f0", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>🖨️</button>
                <button onClick={e => { e.stopPropagation(); openAddP(flight.id); }} style={{ background: "#E1F5EE", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", color: "#085041" }}>+ إضافة</button>
                <button onClick={e => { e.stopPropagation(); deleteFlight(flight.id); }} style={{ background: fp.length === 0 ? "#FBEAF0" : "#f5f5f5", border: "none", padding: "3px 7px", borderRadius: 6, fontSize: 11, cursor: fp.length === 0 ? "pointer" : "not-allowed", color: fp.length === 0 ? "#c0392b" : "#ccc" }}>🗑</button>
                <span style={{ color: "#aaa" }}>{isExpanded ? "▲" : "▼"}</span>
              </div>
              {isExpanded && (
                <div style={{ padding: "8px 12px", borderTop: `0.5px solid ${type === "ذهاب" ? "#B8D4F0" : "#F0B8C8"}` }}>
                  {fp.length ? fp.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px", borderRadius: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "#aaa", width: 18, textAlign: "center" }}>{i + 1}</span>
                      <Avatar name={p.name_ar} gender={p.gender} size={24} />
                      <span style={{ fontSize: 11, flex: 1 }}>{p.short_ar || p.name_ar}</span>
                      {(p as any).flight_class === "درجة أولى" && <span style={{ fontSize: 9, background: "#FAEEDA", color: "#633806", padding: "1px 5px", borderRadius: 99 }}>⭐ أولى</span>}
                      <button onClick={() => removeP(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 12 }}>✕</button>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "8px", color: "#aaa", fontSize: 11 }}>لا يوجد مسافرون</div>}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <FlightsStats passengers={passengers} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setShowAdd(true)} style={{ ...btnP(), flex: 1 }}>+ رحلة جديدة</button>
        {flights.length > 0 && <button onClick={printAll} style={btnS()}>🖨️ طباعة الكل</button>}
      </div>
      {!flights.length ? <div style={{ textAlign: "center", padding: "2rem", color: "#aaa", fontSize: 12 }}>✈️<br />لا يوجد رحلات بعد</div> : (
        <>{renderGroup(goFlights, "ذهاب")}{renderGroup(retFlights, "إياب")}</>
      )}

      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNameError(""); }} title="✈️ رحلة جديدة" maxWidth={380}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>نوع الرحلة</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["ذهاب", "إياب"] as const).map(t => (
              <div key={t} onClick={() => setFlightType(t)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${flightType === t ? (t === "ذهاب" ? "#0C447C" : "#72243E") : "#ddd"}`, background: flightType === t ? (t === "ذهاب" ? "#E6F1FB" : "#FBEAF0") : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: flightType === t ? (t === "ذهاب" ? "#0C447C" : "#72243E") : "#666" }}>
                {t === "ذهاب" ? "✈ ذهاب" : "✈ إياب"}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>رقم الرحلة</div>
          <input style={{ ...inp, borderColor: nameError ? "#c0392b" : "#ddd" }} value={flightName} onChange={e => { setFlightName(e.target.value); setNameError(""); }} placeholder="مثال: QR501" autoFocus onKeyDown={e => e.key === "Enter" && addFlight()} />
          {nameError && <div style={{ fontSize: 11, color: "#c0392b", marginTop: 3 }}>{nameError}</div>}
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>الشركة</div>
          <input style={inp} value={airline} onChange={e => setAirline(e.target.value)} placeholder="مثال: Qatar Airways" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>التاريخ</div><input style={inp} type="date" value={flightDate} onChange={e => setFlightDate(e.target.value)} /></div>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>الوقت</div><input style={inp} type="time" value={flightTime} onChange={e => setFlightTime(e.target.value)} /></div>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>من</div><input style={inp} value={fromAirport} onChange={e => setFromAirport(e.target.value)} placeholder="الدوحة DOH" /></div>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>إلى</div><input style={inp} value={toAirport} onChange={e => setToAirport(e.target.value)} placeholder="جدة JED" /></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addFlight} style={{ ...btnP(), flex: 1 }}>✓ إضافة</button>
          <button onClick={() => { setShowAdd(false); setNameError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>

      <Modal show={showAddP} onClose={() => setShowAddP(false)} title={`✈️ إضافة — ${currentFlight?.name} (${currentFlight?.type})`}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {(["عادي", ...(allSelectedWantFirst ? ["درجة أولى"] : [])] as string[]).map(cls => (
            <div key={cls} onClick={() => setAddFlightClass(cls)} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1.5px solid ${addFlightClass === cls ? "#1D9E75" : "#ddd"}`, background: addFlightClass === cls ? "#E1F5EE" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: addFlightClass === cls ? "#085041" : "#666" }}>
              {cls === "درجة أولى" ? "⭐ درجة أولى" : "💺 عادي"}
            </div>
          ))}
          {!allSelectedWantFirst && selectedP.size > 0 && <div style={{ fontSize: 10, color: "#aaa", alignSelf: "center" }}>درجة أولى متاحة بس للي طلبوها</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "#aaa" }}>🔍</span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={pSearch} onChange={e => setPSearch(e.target.value)} />
        </div>
        {filteredP.length === 0 ? <div style={{ textAlign: "center", color: "#aaa", fontSize: 12, padding: "1rem" }}>لا يوجد مسافرين متاحين</div> :
          filteredP.map(p => {
            const isSel = selectedP.has(p.id);
            const wantsFirst = p.services?.flight === "درجة أولى";
            return (
              <div key={p.id} onClick={() => toggleSelectP(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: "pointer", background: isSel ? "#E1F5EE" : wantsFirst ? "#FFFBEA" : "transparent", border: `0.5px solid ${isSel ? "#5DCAA5" : wantsFirst ? "#F5C842" : "transparent"}` }}>
                <Avatar name={p.name_ar} gender={p.gender} size={28} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar || p.name_ar}</div>
                  <div style={{ fontSize: 10, color: "#888" }}>{p.nat}</div>
                </div>
                {wantsFirst && <span style={{ fontSize: 9, background: "#FAEEDA", color: "#633806", padding: "1px 5px", borderRadius: 99 }}>⭐ طلب أولى</span>}
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

// ===== ملخص صفحة الباصات =====
function BusesStats({ buses, passengers }: { buses: Bus[]; passengers: any[] }) {
  const total = passengers.length;
  const assignedCount = passengers.filter(p => p.bus_id != null).length;
  const unassigned = total - assignedCount;
  const normalBuses = buses.filter(b => b.type !== "VIP").length;
  const vipBuses = buses.filter(b => b.type === "VIP").length;
  const vipRequested = passengers.filter(p => p.services?.bus === "VIP").length;
  const pct = total ? Math.round(assignedCount / total * 100) : 0;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "0.5px solid #e5e5e5", marginBottom: 12, background: "#fafafa" }}>
      <div style={{ background: "#E1F5EE", borderRadius: 10, padding: "7px 14px", minWidth: 68, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#085041", marginBottom: 1 }}>موزّع</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1D9E75", lineHeight: 1 }}>{assignedCount}</div>
      </div>
      <div style={{ background: unassigned > 0 ? "#FBEAF0" : "#f0f0f0", borderRadius: 10, padding: "7px 14px", minWidth: 68, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: unassigned > 0 ? "#72243E" : "#888", marginBottom: 1 }}>غير موزّع</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: unassigned > 0 ? "#c0392b" : "#aaa", lineHeight: 1 }}>{unassigned}</div>
      </div>
      <div style={{ width: 1, height: 44, background: "#e5e5e5", marginInline: 2 }} />
      <div style={{ background: "#f0f0f0", borderRadius: 10, padding: "7px 12px", minWidth: 60, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#555", marginBottom: 1 }}>باص عادي</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#333", lineHeight: 1 }}>{normalBuses}</div>
      </div>
      <div style={{ background: "#FAEEDA", borderRadius: 10, padding: "7px 12px", minWidth: 60, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#633806", marginBottom: 1 }}>باص VIP ⭐</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#633806", lineHeight: 1 }}>{vipBuses}</div>
      </div>
      <div style={{ width: 1, height: 44, background: "#e5e5e5", marginInline: 2 }} />
      <div style={{ background: "#FFFBEA", borderRadius: 10, padding: "7px 12px", minWidth: 70, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#8B6914", marginBottom: 1 }}>طلبوا VIP</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#8B6914", lineHeight: 1 }}>{vipRequested}</div>
      </div>
      <div style={{ marginInlineStart: "auto" }}>
        <StatRing pct={pct} count={assignedCount} total={total} color="#1D9E75" label="نسبة التوزيع" />
      </div>
    </div>
  );
}

// ===== ملخص صفحة المخيمات =====
function CampsStats({ camps, passengers, campIdKey }: { camps: Camp[]; passengers: any[]; campIdKey: string }) {
  const total = passengers.length;
  const assignedCount = passengers.filter(p => p[campIdKey] != null).length;
  const unassigned = total - assignedCount;
  const normalCamps = camps.filter(c => c.type === "عادي").length;
  const specialCamps = camps.filter(c => c.type === "خاص").length;
  const maleCamps = camps.filter(c => c.gender === "ذكر").length;
  const femaleCamps = camps.filter(c => c.gender === "أنثى").length;
  const pct = total ? Math.round(assignedCount / total * 100) : 0;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "0.5px solid #e5e5e5", marginBottom: 12, background: "#fafafa" }}>
      <div style={{ background: "#E1F5EE", borderRadius: 10, padding: "7px 14px", minWidth: 68, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#085041", marginBottom: 1 }}>موزّع</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1D9E75", lineHeight: 1 }}>{assignedCount}</div>
      </div>
      <div style={{ background: unassigned > 0 ? "#FBEAF0" : "#f0f0f0", borderRadius: 10, padding: "7px 14px", minWidth: 68, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: unassigned > 0 ? "#72243E" : "#888", marginBottom: 1 }}>غير موزّع</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: unassigned > 0 ? "#c0392b" : "#aaa", lineHeight: 1 }}>{unassigned}</div>
      </div>
      <div style={{ width: 1, height: 44, background: "#e5e5e5", marginInline: 2 }} />
      <div style={{ background: "#f0f0f0", borderRadius: 10, padding: "7px 12px", minWidth: 58, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#555", marginBottom: 1 }}>عادي</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#333", lineHeight: 1 }}>{normalCamps}</div>
      </div>
      <div style={{ background: "#FAEEDA", borderRadius: 10, padding: "7px 12px", minWidth: 58, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#633806", marginBottom: 1 }}>خاص ⭐</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#633806", lineHeight: 1 }}>{specialCamps}</div>
      </div>
      <div style={{ width: 1, height: 44, background: "#e5e5e5", marginInline: 2 }} />
      <div style={{ background: "#E6F1FB", borderRadius: 10, padding: "7px 12px", minWidth: 58, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#0C447C", marginBottom: 1 }}>خيام رجال</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#0C447C", lineHeight: 1 }}>{maleCamps}</div>
      </div>
      <div style={{ background: "#FBEAF0", borderRadius: 10, padding: "7px 12px", minWidth: 58, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#72243E", marginBottom: 1 }}>خيام نساء</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#72243E", lineHeight: 1 }}>{femaleCamps}</div>
      </div>
      <div style={{ marginInlineStart: "auto" }}>
        <StatRing pct={pct} count={assignedCount} total={total} color="#1D9E75" label="نسبة التوزيع" />
      </div>
    </div>
  );
}

// ===== ملخص صفحة الفندق =====
function HotelStats({ rooms, passengers }: { rooms: Room[]; passengers: any[] }) {
  const total = passengers.length;
  const assignedCount = passengers.filter(p => p.room_id != null).length;
  const unassigned = total - assignedCount;
  const pct = total ? Math.round(assignedCount / total * 100) : 0;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "0.5px solid #e5e5e5", marginBottom: 12, background: "#fafafa" }}>
      <div style={{ background: "#E1F5EE", borderRadius: 10, padding: "7px 14px", minWidth: 68, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: "#085041", marginBottom: 1 }}>موزّع</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1D9E75", lineHeight: 1 }}>{assignedCount}</div>
      </div>
      <div style={{ background: unassigned > 0 ? "#FBEAF0" : "#f0f0f0", borderRadius: 10, padding: "7px 14px", minWidth: 68, textAlign: "center" }}>
        <div style={{ fontSize: 9, color: unassigned > 0 ? "#72243E" : "#888", marginBottom: 1 }}>غير موزّع</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: unassigned > 0 ? "#c0392b" : "#aaa", lineHeight: 1 }}>{unassigned}</div>
      </div>
      <div style={{ width: 1, height: 44, background: "#e5e5e5", marginInline: 2 }} />
      {ROOM_TYPES.map(t => {
        const [bg, clr] = ROOM_COLORS[t];
        const count = rooms.filter(r => r.type === t).length;
        const req = passengers.filter(p => p.services?.hotel_type === t).length;
        return (
          <div key={t} style={{ background: bg, borderRadius: 10, padding: "5px 10px", minWidth: 56, textAlign: "center" }}>
            <div style={{ fontSize: 9, color: clr, fontWeight: 600, marginBottom: 1 }}>{t}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: clr, lineHeight: 1 }}>{count}</div>
            <div style={{ fontSize: 9, color: clr, opacity: 0.75 }}>طلب: {req}</div>
          </div>
        );
      })}
      <div style={{ marginInlineStart: "auto" }}>
        <StatRing pct={pct} count={assignedCount} total={total} color="#534AB7" label="نسبة التوزيع" />
      </div>
    </div>
  );
}

function BusesPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
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

  useEffect(() => {
    supabase.from("buses").select("*").order("created_at").then(({ data }: any) => { if (data) setBuses(data); });
  }, []);

  const getBusPassengers = (busId: number) => passengers.filter(p => p.bus_id === busId);

  const toggleBus = (id: number) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const addBus = async () => {
    if (!busName.trim()) return;
    if (buses.some(b => b.name.trim() === busName.trim())) { setNameError(`باص باسم "${busName}" موجود بالفعل!`); return; }
    setNameError("");
    const { data, error } = await supabase.from("buses").insert([{ name: busName.trim(), type: busType }]).select();
    if (!error && data?.[0]) {
      const newBus = data[0] as Bus;
      setBuses(prev => [...prev, newBus]);
      setExpanded(prev => new Set([...prev, newBus.id]));
      setBusName(""); setBusType("عادي"); setShowAdd(false);
    }
  };

  const deleteBus = async (id: number) => {
    if (getBusPassengers(id).length > 0) { alert("مش هينفع تمسح باص فيه مسافرين!"); return; }
    await supabase.from("buses").delete().eq("id", id);
    setBuses(prev => prev.filter(b => b.id !== id));
  };

  const openAddP = (busId: number) => { setCurrentBusId(busId); setSelectedP(new Set()); setPSearch(""); setShowAddP(true); };
  const toggleSelectP = (id: number) => setSelectedP(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const confirmAddP = async () => {
    await Promise.all([...selectedP].map(id => supabase.from("passengers").update({ bus_id: currentBusId }).eq("id", id)));
    setPassengers(passengers.map(p => selectedP.has(p.id) ? { ...p, bus_id: currentBusId } : p));
    // اقتراح إضافة الأقارب
    const familyToAdd = passengers.filter(p => !selectedP.has(p.id) && p.bus_id == null && [...selectedP].some(id => { const sel = passengers.find(x => x.id === id); return sel?.family_id && sel.family_id === p.family_id; }));
    if (familyToAdd.length > 0 && confirm(`هتوضع حجاج بدون أقاربهم!\nهتضيف أقاربهم معاهم؟\n${familyToAdd.map(p => p.short_ar).join("، ")}`)) {
      await Promise.all(familyToAdd.map(p => supabase.from("passengers").update({ bus_id: currentBusId }).eq("id", p.id)));
      setPassengers((passengers as Passenger[]).map(p => familyToAdd.some((f: any) => f.id === p.id) ? { ...p, bus_id: currentBusId } : p));
    }
    setShowAddP(false);
  };

  const removeP = async (pId: number) => {
    await supabase.from("passengers").update({ bus_id: null }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, bus_id: null } : p));
  };

  const moveP = async (pId: number, toId: string) => {
    if (!toId) return;
    const newBusId = parseInt(toId);
    await supabase.from("passengers").update({ bus_id: newBusId }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, bus_id: newBusId } : p));
  };

  const printBus = (bus: Bus) => {
    const bp = getBusPassengers(bus.id);
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>${bus.name}</title><style>body{font-family:Arial;direction:rtl;padding:20px}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:#1D9E75;color:white}</style></head><body><h2>🚌 ${bus.name} ${bus.type === "VIP" ? "(VIP)" : ""}</h2><table><tr><th>م</th><th>الاسم</th></tr>${bp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };

  const printAll = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>تقرير الباصات</title><style>body{font-family:Arial;direction:rtl;padding:20px}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{border:1px solid #ccc;padding:7px;text-align:right}th{background:#1D9E75;color:white}@media print{.bus{page-break-after:always}}</style></head><body><h1>🚌 تقرير الباصات</h1>${buses.map(bus => { const bp = getBusPassengers(bus.id); return `<div class="bus"><h2>${bus.name} ${bus.type === "VIP" ? "(VIP)" : ""}</h2><table><tr><th>م</th><th>الاسم</th></tr>${bp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table></div>`; }).join("")}<script>window.print();</script></body></html>`);
    w.document.close();
  };

  const currentBus = buses.find(b => b.id === currentBusId);
  const filteredP = passengers.filter(p => !pSearch || p.name_ar.includes(pSearch));

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <BusesStats buses={buses} passengers={passengers} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setShowAdd(true)} style={{ ...btnP(), flex: 1 }}>+ باص جديد</button>
        {buses.length > 0 && <button onClick={printAll} style={btnS()}>🖨️ طباعة الكل</button>}
      </div>
      {!buses.length ? <div style={{ textAlign: "center", padding: "2rem", color: "#aaa", fontSize: 12 }}>🚌<br />لا يوجد باصات بعد</div> :
        buses.map(bus => {
          const isExpanded = expanded.has(bus.id);
          const bp = getBusPassengers(bus.id);
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
                      <select onChange={e => moveP(p.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}>
                        <option value="">نقل لـ...</option>
                        {buses.filter(b => b.id !== bus.id).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <button onClick={() => removeP(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 12 }}>✕</button>
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
          <input style={{ ...inp, borderColor: nameError ? "#c0392b" : "#ddd" }} value={busName} onChange={e => { setBusName(e.target.value); setNameError(""); }} placeholder="مثال: باص 1" autoFocus onKeyDown={e => e.key === "Enter" && addBus()} />
          {nameError && <div style={{ fontSize: 11, color: "#c0392b", marginTop: 4 }}>{nameError}</div>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>نوع الباص</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["عادي", "VIP"].map(t => <div key={t} onClick={() => setBusType(t)} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1.5px solid ${busType === t ? "#1D9E75" : "#ddd"}`, background: busType === t ? "#E1F5EE" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: busType === t ? "#085041" : "#666" }}>{t === "VIP" ? "⭐ VIP" : "🚌 عادي"}</div>)}
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
          const isAssigned = p.bus_id != null && p.bus_id !== currentBusId;
          const isInBus = p.bus_id === currentBusId;
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


function CampsPage({ pageType, passengers, setPassengers }: { pageType: "منى" | "عرفة"; passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
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

  const campIdKey = pageType === "منى" ? "camp_mina_id" : "camp_arafa_id";
  const serviceKey = pageType === "منى" ? "camp_mina" : "camp_arafa";
  const icon = pageType === "منى" ? "⛺" : "🏔";

  useEffect(() => {
    supabase.from("camps").select("*").eq("page_type", pageType).order("created_at").then(({ data }: any) => { if (data) setCamps(data as Camp[]); });
  }, [pageType]);

  const getCampPassengers = (campId: number) => passengers.filter(p => (p as any)[campIdKey] === campId);

  const toggleCamp = (id: number) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const addCamp = async () => {
    if (!campName.trim()) return;
    if (camps.some(c => c.name.trim() === campName.trim() && c.gender === campGender)) { setNameError(`مخيم ${campGender === "ذكر" ? "رجال" : "نساء"} باسم "${campName}" موجود!`); return; }
    setNameError("");
    const { data, error } = await supabase.from("camps").insert([{ name: campName.trim(), gender: campGender, type: campType, page_type: pageType }]).select();
    if (!error && data?.[0]) {
      setCamps(prev => [...prev, data[0] as Camp]);
      setExpanded(prev => new Set([...prev, data[0].id]));
      setCampName(""); setCampGender("ذكر"); setCampType("عادي"); setShowAdd(false);
    }
  };

  const deleteCamp = async (id: number) => {
    if (getCampPassengers(id).length > 0) { alert("أزل المسافرين الأول!"); return; }
    await supabase.from("camps").delete().eq("id", id);
    setCamps(prev => prev.filter(c => c.id !== id));
  };

  const openAddP = (campId: number) => { setCurrentCampId(campId); setSelectedP(new Set()); setPSearch(""); setShowAddP(true); };
  const toggleSelectP = (id: number) => setSelectedP(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const confirmAddP = async () => {
    await Promise.all([...selectedP].map(id => supabase.from("passengers").update({ [campIdKey]: currentCampId }).eq("id", id)));
    setPassengers(passengers.map(p => selectedP.has(p.id) ? { ...p, [campIdKey]: currentCampId } : p));
    // اقتراح إضافة الأقارب
    const isSpecial = currentCamp?.type === "خاص";
    const familyToAdd = passengers.filter(p => !selectedP.has(p.id) && (p as any)[campIdKey] == null && (isSpecial || p.gender === currentCamp?.gender) && [...selectedP].some(id => { const sel = passengers.find(x => x.id === id); return sel?.family_id && sel.family_id === p.family_id; }));
    if (familyToAdd.length > 0 && confirm(`هتوضع حجاج بدون أقاربهم!\nهتضيف أقاربهم معاهم؟\n${familyToAdd.map(p => p.short_ar).join("، ")}`)) {
      await Promise.all(familyToAdd.map(p => supabase.from("passengers").update({ [campIdKey]: currentCampId }).eq("id", p.id)));
      setPassengers((passengers as Passenger[]).map(p => familyToAdd.some((f: any) => f.id === p.id) ? { ...p, [campIdKey]: currentCampId } : p));
    }
    setShowAddP(false);
  };

  const removeP = async (pId: number) => {
    await supabase.from("passengers").update({ [campIdKey]: null }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, [campIdKey]: null } : p));
  };

  const moveP = async (pId: number, toId: string) => {
    if (!toId) return;
    const newCampId = parseInt(toId);
    const fc = camps.find(c => c.id === (passengers.find(p => p.id === pId) as any)?.[campIdKey]);
    const tc = camps.find(c => c.id === newCampId);
    if (fc && tc && fc.gender !== tc.gender && tc.type !== "خاص") return;
    await supabase.from("passengers").update({ [campIdKey]: newCampId }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, [campIdKey]: newCampId } : p));
  };

  const printCamp = (camp: Camp) => {
    const cp = getCampPassengers(camp.id);
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>مخيم ${camp.name}</title><style>body{font-family:Arial;direction:rtl;padding:20px}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:${camp.gender === "ذكر" ? "#0C447C" : "#72243E"};color:white}</style></head><body><h2>${icon} مخيم ${camp.name} — ${camp.gender === "ذكر" ? "رجال" : "نساء"} (${camp.type})</h2><table><tr><th>م</th><th>الاسم</th></tr>${cp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };

  const printAll = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>مخيمات ${pageType}</title><style>body{font-family:Arial;direction:rtl;padding:20px}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{border:1px solid #ccc;padding:7px;text-align:right}@media print{.c{page-break-after:always}}</style></head><body><h1>${icon} مخيمات ${pageType}</h1>${camps.map(camp => { const cp = getCampPassengers(camp.id); return `<div class="c"><h2 style="background:${camp.gender === "ذكر" ? "#0C447C" : "#72243E"};color:white;padding:8px;border-radius:6px">مخيم ${camp.name} — ${camp.gender === "ذكر" ? "رجال" : "نساء"}</h2><table><tr><th style="background:#555;color:white">م</th><th style="background:#555;color:white">الاسم</th></tr>${cp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table></div>`; }).join("")}<script>window.print();</script></body></html>`);
    w.document.close();
  };

  const currentCamp = camps.find(c => c.id === currentCampId);
  const genderPool = currentCamp?.type === "خاص" ? passengers : passengers.filter(p => p.gender === currentCamp?.gender);
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
          const cp = getCampPassengers(camp.id);
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
                      {sameCamps.length > 0 && <select onChange={e => moveP(p.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}><option value="">نقل لـ...</option>{sameCamps.map(c => <option key={c.id} value={c.id}>مخيم {c.name}</option>)}</select>}
                      <button onClick={() => removeP(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 12 }}>✕</button>
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
      <CampsStats camps={camps} passengers={passengers} campIdKey={campIdKey} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setShowAdd(true)} style={{ ...btnP(), flex: 1 }}>+ مخيم جديد</button>
        {camps.length > 0 && <button onClick={printAll} style={btnS()}>🖨️ طباعة الكل</button>}
      </div>
      {!camps.length ? <div style={{ textAlign: "center", padding: "2rem", color: "#aaa", fontSize: 12 }}><div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>لا يوجد مخيمات بعد</div> : (<>{renderGroup(maleCamps, "ذكر")}{renderGroup(femaleCamps, "أنثى")}</>)}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNameError(""); }} title={`${icon} مخيم جديد`} maxWidth={340}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>رقم / اسم المخيم</div>
          <input style={{ ...inp, borderColor: nameError ? "#c0392b" : "#ddd" }} value={campName} onChange={e => { setCampName(e.target.value); setNameError(""); }} autoFocus onKeyDown={e => e.key === "Enter" && addCamp()} />
          {nameError && <div style={{ fontSize: 11, color: "#c0392b", marginTop: 4 }}>{nameError}</div>}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>الجنس</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["ذكر", "أنثى"] as const).map(g => <div key={g} onClick={() => setCampGender(g)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1.5px solid ${campGender === g ? (g === "ذكر" ? "#0C447C" : "#72243E") : "#ddd"}`, background: campGender === g ? (g === "ذكر" ? "#E6F1FB" : "#FBEAF0") : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: campGender === g ? (g === "ذكر" ? "#0C447C" : "#72243E") : "#666" }}>{g === "ذكر" ? "👨 رجال" : "👩 نساء"}</div>)}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>نوع الخيمة</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["عادي", "خاص"] as const).map(t => <div key={t} onClick={() => setCampType(t)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1.5px solid ${campType === t ? "#1D9E75" : "#ddd"}`, background: campType === t ? "#E1F5EE" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: campType === t ? "#085041" : "#666" }}>{t === "خاص" ? "⭐ خاص" : "🏕 عادي"}</div>)}
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
            const isInCamp = (p as any)[campIdKey] === currentCampId;
            const isAssigned = (p as any)[campIdKey] != null && !isInCamp;
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


function HotelPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [expanded, setExpanded] = useState(new Set<number>());
  const [showAdd, setShowAdd] = useState(false);
  const [showRange, setShowRange] = useState(false);
  const [showAddP, setShowAddP] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomFloor, setRoomFloor] = useState("");
  const [roomType, setRoomType] = useState<Room["type"]>("ثنائية");
  const [numberError, setNumberError] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeFloor, setRangeFloor] = useState("");
  const [rangeType, setRangeType] = useState<Room["type"]>("ثنائية");
  const [rangeError, setRangeError] = useState("");
  const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
  const [selectedP, setSelectedP] = useState(new Set<number>());
  const [pSearch, setPSearch] = useState("");
  const [printFilter, setPrintFilter] = useState<"all" | "floor" | "type">("all");
  const [printFloor, setPrintFloor] = useState("");
  const [printType, setPrintType] = useState<Room["type"]>("ثنائية");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from("rooms").select("*").order("number").then(({ data }: any) => { if (data) setRooms(data as Room[]); });
  }, []);

  const getRoomPassengers = (roomId: number) => passengers.filter(p => p.room_id === roomId);
  const floors = [...new Set(rooms.filter(r => r.floor).map(r => r.floor))].sort();

  const toggleRoom = (id: number) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const addRoom = async () => {
    if (!roomNumber.trim()) return;
    if (rooms.some(r => r.number === roomNumber.trim())) { setNumberError(`غرفة "${roomNumber}" موجودة!`); return; }
    setNumberError("");
    const { data, error } = await supabase.from("rooms").insert([{ number: roomNumber.trim(), floor: roomFloor.trim(), type: roomType }]).select();
    if (!error && data?.[0]) {
      setRooms(prev => [...prev, data[0] as Room]);
      setExpanded(prev => new Set([...prev, data[0].id]));
      setRoomNumber(""); setRoomFloor(""); setRoomType("ثنائية"); setShowAdd(false);
    }
  };

  const addRange = async () => {
    const from = parseInt(rangeFrom), to = parseInt(rangeTo);
    if (!from || !to || from > to) { setRangeError("تأكد من الأرقام"); return; }
    const existingNums = new Set(rooms.map(r => r.number));
    const newRooms = [];
    for (let n = from; n <= to; n++) {
      if (!existingNums.has(String(n))) newRooms.push({ number: String(n), floor: rangeFloor.trim(), type: rangeType });
    }
    if (newRooms.length === 0) { setRangeError("كل الغرف في هذا النطاق موجودة بالفعل!"); return; }
    setRangeError("");
    const { data, error } = await supabase.from("rooms").insert(newRooms).select();
    if (!error && data) { setRooms(prev => [...prev, ...data as Room[]]); }
    setRangeFrom(""); setRangeTo(""); setRangeFloor(""); setRangeType("ثنائية"); setShowRange(false);
  };

  const handleExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").slice(1);
      const existingNums = new Set(rooms.map(r => r.number));
      const newRooms: any[] = [];
      lines.forEach(line => {
        const parts = line.split(",");
        if (parts.length >= 2) {
          const num = parts[0]?.trim(), type = parts[1]?.trim() as Room["type"], floor = parts[2]?.trim() || "";
          if (num && !existingNums.has(num) && ROOM_TYPES.includes(type)) newRooms.push({ number: num, floor, type });
        }
      });
      if (newRooms.length > 0) {
        const { data, error } = await supabase.from("rooms").insert(newRooms).select();
        if (!error && data) setRooms(prev => [...prev, ...data as Room[]]);
      } else alert("لم يتم إضافة غرف. تأكد من شكل الملف.");
    };
    reader.readAsText(file);
  };

  const deleteRoom = async (id: number) => {
    if (getRoomPassengers(id).length > 0) { alert("أزل المسافرين الأول!"); return; }
    await supabase.from("rooms").delete().eq("id", id);
    setRooms(prev => prev.filter(r => r.id !== id));
  };

  const openAddP = (roomId: number) => { setCurrentRoomId(roomId); setSelectedP(new Set()); setPSearch(""); setShowAddP(true); };
  const toggleSelectP = (id: number) => setSelectedP(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const confirmAddP = async () => {
    await Promise.all([...selectedP].map(id => supabase.from("passengers").update({ room_id: currentRoomId }).eq("id", id)));
    setPassengers(passengers.map(p => selectedP.has(p.id) ? { ...p, room_id: currentRoomId } : p));
    setShowAddP(false);
  };

  const removeP = async (pId: number) => {
    await supabase.from("passengers").update({ room_id: null }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, room_id: null } : p));
  };

  const moveP = async (pId: number, toId: string) => {
    if (!toId) return;
    const newRoomId = parseInt(toId);
    await supabase.from("passengers").update({ room_id: newRoomId }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, room_id: newRoomId } : p));
  };

  const doPrint = (roomsToPrint: Room[]) => {
    const w = window.open("", "_blank"); if (!w) return;
    const half = Math.ceil(roomsToPrint.length / 2);
    const left = roomsToPrint.slice(0, half), right = roomsToPrint.slice(half);
    const renderRoom = (room: Room) => {
      const rp = getRoomPassengers(room.id);
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
      <HotelStats rooms={rooms} passengers={passengers} />
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
          const rp = getRoomPassengers(room.id);
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
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: ROOM_COLORS[p.services.hotel_type]?.[0] || "#f0f0f0", color: ROOM_COLORS[p.services.hotel_type]?.[1] || "#555" }}>{p.services.hotel_type} {p.services.hotel_view}</span>
                      {p.services.hotel_type !== room.type && <span style={{ fontSize: 9, color: "#e67e22" }}>⚠️</span>}
                      <select onChange={e => moveP(p.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "#f5f5f5", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}><option value="">نقل لـ...</option>{rooms.filter(r => r.id !== room.id).map(r => <option key={r.id} value={r.id}>غرفة {r.number}</option>)}</select>
                      <button onClick={() => removeP(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: 12 }}>✕</button>
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
            {ROOM_TYPES.map(t => { const [bg, clr] = ROOM_COLORS[t]; return <div key={t} onClick={() => setRoomType(t)} style={{ flex: 1, minWidth: "45%", padding: 7, borderRadius: 8, border: `1.5px solid ${roomType === t ? clr : "#ddd"}`, background: roomType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: roomType === t ? clr : "#666" }}>{t}</div>; })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}><button onClick={addRoom} style={{ ...btnP(), flex: 1 }}>✓ إضافة</button><button onClick={() => { setShowAdd(false); setNumberError(""); }} style={btnS()}>إلغاء</button></div>
      </Modal>
      <Modal show={showRange} onClose={() => { setShowRange(false); setRangeError(""); }} title="📋 إضافة نطاق غرف" maxWidth={360}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>من رقم</div><input style={inp} type="number" value={rangeFrom} onChange={e => { setRangeFrom(e.target.value); setRangeError(""); }} /></div>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>إلى رقم</div><input style={inp} type="number" value={rangeTo} onChange={e => { setRangeTo(e.target.value); setRangeError(""); }} /></div>
          <div><div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>الطابق</div><input style={inp} value={rangeFloor} onChange={e => setRangeFloor(e.target.value)} /></div>
        </div>
        {rangeError && <div style={{ fontSize: 11, color: "#c0392b", marginBottom: 8 }}>{rangeError}</div>}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>نوع الغرف</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {ROOM_TYPES.map(t => { const [bg, clr] = ROOM_COLORS[t]; return <div key={t} onClick={() => setRangeType(t)} style={{ flex: 1, minWidth: "45%", padding: 7, borderRadius: 8, border: `1.5px solid ${rangeType === t ? clr : "#ddd"}`, background: rangeType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: rangeType === t ? clr : "#666" }}>{t}</div>; })}
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
          const isInRoom = p.room_id === currentRoomId;
          const isAssigned = p.room_id != null && !isInRoom;
          const isSel = selectedP.has(p.id);
          const [reqBg, reqClr] = ROOM_COLORS[p.services.hotel_type] || ["#f0f0f0", "#555"];
          return (
            <div key={p.id} onClick={() => !isAssigned && !isInRoom && toggleSelectP(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: isAssigned || isInRoom ? "not-allowed" : "pointer", background: isSel ? "#E1F5EE" : "transparent", border: `0.5px solid ${isSel ? "#5DCAA5" : "transparent"}`, opacity: isAssigned ? 0.4 : 1 }}>
              <Avatar name={p.name_ar} gender={p.gender} size={28} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar}</div><div style={{ fontSize: 10, color: "#888" }}>{isInRoom ? "✓ في الغرفة" : isAssigned ? "موزّع" : "غير موزّع"}</div></div>
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: reqBg, color: reqClr }}>{p.services.hotel_type} {p.services.hotel_view}</span>
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


function ArchivePage({ currentUser }: { currentUser: User }) {
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [data, setData] = useState<{ passengers: Passenger[]; buses: any[]; camps: any[]; rooms: any[] }>({ passengers: [], buses: [], camps: [], rooms: [] });
  const [loading, setLoading] = useState(false);
  const [activeReport, setActiveReport] = useState("passengers");
  const [showClose, setShowClose] = useState(false);
  const [closeStep, setCloseStep] = useState(1);
  const [newSeasonName, setNewSeasonName] = useState("");
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    supabase.from("seasons").select("*").not("closed_at", "is", null).order("id", { ascending: false })
      .then(({ data: d }: any) => { if (d) setSeasons(d); });
  }, []);

  const [showDelete, setShowDelete] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [seasonToDelete, setSeasonToDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openDelete = (s: any) => { setSeasonToDelete(s); setDeleteStep(1); setShowDelete(true); };

  const confirmDelete = async () => {
    if (!seasonToDelete) return;
    setDeleting(true);
    await Promise.all([
      supabase.from("passengers").delete().eq("season_id", seasonToDelete.id),
      supabase.from("buses").delete().eq("season_id", seasonToDelete.id),
      supabase.from("camps").delete().eq("season_id", seasonToDelete.id),
      supabase.from("rooms").delete().eq("season_id", seasonToDelete.id),
    ]);
    await supabase.from("seasons").delete().eq("id", seasonToDelete.id);
    setSeasons(prev => prev.filter(s => s.id !== seasonToDelete.id));
    setDeleting(false); setShowDelete(false); setSeasonToDelete(null);
  };

  const openSeason = async (season: any) => {
    setSelected(season); setLoading(true); setActiveReport("passengers");
    const [{ data: p }, { data: b }, { data: c }, { data: r }] = await Promise.all([
      supabase.from("passengers").select("*").eq("season_id", season.id),
      supabase.from("buses").select("*").eq("season_id", season.id),
      supabase.from("camps").select("*").eq("season_id", season.id),
      supabase.from("rooms").select("*").eq("season_id", season.id),
    ]);
    setData({ passengers: (p || []) as Passenger[], buses: b || [], camps: c || [], rooms: r || [] });
    setLoading(false);
  };

  const closeSeason = async () => {
    if (!newSeasonName.trim()) { alert("اكتب اسم الموسم الجديد!"); return; }
    setClosing(true);
    // جيب الموسم الحالي
    const { data: current } = await supabase.from("seasons").select("*").is("closed_at", null).single();
    if (!current) { alert("مفيش موسم مفتوح!"); setClosing(false); return; }
    // قفّل الموسم الحالي
    await supabase.from("seasons").update({ closed_at: new Date().toISOString(), closed_by: currentUser.name }).eq("id", current.id);
    // افتح موسم جديد
    const { data: newSeason } = await supabase.from("seasons").insert([{ name: newSeasonName.trim() }]).select().single();
    if (newSeason) {
      // حدّث season_id للبيانات الحالية (الكل يتنقل للأرشيف)
      await Promise.all([
        supabase.from("passengers").update({ season_id: current.id }).is("season_id", null),
        supabase.from("buses").update({ season_id: current.id }).is("season_id", null),
        supabase.from("camps").update({ season_id: current.id }).is("season_id", null),
        supabase.from("rooms").update({ season_id: current.id }).is("season_id", null),
      ]);
    }
    // إضافة الموسم المقفول للقائمة
    const { data: closedSeasons } = await supabase.from("seasons").select("*").not("closed_at", "is", null).order("id", { ascending: false });
    if (closedSeasons) setSeasons(closedSeasons);
    setShowClose(false); setNewSeasonName(""); setClosing(false);
    alert(`✅ تم إقفال الموسم الحالي وبدأ موسم ${newSeasonName}!`);
  };

  const getBusPassengers = (busId: number) => data.passengers.filter(p => p.bus_id === busId);
  const getCampPassengers = (campId: number, key: string) => data.passengers.filter(p => (p as any)[key] === campId);
  const getRoomPassengers = (roomId: number) => data.passengers.filter(p => p.room_id === roomId);

  const printPassengers = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>قائمة الحجاج - ${selected?.name}</title><style>body{font-family:Arial;direction:rtl;padding:16px;font-size:10px}h1{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:5px 8px;text-align:right}th{background:#1D9E75;color:white}tr:nth-child(even){background:#f9f9f9}</style></head><body><h1>قائمة الحجاج — موسم ${selected?.name}</h1><table><tr><th>م</th><th>الاسم</th><th>الجواز</th><th>الجنسية</th><th>الجنس</th></tr>${data.passengers.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name_ar}</td><td>${p.passport}</td><td>${p.nat}</td><td>${p.gender}</td></tr>`).join("")}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };

  if (!selected) {
    return (
      <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
        {currentUser.permissions.view_archive && (
          <div style={{ background: "#FAEEDA", border: "1px solid #e67e22", borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ fontSize: 13, fontWeight: 600 }}>🔒 إقفال الموسم الحالي</div><div style={{ fontSize: 11, color: "#888" }}>إقفال الموسم وبدء موسم حج جديد</div></div>
            <button onClick={() => { setShowClose(true); setCloseStep(1); setNewSeasonName(""); }} style={{ background: "#e67e22", color: "white", border: "none", padding: "6px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>إقفال</button>
          </div>
        )}
        <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>المواسم المحفوظة</div>
        {seasons.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#aaa" }}><div style={{ fontSize: 32, marginBottom: 8 }}>🗄</div><div>لا يوجد مواسم محفوظة بعد</div></div>
        ) : seasons.map(s => (
          <div key={s.id} onClick={() => openSeason(s)} style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "14px 16px", marginBottom: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: "white" }}
            onMouseEnter={e => e.currentTarget.style.background = "#f9f9f9"} onMouseLeave={e => e.currentTarget.style.background = "white"}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "#E1F5EE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🗄</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>موسم {s.name}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>أُقفل: {new Date(s.closed_at).toLocaleDateString("ar-EG")} · بواسطة {s.closed_by}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {currentUser.permissions.view_archive && (
                <button onClick={e => { e.stopPropagation(); openDelete(s); }} style={{ background: "#FBEAF0", border: "none", padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "#c0392b" }}>🗑 مسح</button>
              )}
              <span style={{ color: "#ccc", fontSize: 18 }}>›</span>
            </div>
          </div>
        ))}
        <Modal show={showClose} onClose={() => setShowClose(false)} title="🔒 إقفال الموسم" maxWidth={380}>
          {/* مؤشر الخطوات */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {[1, 2, 3].map(s => (
              <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: closeStep >= s ? "#e67e22" : "#eee" }} />
            ))}
          </div>

          {/* الخطوة 1: تحذير */}
          {closeStep === 1 && (
            <>
              <div style={{ background: "#FBEAF0", border: "1px solid #e74c3c", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#c0392b", marginBottom: 8 }}>⚠️ تنبيه مهم — إقفال الموسم</div>
                <div style={{ fontSize: 12, color: "#444", lineHeight: 1.7 }}>
                  أنت على وشك إقفال الموسم الحالي نهائياً.<br /><br />
                  سيتم نقل جميع البيانات (الحجاج، الباصات، المخيمات، الغرف) إلى الأرشيف، ولن تتمكن من التعديل عليها بعد ذلك — للعرض فقط.<br /><br />
                  سيبدأ موسم جديد فارغ تماماً.<br /><br />
                  <span style={{ fontWeight: 700, color: "#c0392b" }}>هذا الإجراء لا يمكن التراجع عنه.</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setCloseStep(2)} style={{ background: "#e67e22", color: "white", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1 }}>فهمت، التالي ←</button>
                <button onClick={() => setShowClose(false)} style={btnS()}>إلغاء</button>
              </div>
            </>
          )}

          {/* الخطوة 2: اسم الموسم الجديد */}
          {closeStep === 2 && (
            <>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>اكتب اسم الموسم الجديد الذي سيبدأ بعد الإقفال:</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>اسم الموسم الجديد</div>
                <input style={inp} value={newSeasonName} onChange={e => setNewSeasonName(e.target.value)} placeholder="مثال: 1449" autoFocus />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { if (!newSeasonName.trim()) { alert("اكتب اسم الموسم الجديد!"); return; } setCloseStep(3); }} style={{ background: "#e67e22", color: "white", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1 }}>التالي ←</button>
                <button onClick={() => setCloseStep(1)} style={btnS()}>→ رجوع</button>
              </div>
            </>
          )}

          {/* الخطوة 3: التأكيد النهائي */}
          {closeStep === 3 && (
            <>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>تأكيد إقفال الموسم</div>
                <div style={{ fontSize: 12, color: "#888", lineHeight: 1.6 }}>سيتم إقفال الموسم الحالي نهائياً<br />وبدء موسم <span style={{ fontWeight: 700, color: "#1D9E75" }}>{newSeasonName}</span></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={closeSeason} disabled={closing} style={{ background: "#c0392b", color: "white", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1, opacity: closing ? 0.6 : 1 }}>{closing ? "⏳ جاري الإقفال..." : "🔒 إقفال الموسم نهائياً"}</button>
                <button onClick={() => setCloseStep(2)} disabled={closing} style={btnS()}>→ رجوع</button>
              </div>
            </>
          )}
        </Modal>
        <Modal show={showDelete} onClose={() => setShowDelete(false)} title="🗑 مسح موسم من الأرشيف" maxWidth={380}>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {[1, 2, 3].map(s => <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: deleteStep >= s ? "#c0392b" : "#eee" }} />)}
          </div>
          {deleteStep === 1 && (
            <>
              <div style={{ background: "#FBEAF0", border: "1px solid #e74c3c", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#c0392b", marginBottom: 8 }}>⚠️ تحذير — مسح موسم من الأرشيف</div>
                <div style={{ fontSize: 12, color: "#444", lineHeight: 1.7 }}>
                  أنت على وشك مسح موسم <span style={{ fontWeight: 700 }}>{seasonToDelete?.name}</span> نهائياً من الأرشيف.<br /><br />
                  سيتم مسح جميع البيانات المرتبطة بهذا الموسم (الحجاج، الباصات، المخيمات، الغرف) بشكل كامل.<br /><br />
                  <span style={{ fontWeight: 700, color: "#c0392b" }}>هذا الإجراء لا يمكن التراجع عنه.</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setDeleteStep(2)} style={{ background: "#c0392b", color: "white", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1 }}>فهمت، التالي ←</button>
                <button onClick={() => setShowDelete(false)} style={btnS()}>إلغاء</button>
              </div>
            </>
          )}
          {deleteStep === 2 && (
            <>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 16, lineHeight: 1.6 }}>هل أنت متأكد 100% إنك عايز تمسح موسم <span style={{ fontWeight: 700, color: "#c0392b" }}>{seasonToDelete?.name}</span> وكل بياناته؟</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setDeleteStep(3)} style={{ background: "#c0392b", color: "white", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1 }}>نعم، متأكد — التالي ←</button>
                <button onClick={() => setDeleteStep(1)} style={btnS()}>→ رجوع</button>
              </div>
            </>
          )}
          {deleteStep === 3 && (
            <>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🗑</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>تأكيد المسح النهائي</div>
                <div style={{ fontSize: 12, color: "#888" }}>سيتم مسح موسم <span style={{ fontWeight: 700, color: "#c0392b" }}>{seasonToDelete?.name}</span> وكل بياناته نهائياً</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={confirmDelete} disabled={deleting} style={{ background: "#c0392b", color: "white", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1, opacity: deleting ? 0.6 : 1 }}>{deleting ? "⏳ جاري المسح..." : "🗑 مسح نهائي"}</button>
                <button onClick={() => setDeleteStep(2)} disabled={deleting} style={btnS()}>→ رجوع</button>
              </div>
            </>
          )}
        </Modal>
      </div>
    );
  }

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={() => setSelected(null)} style={btnS()}>← رجوع</button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>موسم {selected.name}</div>
          <div style={{ fontSize: 11, color: "#888" }}>{data.passengers.length} حاج · للعرض فقط</div>
        </div>
      </div>
      {/* تاب التقارير */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[["passengers", "👥 الحجاج"], ["flight", "✈️ الطيران"], ["buses", "🚌 الباصات"], ["mina", "⛺ منى"], ["arafa", "🏔 عرفة"], ["hotel", "🏨 الفندق"]].map(([id, label]) => (
          <div key={id} onClick={() => setActiveReport(id)} style={{ padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, background: activeReport === id ? "#1D9E75" : "#f5f5f5", color: activeReport === id ? "white" : "#555", fontWeight: activeReport === id ? 500 : 400 }}>{label}</div>
        ))}
      </div>

      {loading ? <div style={{ textAlign: "center", padding: "2rem", color: "#aaa" }}>⏳ جاري التحميل...</div> : (<>

        {activeReport === "passengers" && (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr style={{ background: "#1D9E75", color: "white" }}>{["م", "الاسم", "رقم الجواز", "الجنسية", "الجنس"].map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{data.passengers.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{i + 1}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee", fontWeight: 500 }}>{p.name_ar}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.passport}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.nat}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.gender}</td></tr>)}</tbody>
            </table>
            <button onClick={printPassengers} style={{ ...btnS(), width: "100%", marginTop: 12 }}>🖨️ طباعة</button>
          </>
        )}

        {activeReport === "flight" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, direction: "ltr" }}>
            <thead><tr style={{ background: "#1D9E75", color: "white" }}>{["S.N.", "FULL NAME", "NAT.", "PASSPORT NO.", "GENDER"].map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>{data.passengers.filter(p => p.services?.flight !== "بدون").map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{i + 1}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee", fontWeight: 500 }}>{p.name_en}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.nat}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.passport}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.gender === "ذكر" ? "MR." : "MRS."}</td></tr>)}</tbody>
          </table>
        )}

        {activeReport === "buses" && data.buses.map(bus => {
          const bp = getBusPassengers(bus.id);
          return (
            <div key={bus.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "#f9f9f9", fontSize: 13, fontWeight: 500 }}>🚌 {bus.name} ({bus.type}) · {bp.length} مسافر</div>
              {bp.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead><tr style={{ background: "#1D9E75", color: "white" }}><th style={{ padding: "5px 10px" }}>م</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الجنسية</th></tr></thead><tbody>{bp.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}><td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center" }}>{i + 1}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.nat}</td></tr>)}</tbody></table>}
            </div>
          );
        })}

        {(activeReport === "mina" || activeReport === "arafa") && data.camps.filter(c => c.page_type === (activeReport === "mina" ? "منى" : "عرفة")).map(camp => {
          const key = activeReport === "mina" ? "camp_mina_id" : "camp_arafa_id";
          const cp = getCampPassengers(camp.id, key);
          return (
            <div key={camp.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "#f9f9f9", fontSize: 13, fontWeight: 500 }}>{activeReport === "mina" ? "⛺" : "🏔"} مخيم {camp.name} — {camp.gender === "ذكر" ? "رجال" : "نساء"} · {cp.length} مسافر</div>
              {cp.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead><tr style={{ background: camp.gender === "ذكر" ? "#0C447C" : "#72243E", color: "white" }}><th style={{ padding: "5px 10px" }}>م</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th></tr></thead><tbody>{cp.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}><td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center" }}>{i + 1}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td></tr>)}</tbody></table>}
            </div>
          );
        })}

        {activeReport === "hotel" && data.rooms.map(room => {
          const rp = getRoomPassengers(room.id);
          return (
            <div key={room.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "#f9f9f9", fontSize: 13, fontWeight: 500 }}>🛏 غرفة {room.number} {room.floor && `(ط${room.floor})`} · {room.type} · {rp.length} مسافر</div>
              {rp.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead><tr style={{ background: "#1D9E75", color: "white" }}><th style={{ padding: "5px 10px" }}>م</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الجنس</th></tr></thead><tbody>{rp.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}><td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center" }}>{i + 1}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.gender}</td></tr>)}</tbody></table>}
            </div>
          );
        })}

      </>)}
    </div>
  );
}


function ReportsPage({ passengers }: { passengers: Passenger[] }) {
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);

  // الأعمدة لتقرير الحجاج
  const ALL_COLS = [
    { key: "name_ar", label: "الاسم بالعربي", get: (p: Passenger) => p.name_ar },
    { key: "name_en", label: "الاسم بالإنجليزي", get: (p: Passenger) => p.name_en },
    { key: "passport", label: "رقم الجواز", get: (p: Passenger) => p.passport },
    { key: "national_id", label: "رقم البطاقة", get: (p: Passenger) => p.national_id },
    { key: "nat", label: "الجنسية", get: (p: Passenger) => p.nat },
    { key: "gender", label: "الجنس", get: (p: Passenger) => p.gender },
    { key: "dob", label: "تاريخ الميلاد", get: (p: Passenger) => p.dob },
    { key: "expiry", label: "انتهاء الجواز", get: (p: Passenger) => p.expiry },
    { key: "phone", label: "التليفون", get: (p: Passenger) => p.phone },
    { key: "bus", label: "الباص", get: (p: Passenger) => p.services?.bus },
    { key: "flight", label: "الطيران", get: (p: Passenger) => p.services?.flight },
    { key: "hotel_type", label: "نوع الغرفة", get: (p: Passenger) => p.services?.hotel_type },
    { key: "hotel_view", label: "إطلالة الغرفة", get: (p: Passenger) => p.services?.hotel_view },
    { key: "camp_mina", label: "منى", get: (p: Passenger) => p.services?.camp_mina },
    { key: "camp_arafa", label: "عرفة", get: (p: Passenger) => p.services?.camp_arafa },
  ];
  const [selectedCols, setSelectedCols] = useState<string[]>(ALL_COLS.map(c => c.key));
  const toggleCol = (key: string) => setSelectedCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  const toggleAll = () => setSelectedCols(prev => prev.length === ALL_COLS.length ? [] : ALL_COLS.map(c => c.key));
  const activeCols = ALL_COLS.filter(c => selectedCols.includes(c.key));

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: b }, { data: c }, { data: r }] = await Promise.all([
        supabase.from("buses").select("*").order("created_at"),
        supabase.from("camps").select("*").order("created_at"),
        supabase.from("rooms").select("*").order("number"),
      ]);
      if (b) setBuses(b as Bus[]);
      if (c) setCamps(c as Camp[]);
      if (r) setRooms(r as Room[]);
      setLoading(false);
    };
    load();
  }, []);

  // ===== دوال التصدير =====
  const exportPassengersXLSX = () => {
    const headers = ["م", ...activeCols.map(c => c.label)];
    const rows = passengers.map((p, i) => [i + 1, ...activeCols.map(c => c.get(p) || "")]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 4 }, ...activeCols.map(c => ({ wch: Math.max(c.label.length + 2, 15) }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحجاج");
    XLSX.writeFile(wb, "تقرير_الحجاج.xlsx");
  };

  const printPassengersPDF = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>تقرير الحجاج</title><style>@page{size:A4 landscape;margin:8mm}body{font-family:Arial;direction:rtl;font-size:9px}h2{text-align:center;margin-bottom:8px}table{width:100%;border-collapse:collapse}th,td{border:0.5px solid #ccc;padding:4px 6px;text-align:right;white-space:nowrap}th{background:#1D9E75;color:white}tr{page-break-inside:avoid}tr:nth-child(even){background:#f9f9f9}</style></head><body><h2>تقرير الحجاج</h2><table><tr><th>م</th>${activeCols.map(c => `<th>${c.label}</th>`).join("")}</tr>${passengers.map((p, i) => `<tr><td style="text-align:center">${i + 1}</td>${activeCols.map(c => `<td>${c.get(p) || "—"}</td>`).join("")}</tr>`).join("")}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };

  const exportFlightXLSX = () => {
    const flightPassengers = passengers.filter(p => p.services?.flight !== "بدون");
    const headers = ["S.N.", "FULL NAME", "NATIONALITY", "PASSPORT NO.", "TELEPHONE", "GENDER", "NOTE"];
    const rows = flightPassengers.map((p, i) => [
      i + 1, p.name_en, p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat,
      p.passport, p.phone || "—", p.gender === "ذكر" ? "MR." : "MRS.",
      p.services?.flight === "درجة أولى" ? "First Class" : ""
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 5 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 8 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Flight List");
    XLSX.writeFile(wb, "flight_list.xlsx");
  };

  const printFlightPDF = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>Flight List</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial;direction:ltr;font-size:10px}h1{text-align:center;margin-bottom:12px}table{width:100%;border-collapse:collapse}th{background:#1D9E75;color:white;padding:8px 10px;text-align:left;white-space:nowrap}td{border:1px solid #ddd;padding:7px 10px;text-align:left;white-space:nowrap}tr:nth-child(even){background:#f9f9f9}</style></head><body><h1>Pilgrims Flight List</h1><table><tr><th>S.N.</th><th>FULL NAME</th><th>NATIONALITY</th><th>PASSPORT NO.</th><th>TELEPHONE</th><th>GENDER</th><th>NOTE</th></tr>${passengers.filter(p => p.services?.flight !== "بدون").map((p, i) => `<tr><td>${i + 1}</td><td>${p.name_en}</td><td>${p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat}</td><td>${p.passport}</td><td>${p.phone || "—"}</td><td>${p.gender === "ذكر" ? "MR." : "MRS."}</td><td>${p.services?.flight === "درجة أولى" ? "First Class" : ""}</td></tr>`).join("")}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };

  const exportBusesXLSX = () => {
    const rows: any[][] = [["اسم الباص", "النوع", "م", "اسم الحاج", "الجنس", "الجنسية"]];
    buses.forEach(bus => {
      const bp = passengers.filter(p => p.bus_id === bus.id);
      bp.forEach((p, i) => rows.push([bus.name, bus.type, i + 1, p.short_ar || p.name_ar, p.gender, p.nat]));
      if (bp.length === 0) rows.push([bus.name, bus.type, "", "لا يوجد مسافرون", "", ""]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 15 }, { wch: 8 }, { wch: 4 }, { wch: 25 }, { wch: 8 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الباصات");
    XLSX.writeFile(wb, "تقرير_الباصات.xlsx");
  };

  const printBusesPDF = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>تقرير الباصات</title><style>body{font-family:Arial;direction:rtl;padding:16px;font-size:10px}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin-bottom:16px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:right}th{background:#1D9E75;color:white}tr:nth-child(even){background:#f9f9f9}.bus{page-break-after:always}</style></head><body><h1>🚌 تقرير الباصات</h1>${buses.map(bus => { const bp = passengers.filter(p => p.bus_id === bus.id); return `<div class="bus"><h2>${bus.name} (${bus.type})</h2><table><tr><th>م</th><th>الاسم</th><th>الجنس</th><th>الجنسية</th></tr>${bp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar || p.name_ar}</td><td>${p.gender}</td><td>${p.nat}</td></tr>`).join("")}</table></div>`; }).join("")}<script>window.print();</script></body></html>`);
    w.document.close();
  };

  const exportCampsXLSX = (pageType: "منى" | "عرفة") => {
    const campIdKey = pageType === "منى" ? "camp_mina_id" : "camp_arafa_id";
    const pageCamps = camps.filter(c => c.page_type === pageType);
    const rows: any[][] = [["المخيم", "النوع", "الجنس", "م", "اسم الحاج", "الجنسية"]];
    pageCamps.forEach(camp => {
      const cp = passengers.filter(p => (p as any)[campIdKey] === camp.id);
      cp.forEach((p, i) => rows.push([camp.name, camp.type, camp.gender === "ذكر" ? "رجال" : "نساء", i + 1, p.short_ar || p.name_ar, p.nat]));
      if (cp.length === 0) rows.push([camp.name, camp.type, camp.gender === "ذكر" ? "رجال" : "نساء", "", "لا يوجد مسافرون", ""]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `مخيمات ${pageType}`);
    XLSX.writeFile(wb, `تقرير_مخيمات_${pageType}.xlsx`);
  };

  const printCampsPDF = (pageType: "منى" | "عرفة") => {
    const campIdKey = pageType === "منى" ? "camp_mina_id" : "camp_arafa_id";
    const icon = pageType === "منى" ? "⛺" : "🏔";
    const pageCamps = camps.filter(c => c.page_type === pageType);
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>مخيمات ${pageType}</title><style>body{font-family:Arial;direction:rtl;padding:16px;font-size:10px}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin-bottom:16px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:right}th.m{background:#0C447C;color:white}th.f{background:#72243E;color:white}tr:nth-child(even){background:#f9f9f9}.camp{page-break-after:always}</style></head><body><h1>${icon} مخيمات ${pageType}</h1>${pageCamps.map(camp => { const cp = passengers.filter(p => (p as any)[campIdKey] === camp.id); const isMale = camp.gender === "ذكر"; return `<div class="camp"><h2>مخيم ${camp.name} — ${isMale ? "رجال" : "نساء"} (${camp.type})</h2><table><tr><th class="${isMale ? "m" : "f"}">م</th><th class="${isMale ? "m" : "f"}">الاسم</th><th class="${isMale ? "m" : "f"}">الجنسية</th></tr>${cp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar || p.name_ar}</td><td>${p.nat}</td></tr>`).join("")}</table></div>`; }).join("")}<script>window.print();</script></body></html>`);
    w.document.close();
  };

  const exportHotelXLSX = () => {
    const rows: any[][] = [["رقم الغرفة", "الطابق", "النوع", "م", "اسم الحاج", "الجنس", "طلب الحاج"]];
    rooms.forEach(room => {
      const rp = passengers.filter(p => p.room_id === room.id);
      rp.forEach((p, i) => rows.push([room.number, room.floor || "—", room.type, i + 1, p.short_ar || p.name_ar, p.gender, p.services?.hotel_type, p.services?.hotel_view]));
      if (rp.length === 0) rows.push([room.number, room.floor || "—", room.type, "", "لا يوجد مسافرون", "", ""]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الفندق");
    XLSX.writeFile(wb, "تقرير_الفندق.xlsx");
  };

  const printHotelPDF = () => {
    const w = window.open("", "_blank"); if (!w) return;
    const half = Math.ceil(rooms.length / 2);
    const left = rooms.slice(0, half), right = rooms.slice(half);
    const renderRoom = (room: Room) => {
      const rp = passengers.filter(p => p.room_id === room.id);
      const [bg] = ROOM_COLORS[room.type] || ["#f5f5f5"];
      return `<div style="margin-bottom:10px"><div style="background:${bg};padding:4px 8px;border:1px solid #ddd;border-bottom:none;font-size:10px;font-weight:bold;display:flex;justify-content:space-between"><span>${room.type}</span><span>${room.number}${room.floor ? ` (ط${room.floor})` : ""}</span></div><table style="width:100%;border-collapse:collapse;font-size:9px"><tr style="background:#f5f5f5"><th style="padding:3px 6px;border:1px solid #ddd;text-align:center;width:20px">م</th><th style="padding:3px 6px;border:1px solid #ddd;text-align:right">الاسم</th></tr>${rp.map((p, i) => `<tr><td style="padding:3px 6px;border:1px solid #ddd;text-align:center">${i + 1}</td><td style="padding:3px 6px;border:1px solid #ddd">${p.short_ar || p.name_ar}</td></tr>`).join("")}</table></div>`;
    };
    w.document.write(`<html><head><title>تقرير الفندق</title><style>body{font-family:Arial;direction:rtl;padding:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}h1{text-align:center}</style></head><body><h1>🏨 تقرير الفندق</h1><div class="grid"><div>${left.map(renderRoom).join("")}</div><div>${right.map(renderRoom).join("")}</div></div><script>window.print();</script></body></html>`);
    w.document.close();
  };

  const reports = [
    { id: "passengers_report", name: "تقرير الحجاج", icon: "👥", desc: "كشف بيانات الحجاج", color: "#E1F5EE" },
    { id: "flight", name: "تقرير الطيران", icon: "✈️", desc: "كشف الحجاج (التذاكر)", color: "#E6F1FB" },
    { id: "buses", name: "تقرير الباصات", icon: "🚌", desc: "توزيع المسافرين", color: "#EEEDFE" },
    { id: "mina", name: "تقرير منى", icon: "⛺", desc: "مخيمات منى", color: "#E1F5EE" },
    { id: "arafa", name: "تقرير عرفة", icon: "🏔", desc: "مخيمات عرفة", color: "#FAEEDA" },
    { id: "hotel", name: "تقرير الفندق", icon: "🏨", desc: "توزيع الغرف", color: "#FBEAF0" },
  ];

  const ExportButtons = ({ onExcel, onPrint }: { onExcel: () => void; onPrint: () => void }) => (
    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
      <button onClick={onExcel} style={{ ...btnP(), flex: 1 }}>⬇️ تحميل Excel</button>
      <button onClick={onPrint} style={{ ...btnS({ flex: 1 }) }}>🖨️ طباعة PDF</button>
    </div>
  );

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      {!activeReport ? (
        <>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>اختر التقرير</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {reports.map(r => (
              <div key={r.id} onClick={() => setActiveReport(r.id)} style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, background: "white" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f9f9f9"} onMouseLeave={e => e.currentTarget.style.background = "white"}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: r.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{r.icon}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{r.desc}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "#E1F5EE", color: "#085041" }}>Excel</span>
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

          {/* تقرير الحجاج */}
          {activeReport === "passengers_report" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>👥 تقرير الحجاج</div>
              <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>اختر الأعمدة</div>
                  <div onClick={toggleAll} style={{ fontSize: 11, color: "#1D9E75", cursor: "pointer" }}>{selectedCols.length === ALL_COLS.length ? "إلغاء الكل" : "تحديد الكل"}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {ALL_COLS.map(col => (
                    <div key={col.key} onClick={() => toggleCol(col.key)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, cursor: "pointer", background: selectedCols.includes(col.key) ? "#E1F5EE" : "#f9f9f9", border: `0.5px solid ${selectedCols.includes(col.key) ? "#5DCAA5" : "#e5e5e5"}` }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, background: selectedCols.includes(col.key) ? "#1D9E75" : "white", border: `1.5px solid ${selectedCols.includes(col.key) ? "#1D9E75" : "#ccc"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {selectedCols.includes(col.key) && <span style={{ color: "white", fontSize: 10 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 11 }}>{col.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>{passengers.length} حاج · {activeCols.length} عمود</div>
              <ExportButtons onExcel={exportPassengersXLSX} onPrint={printPassengersPDF} />
            </>
          )}

          {/* تقرير الطيران */}
          {activeReport === "flight" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>✈️ تقرير الطيران</div>
              <div style={{ overflowX: "auto", marginBottom: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, direction: "ltr" }}>
                  <thead><tr style={{ background: "#1D9E75", color: "white" }}>{["S.N.", "FULL NAME", "NATIONALITY", "PASSPORT NO.", "TELEPHONE", "GENDER", "NOTE"].map(h => <th key={h} style={{ padding: "8px 10px", border: "0.5px solid #17836", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                  <tbody>{passengers.filter(p => p.services?.flight !== "بدون").map((p, i) => (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#f9f9f9" }}>
                      <td style={{ padding: "6px 10px", border: "1px solid #eee" }}>{i + 1}</td>
                      <td style={{ padding: "6px 10px", border: "1px solid #eee", fontWeight: 500, whiteSpace: "nowrap" }}>{p.name_en}</td>
                      <td style={{ padding: "6px 10px", border: "1px solid #eee" }}>{p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat}</td>
                      <td style={{ padding: "6px 10px", border: "1px solid #eee" }}>{p.passport}</td>
                      <td style={{ padding: "6px 10px", border: "1px solid #eee" }}>{p.phone || "—"}</td>
                      <td style={{ padding: "6px 10px", border: "1px solid #eee" }}>{p.gender === "ذكر" ? "MR." : "MRS."}</td>
                      <td style={{ padding: "6px 10px", border: "1px solid #eee" }}>{p.services?.flight === "درجة أولى" ? "⭐ First Class" : ""}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <ExportButtons onExcel={exportFlightXLSX} onPrint={printFlightPDF} />
            </>
          )}

          {/* تقرير الباصات */}
          {activeReport === "buses" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>🚌 تقرير الباصات</div>
              {loading ? <div style={{ textAlign: "center", color: "#aaa" }}>⏳ جاري التحميل...</div> : buses.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "#aaa" }}>لا يوجد باصات — أضف من صفحة الباصات</div>
              ) : (
                <>
                  {buses.map(bus => {
                    const bp = passengers.filter(p => p.bus_id === bus.id);
                    return (
                      <div key={bus.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div style={{ padding: "8px 12px", background: bus.type === "VIP" ? "#FFFBEA" : "#f9f9f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>🚌 {bus.name} <span style={{ fontSize: 10, color: "#888" }}>({bus.type}) · {bp.length} مسافر</span></div>
                        </div>
                        {bp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: "#1D9E75", color: "white" }}><th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الجنس</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الجنسية</th></tr></thead>
                            <tbody>{bp.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}><td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center", color: "#888" }}>{i + 1}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.gender}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.nat}</td></tr>)}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons onExcel={exportBusesXLSX} onPrint={printBusesPDF} />
                </>
              )}
            </>
          )}

          {/* تقرير منى */}
          {activeReport === "mina" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>⛺ تقرير مخيمات منى</div>
              {loading ? <div style={{ textAlign: "center", color: "#aaa" }}>⏳ جاري التحميل...</div> : camps.filter(c => c.page_type === "منى").length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "#aaa" }}>لا يوجد مخيمات — أضف من صفحة منى</div>
              ) : (
                <>
                  {camps.filter(c => c.page_type === "منى").map(camp => {
                    const cp = passengers.filter(p => p.camp_mina_id === camp.id);
                    const isMale = camp.gender === "ذكر";
                    return (
                      <div key={camp.id} style={{ border: `0.5px solid ${camp.type === "خاص" ? "#F5C842" : "#e5e5e5"}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div style={{ padding: "8px 12px", background: camp.type === "خاص" ? "#FFFBEA" : "#f9f9f9", display: "flex", justifyContent: "space-between" }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>⛺ مخيم {camp.name} <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isMale ? "#E6F1FB" : "#FBEAF0", color: isMale ? "#0C447C" : "#72243E" }}>{isMale ? "رجال" : "نساء"}</span> <span style={{ fontSize: 10, color: "#888" }}>({camp.type}) · {cp.length} مسافر</span></div>
                        </div>
                        {cp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: isMale ? "#0C447C" : "#72243E", color: "white" }}><th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الجنسية</th></tr></thead>
                            <tbody>{cp.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}><td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center", color: "#888" }}>{i + 1}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.nat}</td></tr>)}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons onExcel={() => exportCampsXLSX("منى")} onPrint={() => printCampsPDF("منى")} />
                </>
              )}
            </>
          )}

          {/* تقرير عرفة */}
          {activeReport === "arafa" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>🏔 تقرير مخيمات عرفة</div>
              {loading ? <div style={{ textAlign: "center", color: "#aaa" }}>⏳ جاري التحميل...</div> : camps.filter(c => c.page_type === "عرفة").length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "#aaa" }}>لا يوجد مخيمات — أضف من صفحة عرفة</div>
              ) : (
                <>
                  {camps.filter(c => c.page_type === "عرفة").map(camp => {
                    const cp = passengers.filter(p => p.camp_arafa_id === camp.id);
                    const isMale = camp.gender === "ذكر";
                    return (
                      <div key={camp.id} style={{ border: `0.5px solid ${camp.type === "خاص" ? "#F5C842" : "#e5e5e5"}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div style={{ padding: "8px 12px", background: camp.type === "خاص" ? "#FFFBEA" : "#f9f9f9", display: "flex", justifyContent: "space-between" }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>🏔 مخيم {camp.name} <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isMale ? "#E6F1FB" : "#FBEAF0", color: isMale ? "#0C447C" : "#72243E" }}>{isMale ? "رجال" : "نساء"}</span> <span style={{ fontSize: 10, color: "#888" }}>({camp.type}) · {cp.length} مسافر</span></div>
                        </div>
                        {cp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: isMale ? "#0C447C" : "#72243E", color: "white" }}><th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الجنسية</th></tr></thead>
                            <tbody>{cp.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}><td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center", color: "#888" }}>{i + 1}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.nat}</td></tr>)}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons onExcel={() => exportCampsXLSX("عرفة")} onPrint={() => printCampsPDF("عرفة")} />
                </>
              )}
            </>
          )}

          {/* تقرير الفندق */}
          {activeReport === "hotel" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>🏨 تقرير الفندق</div>
              {loading ? <div style={{ textAlign: "center", color: "#aaa" }}>⏳ جاري التحميل...</div> : rooms.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "#aaa" }}>لا يوجد غرف — أضف من صفحة الفندق</div>
              ) : (
                <>
                  {rooms.map(room => {
                    const rp = passengers.filter(p => p.room_id === room.id);
                    const [typeBg, typeClr] = ROOM_COLORS[room.type] || ["#f5f5f5", "#333"];
                    return (
                      <div key={room.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div style={{ padding: "7px 12px", background: "#f9f9f9", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: typeBg, color: typeClr }}>{room.type}</span>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>غرفة {room.number} {room.floor && <span style={{ fontSize: 10, color: "#888" }}>ط{room.floor}</span>}</div>
                          <div style={{ fontSize: 11, color: "#888", marginRight: "auto" }}>{rp.length} مسافر</div>
                        </div>
                        {rp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: "#1D9E75", color: "white" }}><th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الجنس</th><th style={{ padding: "5px 10px", textAlign: "right" }}>طلب</th></tr></thead>
                            <tbody>{rp.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}><td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center", color: "#888" }}>{i + 1}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.gender}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.services?.hotel_type} {p.services?.hotel_view}</td></tr>)}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons onExcel={exportHotelXLSX} onPrint={printHotelPDF} />
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}


export default function App() {
  const config = useConfig();
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try { const s = sessionStorage.getItem("hajj_user"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [page, setPage] = useState(() => sessionStorage.getItem("hajj_page") || "dash");

  useEffect(() => { sessionStorage.setItem("hajj_page", page); }, [page]);
  const [passengers, setPassengers] = useState<Passenger[]>([]);

  const handleLogin = (user: User) => {
    const { password: _, ...userWithoutPassword } = user;
    sessionStorage.setItem("hajj_user", JSON.stringify(userWithoutPassword));
    setCurrentUser(user);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("hajj_user");
    sessionStorage.removeItem("hajj_page");
    setCurrentUser(null);
    setPage("dash");
  };

  const mapPassenger = (p: any) => ({
    id: p.id, name_ar: p.name_ar || "", name_en: p.name_en || "",
    short_ar: p.short_ar || "", short_en: p.short_en || "",
    passport: p.passport || "", national_id: p.national_id || "",
    nat: p.nat || "", dob: p.dob || "", expiry: p.expiry || "",
    gender: p.gender || "", phone: p.phone || "",
    services: { bus: p.bus || "عادي", flight: p.flight || "عادي", hotel_type: p.hotel_type || "ثنائية", hotel_view: p.hotel_view || "مطلة", camp_mina: p.camp_mina || "عادي", camp_arafa: p.camp_arafa || "عادي" },
    rel: "", linked: -1,
    photo_url: p.photo_url || "", id_expiry: p.id_expiry || "",
    national_id_url: p.national_id_url || "", contract_url: p.contract_url || "",
    passport_url: p.passport_url || "",
    bus_id: p.bus_id || null, camp_mina_id: p.camp_mina_id || null,
    camp_arafa_id: p.camp_arafa_id || null, room_id: p.room_id || null,
    family_id: p.family_id || null,
    flight_id: p.flight_id || null, flight_class: p.flight_class || null
  });

  useEffect(() => {
    const loadPassengers = async () => {
      const { data, error } = await supabase.from("passengers").select("*").order("created_at", { ascending: false });
      if (!error && data) setPassengers(data.map(mapPassenger) as any);
    };
    loadPassengers();

    // Realtime — يتحدّث تلقائياً على كل الأجهزة
    const channel = supabase.channel("passengers-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "passengers" }, (payload: any) => {
        if (payload.eventType === "INSERT") {
          setPassengers(prev => {
            if ((prev as any[]).some((p: any) => p.id === payload.new.id)) return prev;
            return [mapPassenger(payload.new), ...(prev as any[])];
          });
        } else if (payload.eventType === "UPDATE") {
          setPassengers(prev => (prev as any[]).map((p: any) => p.id === payload.new.id ? mapPassenger(payload.new) : p) as any);
        } else if (payload.eventType === "DELETE") {
          setPassengers(prev => (prev as any[]).filter((p: any) => p.id !== payload.old.id) as any);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (!currentUser) return <LoginPage onLogin={handleLogin} />;
  const pageTitles: Record<string, string> = { dash: "الرئيسية", scan: "رفع وثيقة", passengers: "الحجاج", buses: "الباصات", flights: "الطيران", mina: "مخيمات منى", arafa: "مخيمات عرفة", hotel: "الفندق", reports: "التقارير", archive: "الأرشيف", users: "المستخدمين" };
  const renderPage = () => {
    switch (page) {
      case "dash": return <Dashboard passengers={passengers} setPage={setPage} />;
      case "scan": return <ScanPage passengers={passengers} setPassengers={setPassengers} />;
      case "passengers": case "manual": return <PassengersPage passengers={passengers} setPassengers={setPassengers} initialShowManual={page === "manual"} />;
      case "buses": return <BusesPage passengers={passengers} setPassengers={setPassengers} />;
      case "flights": return <FlightsPage passengers={passengers} setPassengers={setPassengers} />;
      case "mina": return <CampsPage pageType="منى" passengers={passengers} setPassengers={setPassengers} />;
      case "arafa": return <CampsPage pageType="عرفة" passengers={passengers} setPassengers={setPassengers} />;
      case "hotel": return <HotelPage passengers={passengers} setPassengers={setPassengers} />;
      case "reports": return <ReportsPage passengers={passengers} />;
      case "archive": return <ArchivePage currentUser={currentUser} />;
      case "users": return <UsersPage currentUser={currentUser} />;
      default: return <Dashboard passengers={passengers} setPage={setPage} />;
    }
  };
  return (
    <div style={{ display: "flex", height: "100vh", direction: "rtl", fontFamily: "system-ui,-apple-system,sans-serif", background: "white", overflow: "hidden" }}>
      <Sidebar page={page} setPage={setPage} count={passengers.length} currentUser={currentUser} onLogout={handleLogout} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", borderBottom: "0.5px solid #e5e5e5", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{pageTitles[page]}</div>
          <div style={{ fontSize: 11, color: "#888" }}>{config.tagline}</div>
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>{renderPage()}</div>
      </div>
    </div>
  );
}
