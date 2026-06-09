import { useState, useRef, useEffect, useMemo } from "react";
import type React from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";
import { useConfig } from "./config/ConfigContext";
import { ThemeSwitcher } from "./config/ThemeContext";
import type { Passenger, User, Bus, Camp, Room, Flight } from "./types";
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
    const isPng = file.type === "image/png";
    const outputType = isPng ? "image/png" : "image/jpeg";
    const outputQuality = isPng ? 1 : 0.8;
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
      if (ctx && !isPng) {
        // للـ JPEG نرسم خلفية بيضاء عشان نتجنب الأسود
        ctx.fillStyle = "var(--text-inverse)";
        ctx.fillRect(0, 0, width, height);
      }
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob(b => resolve(b || file), outputType, outputQuality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

async function uploadDoc(file: File, passengerId: number, docType: string): Promise<string | null> {
  const compressed = await compressImage(file);
  const isPng = file.type === "image/png";
  const ext = file.type === "application/pdf" ? "pdf" : isPng ? "png" : "jpg";
  const contentType = file.type === "application/pdf" ? "application/pdf" : isPng ? "image/png" : "image/jpeg";
  const path = `${passengerId}/${docType}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("passengers-docs").upload(path, compressed, { upsert: true, contentType });
  if (error) { console.error("upload error", error); return null; }
  const { data } = supabase.storage.from("passengers-docs").getPublicUrl(path);
  return data?.publicUrl || null;
}

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
const ROOM_COLORS: Record<string, [string, string]> = { "ثنائية": ["var(--male-bg)", "var(--info)"], "ثلاثية": ["var(--warning-bg)", "var(--warning)"], "رباعية": ["var(--success-bg)", "var(--primary-dark)"], "سويت": ["var(--info-bg)", "var(--info)"] };

const NAV = [
  { section: "الرئيسية", items: [{ id: "dash", label: "الرئيسية", perm: "" }] },
  { section: "التنظيم", items: [{ id: "passengers", label: "الحجاج", perm: "view_passengers" }, { id: "buses", label: "الباصات", perm: "manage_buses" }, { id: "flights", label: "الطيران", perm: "manage_flights" }, { id: "mina", label: "مخيمات منى", perm: "manage_camps" }, { id: "arafa", label: "مخيمات عرفة", perm: "manage_camps" }, { id: "hotel", label: "الفندق", perm: "manage_hotel" }] },
  { section: "التقارير", items: [{ id: "reports", label: "التقارير", perm: "view_reports" }] },
  { section: "الأرشيف", items: [{ id: "archive", label: "الأرشيف", perm: "view_archive" }] },
  { section: "الإعدادات", items: [{ id: "users", label: "المستخدمين", perm: "manage_users" }] },
];





function Avatar({ gender, size = 32 }: { name?: string; gender: string; size?: number }) {
  const f = gender === "أنثى";
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" style={{ borderRadius: "50%", flexShrink: 0, overflow: "hidden" }}>
      <use href={f ? "#avf" : "#avm"} />
    </svg>
  );
}

function Modal({ show, onClose, title, children, maxWidth = 420 }: { show: boolean; onClose: () => void; title: string; children: React.ReactNode; maxWidth?: number; }) {
  if (!show) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg-card)", borderRadius: "var(--radius-lg)", width: "92%", maxWidth, maxHeight: "88%", overflowY: "auto", boxShadow: "var(--shadow-xl)", border: "0.5px solid var(--border)" }}>
        <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "var(--bg-card)", zIndex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>✕</button>
        </div>
        <div style={{ padding: "14px 16px" }}>{children}</div>
      </div>
    </div>
  );
}

const inp = { fontSize: 12, background: "var(--bg-input)", border: "0.5px solid var(--border)", borderRadius: "var(--radius-md)", padding: "7px 10px", width: "100%", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" as const, color: "var(--text)" };
const btnP = (extra?: any) => ({ background: "var(--primary)", color: "var(--text-inverse)", border: "none", padding: "7px 14px", borderRadius: "var(--radius-md)", fontSize: 12, cursor: "pointer", fontWeight: 500, fontFamily: "var(--font-body)", transition: "var(--transition)", ...extra });
const btnS = (extra?: any) => ({ background: "transparent", border: "0.5px solid var(--border)", padding: "7px 12px", borderRadius: "var(--radius-md)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)", fontFamily: "var(--font-body)", transition: "var(--transition)", ...extra });

function Sidebar({ page, setPage, count, currentUser, onLogout }: { page: string; setPage: (p: string) => void; count: number; currentUser: User; onLogout: () => void; }) {
  const config = useConfig();
  const [showThemes, setShowThemes] = useState(false);

  const NAV_ICONS: Record<string, string> = {
    dash: `<path d="M3 11l9-8 9 8M5 10v10h14V10"/>`,
    passengers: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    buses: `<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>`,
    flights: `<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>`,
    mina: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>`,
    arafa: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>`,
    hotel: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>`,
    reports: `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>`,
    archive: `<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>`,
    users: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    scan: `<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>`,
  };

  return (
    <div style={{ width: "var(--sidebar-width)", background: "var(--bg-sidebar)", borderLeft: "0.5px solid var(--border-sidebar)", display: "flex", flexDirection: "column", flexShrink: 0, height: "100%", overflow: "hidden", position: "relative" }}>
      {/* نمط النجمة الثمانية */}
      <div className="sidebar-pattern" />

      {/* الهيدر */}
      <div style={{ position: "relative", zIndex: 2, padding: "22px 20px 18px", borderBottom: "1px solid var(--border-sidebar)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <svg width="40" height="40" viewBox="0 0 44 44" fill="none" stroke="var(--accent)" strokeWidth="1.6" style={{ flexShrink: 0 }}>
            <path d="M22 3 L26.5 8.5 L33.5 8 L33 15 L38.5 19.5 L33 24 L33.5 31 L26.5 30.5 L22 36 L17.5 30.5 L10.5 31 L11 24 L5.5 19.5 L11 15 L10.5 8 L17.5 8.5 Z"/>
            <circle cx="22" cy="19.5" r="4.5" fill="var(--accent)" stroke="none"/>
          </svg>
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 600, fontSize: 19, color: "var(--text-inverse)", lineHeight: 1.2 }}>
              {config.logo_url ? <img src={config.logo_url} alt={config.name_ar} style={{ height: 32 }} /> : config.name_ar}
            </div>
            <div style={{ fontSize: 11, color: "var(--accent-light)", letterSpacing: "1px", marginTop: 2 }}>{config.tagline}</div>
          </div>
        </div>
      </div>

      {/* القائمة */}
      <div style={{ position: "relative", zIndex: 2, flex: 1, overflowY: "auto", padding: "10px 12px" }}>
        {NAV.map(({ section, items }) => {
          const allowed = items.filter(it => !it.perm || currentUser.permissions?.[it.perm]);
          if (allowed.length === 0) return null;
          return (
            <div key={section}>
              <div style={{ fontSize: 11, color: "var(--text-sidebar-muted)", padding: "14px 10px 6px", letterSpacing: "0.08em" }}>{section}</div>
              {allowed.map(({ id, label }) => (
                <div key={id} onClick={() => setPage(id)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: "var(--radius-md)", fontSize: 14, fontWeight: 500, color: page === id ? "var(--text-inverse)" : "var(--text-sidebar)", cursor: "pointer", marginBottom: 2, position: "relative", background: page === id ? "linear-gradient(90deg,rgba(200,162,75,0.22),rgba(200,162,75,0.05))" : "transparent", transition: "var(--transition)" }}>
                  {page === id && <div style={{ position: "absolute", insetInlineStart: 0, top: "18%", bottom: "18%", width: 3, borderRadius: 99, background: "var(--accent)" }} />}
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={page === id ? "var(--accent-light)" : "var(--text-sidebar)"} strokeWidth="1.7" style={{ flexShrink: 0, opacity: page === id ? 1 : 0.85 }} dangerouslySetInnerHTML={{ __html: NAV_ICONS[id] || NAV_ICONS.dash }} />
                  {label}
                  {id === "passengers" && count > 0 && (
                    <span style={{ marginInlineStart: "auto", background: "rgba(212,172,79,0.2)", color: "var(--accent-light)", fontSize: 11, fontWeight: 700, padding: "1px 9px", borderRadius: 99 }}>{count}</span>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {/* مفتاح الثيمات */}
        <div style={{ borderTop: "1px solid var(--border-sidebar)", marginTop: 8 }}>
          <div onClick={() => setShowThemes(!showThemes)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: "var(--radius-md)", fontSize: 14, color: "var(--text-sidebar-muted)", cursor: "pointer", transition: "var(--transition)", marginTop: 4 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18"/><path d="M3 12h18"/></svg>
            المظهر
            <span style={{ marginInlineStart: "auto", fontSize: 10 }}>{showThemes ? "▲" : "▼"}</span>
          </div>
          {showThemes && <ThemeSwitcher />}
        </div>
      </div>

      {/* الفوتر */}
      <div style={{ position: "relative", zIndex: 2, padding: "10px 16px", borderTop: "1px solid var(--border-sidebar)", flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-inverse)" }}>{currentUser.name}</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>@{currentUser.username}</div>
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
    const { data: userData } = await supabase.rpc("verify_user", { p_username: username, p_password: password });
    const data = userData?.[0] ?? null;
    if (data) { onLogin(data as User); }
    else setError("اسم المستخدم أو كلمة المرور غلط");
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-sidebar)", direction: "rtl", fontFamily: "var(--font-body)", position: "relative", overflow: "hidden" }}>
      {/* نمط النجمة الثمانية */}
      <div className="sidebar-pattern" style={{ opacity: 0.1 }} />

      {/* الكارد */}
      <div style={{ position: "relative", zIndex: 2, width: "100%", maxWidth: 380, background: "var(--bg-card)", borderRadius: "var(--radius-xl)", padding: 6, boxShadow: "var(--shadow-xl)", border: "1px solid var(--accent-dark)" }}>
        <div style={{ border: "1px solid var(--accent-light)", borderRadius: "calc(var(--radius-xl) - 4px)", padding: "38px 30px" }}>

          {/* الشعار */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22 }}>
            <svg width="96" height="118" viewBox="0 0 96 118" style={{ marginBottom: 8 }}>
              <path d="M8 116 V52 C8 26 28 6 48 6 C68 6 88 26 88 52 V116" fill="none" stroke="var(--accent)" strokeWidth="2.5"/>
              <path d="M15 116 V52 C15 30 31 13 48 13 C65 13 81 30 81 52 V116" fill="none" stroke="var(--accent-light)" strokeWidth="1"/>
              <g transform="translate(48,58) scale(1.05)">
                <path d="M22,0 L8.3,3.4 L15.6,15.6 L3.4,8.3 L0,22 L-3.4,8.3 L-15.6,15.6 L-8.3,3.4 L-22,0 L-8.3,-3.4 L-15.6,-15.6 L-3.4,-8.3 L0,-22 L3.4,-8.3 L15.6,-15.6 L8.3,-3.4 Z" fill="none" stroke="var(--primary-dark)" strokeWidth="2"/>
                <circle r="4.5" fill="var(--accent)"/>
              </g>
            </svg>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 30, color: "var(--primary-dark)", letterSpacing: "0.5px" }}>
              {config.name_ar}
            </div>
            <div style={{ fontSize: 12, color: "var(--accent-dark)", letterSpacing: "2px", marginTop: 2 }}>
              {config.tagline}
            </div>
          </div>

          {/* خط ذهبي */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 20px" }}>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,transparent,var(--accent),transparent)" }} />
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--accent)" strokeWidth="1.4"><path d="M12 2l2.4 7.6H22l-6.2 4.7 2.4 7.7L12 17l-6.2 5 2.4-7.7L2 9.6h7.6z"/></svg>
            <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,transparent,var(--accent),transparent)" }} />
          </div>

          {/* الحقول */}
          <div style={{ marginTop: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "var(--primary)", marginBottom: 6, fontWeight: 500 }}>اسم المستخدم</label>
            <input className="input-field" style={{ border: `1px solid ${error ? "var(--danger)" : "var(--border)"}` }} value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="أدخل اسم المستخدم" autoFocus />
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={{ display: "block", fontSize: 13, color: "var(--primary)", marginBottom: 6, fontWeight: 500 }}>كلمة المرور</label>
            <div style={{ position: "relative" }}>
              <input className="input-field" style={{ border: `1px solid ${error ? "var(--danger)" : "var(--border)"}`, paddingLeft: 36 }} type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="••••••••" />
              <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--danger)", textAlign: "center", background: "var(--danger-bg)", padding: "8px 12px", borderRadius: "var(--radius-md)" }}>{error}</div>
          )}

          <button onClick={handleLogin} disabled={loading} className="btn-gold" style={{ width: "100%", marginTop: 24, opacity: loading ? 0.7 : 1 }}>
            {loading ? "جاري التحقق..." : "دخول"}
          </button>

          <div style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "var(--text-muted)" }}>
            {config.name_ar} · دولة قطر
          </div>
        </div>
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
      {currentUser.permissions.manage_users && <button onClick={openAdd} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", marginBottom: 14, background: "linear-gradient(135deg,var(--em7),var(--em6))", color: "#fff", border: "none", padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> مستخدم جديد</button>}
      {users.map(u => (
        <div key={u.id} style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, background: "var(--paper)" }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: u.username === "admin" ? "rgba(200,162,75,0.15)" : "var(--mb)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {u.username === "admin"
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--mf)" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            }
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{u.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>@{u.username} · {Object.values(u.permissions).filter(Boolean).length} صلاحية</div>
          </div>
          {currentUser.permissions.manage_users && u.username !== "admin" && (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => openEdit(u)} style={{ background: "var(--male-bg)", border: "none", padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "var(--info)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              <button onClick={() => deleteUser(u.id)} style={{ background: "var(--female-bg)", border: "none", padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "var(--danger)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
            </div>
          )}
        </div>
      ))}
      <Modal show={showAdd} onClose={() => setShowAdd(false)} title={editUser ? "تعديل مستخدم" : "مستخدم جديد"}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>الاسم</div><input style={inp} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>اسم المستخدم</div><input style={inp} value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} /></div>
        </div>
        <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>كلمة المرور</div><input type="password" style={inp} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>الصلاحيات</div>
          <div onClick={toggleAll} style={{ fontSize: 11, color: "var(--em7)", cursor: "pointer" }}>{ALL_PERMISSIONS.every(p => perms[p.key]) ? "إلغاء الكل" : "تحديد الكل"}</div>
        </div>
        {ALL_PERMISSIONS.map(p => (
          <div key={p.key} onClick={() => togglePerm(p.key)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 3, background: perms[p.key] ? "rgba(125,31,60,.08)" : "var(--bg-2)", border: `0.5px solid ${perms[p.key] ? "var(--em7)" : "var(--border)"}` }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: perms[p.key] ? "var(--em7)" : "var(--bg-card)", border: `1.5px solid ${perms[p.key] ? "var(--em7)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{perms[p.key] && <span style={{ color: "var(--bg-card)", fontSize: 10 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></span>}</div>
            <span style={{ fontSize: 12 }}>{p.label}</span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={saveUser} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> حفظ</button>
          <button onClick={() => setShowAdd(false)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}

function Dashboard({ passengers, setPage, currentUser, onLogout }: { passengers: Passenger[]; setPage: (p: string) => void; currentUser: User; onLogout: () => void }) {
  const config = useConfig();
  const { males, females } = useMemo(() => ({
    males: passengers.filter(p => p.gender === "ذكر").length,
    females: passengers.filter(p => p.gender === "أنثى").length,
  }), [passengers]);

  // نِسب التوزيع
  const total = passengers.length || 1;
  const dist = useMemo(() => {
    const busCount = passengers.filter(p => (p as any).bus_id != null).length;
    const minaCount = passengers.filter(p => (p as any).camp_mina_id != null).length;
    const arafaCount = passengers.filter(p => (p as any).camp_arafa_id != null).length;
    const hotelCount = passengers.filter(p => (p as any).room_id != null).length;
    const flightCount = passengers.filter(p => (p as any).flight_id != null).length;
    return [
      { label: "الباصات", count: busCount, pct: Math.round(busCount / total * 100), icon: `<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>` },
      { label: "مخيمات منى", count: minaCount, pct: Math.round(minaCount / total * 100), icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>` },
      { label: "مخيمات عرفة", count: arafaCount, pct: Math.round(arafaCount / total * 100), icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>` },
      { label: "الفندق", count: hotelCount, pct: Math.round(hotelCount / total * 100), icon: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/>` },
      { label: "الطيران", count: flightCount, pct: Math.round(flightCount / total * 100), icon: `<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4.5 1.5-4.5 1.5L6 8 0 9.7l3.3 3.3-1.2 5.6L6 17l1.4 3.8L12 18l2 2z"/>` },
    ];
  }, [passengers, total]);

  const recent = passengers.slice(0, 5);

  return (
    <div style={{ display: "flex", gap: 14, height: "100%", overflow: "hidden", padding: "12px 14px", background: "var(--bg)" }}>
      {/* العمود الرئيسي */}
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {/* أزرار الإضافة */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div onClick={() => setPage("scan")} style={{ display: "flex", alignItems: "center", gap: 11, padding: 13, borderRadius: "var(--radius-lg)", cursor: "pointer", background: "linear-gradient(135deg, var(--em7), var(--em6))", color: "var(--text-inverse)", boxShadow: "0 8px 24px rgba(125,31,60,0.25)", transition: "var(--transition)" }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--g3)" strokeWidth="1.7"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>مسح جواز</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>إضافة بالمسح الذكي</div>
            </div>
          </div>
          <div onClick={() => setPage("manual")} style={{ display: "flex", alignItems: "center", gap: 11, padding: 13, borderRadius: "var(--radius-lg)", cursor: "pointer", background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", transition: "var(--transition)" }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--ivory2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--em7)" strokeWidth="1.7"><path d="M16 3l5 5L8 21H3v-5z"/><path d="M13 6l5 5"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>إضافة يدوي</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>إدخال بيانات يدوياً</div>
            </div>
          </div>
        </div>

        {/* خط ذهبي */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 14px" }}>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, var(--g5), transparent)" }} />
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--g5)" strokeWidth="1.3"><path d="M12 2l2.4 7.6H22l-6.2 4.7 2.4 7.7L12 17l-6.2 5 2.4-7.7L2 9.6h7.6z"/></svg>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, var(--g5), transparent)" }} />
        </div>

        {/* إحصائيات — ألوان الصورة */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
          {[
            { label: "الحجاج", num: passengers.length, sub: `+${Math.min(12,passengers.length)} هذا الأسبوع`, bg: "linear-gradient(145deg,#21867A,#2A9D8F)", shadow: "rgba(33,134,122,0.35)", icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>` },
            { label: "رجال", num: males, sub: `${passengers.length ? Math.round(males/passengers.length*100) : 0}٪ من الإجمالي`, bg: "linear-gradient(145deg,#2F78C5,#4A90D9)", shadow: "rgba(47,120,197,0.35)", icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>` },
            { label: "نساء", num: females, sub: `${passengers.length ? Math.round(females/passengers.length*100) : 0}٪ من الإجمالي`, bg: "linear-gradient(145deg,#D4820F,#E8951A)", shadow: "rgba(212,130,15,0.35)", icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>` },
          ].map(({ label, num, sub, bg, shadow, icon }) => (
            <div key={label} style={{ background: bg, borderRadius: 14, padding: "12px 14px", cursor: "pointer", transition: "var(--transition)", boxShadow: `0 4px 16px ${shadow}`, border: `2px solid ${shadow}` }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.filter = "brightness(1.05)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.filter = "none"; }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: icon }} />
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,0.75)", marginBottom: 2 }}>{label}</div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 44, fontWeight: 700, lineHeight: 1, color: "#fff" }}>{num}</div>
              <div style={{ fontSize: 10, marginTop: 4, color: "rgba(255,255,255,0.65)" }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* آخر المضافين */}
        {recent.length > 0 && (
          <div className="panel">
            <div className="panel-head">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <div className="h">آخر المضافين</div>
              <span className="ph-action" onClick={() => setPage("passengers")}>عرض الكل</span>
            </div>
            {recent.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 18px", borderBottom: "1px solid var(--line)", cursor: "pointer", transition: "background 0.14s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--ivory)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <Avatar name={p.name_ar} gender={p.gender} size={38} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{p.short_ar || p.name_ar}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{p.nat} · {p.passport}</div>
                </div>
                {p.services?.bus === "VIP" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "rgba(200,162,75,.12)", color: "var(--g6)", border: "1px solid rgba(200,162,75,.25)" }}>VIP</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* اللوحة الجانبية اليسار */}
      <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
        {/* نِسب التوزيع */}
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M18 9l-5 5-3-3-4 4"/></svg>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 600, color: "var(--em8)" }}>نِسب التوزيع</div>
          </div>
          {dist.map(({ label, pct, icon }) => (
            <div key={label} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(125,31,60,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--em7)" strokeWidth="1.7" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: icon }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", flex: 1 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--em7)", fontFamily: "var(--font-heading)" }}>{pct}٪</span>
              </div>
              <div style={{ height: 5, borderRadius: 99, background: "var(--ivory2)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg,var(--em7),var(--em6))", width: `${pct || 2}%`, transition: "width 0.8s ease" }} />
              </div>
            </div>
          ))}
        </div>

        {/* بطاقة المستخدم والموسم */}
        <div style={{ background: "linear-gradient(145deg,var(--em8),var(--em7))", borderRadius: 14, padding: "14px 16px", color: "#fff" }}>
          <div style={{ fontSize: 10, color: "var(--g3)", letterSpacing: "0.06em", marginBottom: 3, fontWeight: 600 }}>الموسم الحالي</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 10 }}>{config.season_label}</div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.15)", marginBottom: 10 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--g3)" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser.name}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>@{currentUser.username}</div>
            </div>
          </div>
          <button onClick={onLogout} style={{ width: "100%", background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.2)", padding: "6px 0", borderRadius: 8, fontSize: 12, fontFamily: "var(--font-body)", cursor: "pointer", transition: "var(--transition)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            تسجيل خروج
          </button>
        </div>
      </div>
    </div>
  );
}


// ===== SCAN PAGE =====
function ScanPage({ passengers, setPassengers, setPage }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void; setPage: (p: string) => void }) {
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
          const name_en = parsed.name_en || "";
          const name_ar = parsed.name_ar || "";
          setForm(prev => ({
            ...prev,
            name_en: name_en || prev.name_en,
            name_ar: name_ar || prev.name_ar,
            short_en: makeShort(name_en || prev.name_en),
            short_ar: makeShort(name_ar || prev.name_ar),
            passport: parsed.passport || prev.passport,
            nat: parsed.nationality || prev.nat,
            dob: parsed.dob || prev.dob,
            expiry: parsed.expiry || prev.expiry,
            gender: parsed.gender || prev.gender
          }));
          setShowFields(true);
        }, 500);
      } catch (err) {
        clearInterval(iv);
        setLoading(false);
        setShowFields(true);
        setStatusMsg("❌ فشل في قراءة الجواز");
        alert("حدث خطأ أثناء تحليل الجواز، يرجى المحاولة مرة أخرى أو إدخال البيانات يدوياً.");
        console.error("Scan error:", err);
      }
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
    } catch (err) {
      alert("فشل في قراءة البطاقة الشخصية، يرجى إدخال البيانات يدوياً.");
      console.error("ID scan error:", err);
    }
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
    if (error) {
      console.error("Save error:", error);
      alert(`❌ فشل في حفظ بيانات الحاج: ${error.message || "يرجى المحاولة مرة أخرى"}`);
      setUploading(false);
      return;
    }
    if (data && data[0]) {
      const pid = data[0].id;
      const urls: Record<string, string | null> = {};
      try {
        if (passportFile) urls.passport_url = await uploadDoc(passportFile, pid, "passport_doc");
        if (idCardFile) urls.national_id_url = await uploadDoc(idCardFile, pid, "idcard");
        if (docs.photo) urls.photo_url = await uploadDoc(docs.photo, pid, "photo");
        if (docs.contract) urls.contract_url = await uploadDoc(docs.contract, pid, "contract");
        if (Object.keys(urls).length > 0) await supabase.from("passengers").update(urls).eq("id", pid);
      } catch (uploadErr) {
        console.error("Upload error:", uploadErr);
        alert("⚠️ تم حفظ البيانات بنجاح لكن فشل رفع بعض الملفات.");
      }
      setPassengers([...passengers, { id: pid, ...form, short_ar, short_en, services, rel: "", linked: -1, id_expiry: idExpiry, ...urls } as Passenger]);
      setSaved(true); setLocked(true); setTimeout(() => setPage("dash"), 1500);
    }
    setUploading(false);
  };

  const reset = () => {
    setForm({ name_en: "", name_ar: "", short_en: "", short_ar: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", gender: "", phone: "" });
    setServices({ bus: "عادي", flight: "عادي", hotel_type: "ثنائية", hotel_view: "غير مطلة", camp_mina: "عادي", camp_arafa: "عادي" });
    setPreviewImg(null); setPassportFile(null); setShowFields(false); setSaved(false); setLocked(false);
    setIdCardFile(null); setIdCardPreview(null); setIdExpiry(""); setDocs({ photo: null, contract: null });
  };

  useEffect(() => {
    const pending = (window as any).__hajj_pending_scan_file__;
    if (pending) {
      (window as any).__hajj_pending_scan_file__ = null;
      handleFile(pending);
    }
  }, []);


  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%", position: "relative" }}>
      {saved && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "var(--em7)", color: "var(--g3)", padding: "12px 24px", borderRadius: 12, fontSize: 13, fontWeight: 500, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", gap: 8 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> تم حفظ الحاج بنجاح!</div>}
      {/* رفع جواز السفر */}
      <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>جواز السفر</div>
        {!previewImg ? (
          <div onClick={() => document.getElementById("pu")?.click()} style={{ border: "1.5px dashed #ddd", borderRadius: 10, padding: "24px", textAlign: "center", cursor: "pointer", background: "var(--bg-2)" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg></div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3 }}>ارفع صورة جواز السفر</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>الذكاء الاصطناعي يستخرج البيانات تلقائياً</div>
            <input id="pu" type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <img src={previewImg} style={{ width: 140, height: 100, objectFit: "cover", borderRadius: 8, border: "0.5px solid #e5e5e5" }} />
            <div style={{ flex: 1 }}>
              {loading ? (<><div style={{ background: "var(--bg-2)", borderRadius: 99, height: 4, overflow: "hidden", marginBottom: 6 }}><div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg,var(--em7),var(--em6))", borderRadius: 99, transition: "width 0.3s" }} /></div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{statusMsg}</div></>) : <div style={{ fontSize: 11, color: "var(--em7)", fontWeight: 500 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> {statusMsg}</div>}
              <button onClick={reset} style={{ marginTop: 8, ...btnS({ fontSize: 10, padding: "3px 10px" }) }}>تغيير</button>
            </div>
          </div>
        )}
      </div>

      {showFields && (<>
        {/* البيانات المستخرجة */}
        <div style={{ border: "0.5px solid #5DCAA5", borderRadius: 12, padding: "12px 14px", marginBottom: 12, background: "var(--bg-card)" }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>البيانات <span style={{ fontSize: 10, background: "var(--success-bg)", color: "var(--primary-dark)", padding: "1px 7px", borderRadius: 99 }}>مستخرجة</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {([["الاسم بالإنجليزي", "name_en", "1/-1"], ["الاسم بالعربي", "name_ar", "1/-1"], ["المختصر إنجليزي", "short_en", ""], ["المختصر عربي", "short_ar", ""], ["رقم الجواز", "passport", ""], ["الجنسية", "nat", ""], ["التليفون", "phone", ""], ["تاريخ الميلاد", "dob", ""], ["انتهاء الجواز", "expiry", ""]] as [string,string,string][]).map(([l, k, col]) => (
              <div key={k} style={{ gridColumn: col || "auto" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>{l}</div>
                <input disabled={locked} style={{ ...inp, borderColor: "var(--em7)", background: locked ? "var(--bg-2)" : "rgba(125,31,60,.05)", color: locked ? "var(--text-muted)" : "rgba(0,0,0,0.7)" }} value={(form as any)[k]} onChange={e => setField(k, e.target.value)} />
              </div>
            ))}
            <div><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>الجنس</div>
              <select disabled={locked} style={{ ...inp, borderColor: "var(--em7)", background: locked ? "var(--bg-2)" : "rgba(125,31,60,.05)" }} value={form.gender} onChange={e => setField("gender", e.target.value)}>
                <option value="">—</option><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option>
              </select>
            </div>
          </div>
        </div>

        {/* البطاقة الشخصية */}
        <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>البطاقة الشخصية <span style={{ fontSize: 10, color: "var(--text-muted)" }}>(اختياري)</span></div>
          {!idCardPreview ? (
            <div onClick={() => !locked && document.getElementById("id-card-upload")?.click()} style={{ border: "1.5px dashed #ddd", borderRadius: 8, padding: "14px", textAlign: "center", cursor: locked ? "not-allowed" : "pointer", background: "var(--bg-2)", opacity: locked ? 0.6 : 1 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>ارفع البطاقة لاستخراج الرقم والصلاحية تلقائياً</div>
              <input id="id-card-upload" type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleIdCard(e.target.files[0])} />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
              <img src={idCardPreview} style={{ width: 100, height: 65, objectFit: "cover", borderRadius: 6, border: "0.5px solid #e5e5e5" }} />
              <div style={{ flex: 1 }}>
                {idScanLoading ? <div style={{ fontSize: 11, color: "var(--text-muted)" }}>جاري قراءة البطاقة...</div> : <div style={{ fontSize: 11, color: "var(--em7)", fontWeight: 500 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> تم استخراج البيانات</div>}
                <button onClick={() => { setIdCardFile(null); setIdCardPreview(null); setIdExpiry(""); setForm(prev => ({ ...prev, national_id: "" })); }} style={{ marginTop: 6, ...btnS({ fontSize: 10, padding: "2px 8px" }) }}>تغيير</button>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>رقم البطاقة</div>
              <input disabled={locked} style={{ ...inp }} value={form.national_id} onChange={e => setField("national_id", e.target.value)} placeholder="يتعبى تلقائياً من البطاقة" />
            </div>
            <div><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>انتهاء البطاقة</div>
              <input disabled={locked} style={{ ...inp }} value={idExpiry} onChange={e => setIdExpiry(e.target.value)} placeholder="DD/MM/YYYY" />
            </div>
          </div>
        </div>

        {/* الخدمات */}
        <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>الخدمات المطلوبة</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {([["الباص", "bus", ["عادي", "VIP"]], ["الطيران", "flight", ["عادي", "درجة أولى", "بدون"]], ["نوع الغرفة", "hotel_type", ["ثنائية", "ثلاثية", "رباعية", "سويت"]], ["إطلالة الغرفة", "hotel_view", ["مطلة", "غير مطلة"]], ["مخيم منى", "camp_mina", ["عادي", "خاص"]], ["مخيم عرفة", "camp_arafa", ["عادي", "خاص"]]] as [string,string,string[]][]).map(([l, k, opts]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{l}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {opts.map(o => <div key={o} onClick={() => setService(k, o)} style={{ flex: 1, padding: "5px 4px", borderRadius: 8, border: `1.5px solid ${(services as any)[k] === o ? "var(--em7)" : "var(--border)"}`, background: (services as any)[k] === o ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", fontSize: 10, color: (services as any)[k] === o ? "var(--em7)" : "var(--text-muted)", textAlign: "center", fontWeight: (services as any)[k] === o ? 500 : 400 }}>{o}</div>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* مستندات إضافية */}
        <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>مستندات إضافية <span style={{ fontSize: 10, color: "var(--text-muted)" }}>(اختياري)</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {([["صورة شخصية", "photo", "image/*"], ["عقد الانتفاق", "contract", "image/*,application/pdf"]] as [string, "photo"|"contract", string][]).map(([label, key, accept]) => (
              <div key={key}>
                <input id={`doc-${key}`} type="file" accept={accept} disabled={locked} style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) setDocs(prev => ({ ...prev, [key]: f })); }} />
                <div onClick={() => !locked && document.getElementById(`doc-${key}`)?.click()} style={{ border: `1.5px dashed ${docs[key] ? "var(--em7)" : "var(--border)"}`, borderRadius: 8, padding: "12px 6px", textAlign: "center", cursor: locked ? "not-allowed" : "pointer", background: docs[key] ? "rgba(125,31,60,.05)" : "var(--bg-2)", opacity: locked ? 0.6 : 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: docs[key] ? "var(--primary-dark)" : "var(--text-muted)" }}>{label}</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>{docs[key] ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> تم الاختيار</> : "اضغط للرفع"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* الأزرار */}
        <div style={{ display: "flex", gap: 8 }}>
          {locked ? (<>
            <button onClick={() => setLocked(false)} style={{ ...btnP({ background: "var(--male-bg)", color: "var(--info)" }), flex: 1 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> تعديل</button>
            <button onClick={reset} style={{ ...btnP(), flex: 1 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> حاج جديد</button>
          </>) : (<>
            <button onClick={handleSave} disabled={uploading} style={{ ...btnP(), flex: 1, opacity: uploading ? 0.6 : 1 }}>{uploading ? "جاري الحفظ..." : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> حفظ الحاج</>}</button>
            <button onClick={reset} style={btnS()}>مسح</button>
          </>)}
        </div>
      </>)}
    </div>
  );
}


// ===== دائرة النسبة =====

// ===== ملخص إحصائي في أعلى صفحة الحجاج =====
function PassengersStats({ passengers }: { passengers: Passenger[] }) {
  const DATA_FIELDS = ["name_ar", "name_en", "passport", "national_id", "nat", "dob", "expiry", "gender", "phone"];

  const stats = useMemo(() => {
    const total = passengers.length;
    const males = passengers.filter(p => p.gender === "ذكر").length;
    const females = passengers.filter(p => p.gender === "أنثى").length;
    const docsComplete = (p: Passenger) => !!(p.photo_url && p.passport_url && p.national_id_url);
    const dataComplete = (p: Passenger) => DATA_FIELDS.every(f => (p as any)[f] && String((p as any)[f]).trim());
    const docsDone = passengers.filter(docsComplete).length;
    const dataDone = passengers.filter(dataComplete).length;
    const docPct = total ? Math.round(docsDone / total * 100) : 0;
    const dataPct = total ? Math.round(dataDone / total * 100) : 0;
    return { total, males, females, docsDone, dataDone, docPct, dataPct };
  }, [passengers]);

  const { total, males, females, docsDone, dataDone, docPct, dataPct } = stats;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--ivory)" }}>
      {/* كارت الإجمالي */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", position: "relative", overflow: "hidden", cursor: "default", transition: "var(--transition)" }}
        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,.08)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(200,162,75,.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.8" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--g7)", marginBottom: 3, opacity: 0.8 }}>إجمالي الحجاج</div>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700, lineHeight: 1, color: "var(--em8)" }}>{total}</div>
        <div style={{ fontSize: 11, marginTop: 4, color: "var(--g6)", opacity: 0.7 }}>الموسم الحالي</div>
      </div>
      {/* كارت الرجال */}
      <div style={{ background: "var(--mb)", border: "1px solid rgba(19,69,107,.1)", borderRadius: 10, padding: "8px 10px", transition: "var(--transition)" }}
        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,.08)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(19,69,107,.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--mf)" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--mf)", marginBottom: 3, opacity: 0.8 }}>رجال</div>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700, lineHeight: 1, color: "var(--mf)" }}>{males}</div>
        <div style={{ fontSize: 11, marginTop: 4, color: "var(--mf)", opacity: 0.7 }}>{total ? Math.round(males/total*100) : 0}٪ من الإجمالي</div>
      </div>
      {/* كارت النساء */}
      <div style={{ background: "var(--fb)", border: "1px solid rgba(122,46,69,.1)", borderRadius: 10, padding: "8px 10px", transition: "var(--transition)" }}
        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,.08)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(122,46,69,.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ff)" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ff)", marginBottom: 3, opacity: 0.8 }}>نساء</div>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700, lineHeight: 1, color: "var(--ff)" }}>{females}</div>
        <div style={{ fontSize: 11, marginTop: 4, color: "var(--ff)", opacity: 0.7 }}>{total ? Math.round(females/total*100) : 0}٪ من الإجمالي</div>
      </div>
      {/* كارت اكتمال البيانات */}
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", transition: "var(--transition)" }}
        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,.08)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(125,31,60,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--em7)" strokeWidth="1.8" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--g7)", marginBottom: 6, opacity: 0.8 }}>اكتمال المستندات</div>
        <div style={{ height: 4, borderRadius: 99, background: "var(--ivory2)", overflow: "hidden", marginBottom: 4 }}>
          <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg, var(--em7), var(--em6))", width: `${docPct}%`, transition: "width 0.6s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)" }}>
          <span>{docsDone} من {total}</span><span style={{ fontWeight: 700, color: "var(--em7)" }}>{docPct}٪</span>
        </div>
        <div style={{ height: 4, borderRadius: 99, background: "var(--ivory2)", overflow: "hidden", margin: "8px 0 4px" }}>
          <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg, var(--mf), rgba(19,69,107,.5))", width: `${dataPct}%`, transition: "width 0.6s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted)" }}>
          <span>{dataDone} مكتمل</span><span style={{ fontWeight: 700, color: "var(--mf)" }}>{dataPct}٪</span>
        </div>
      </div>
    </div>
  );
}

function PassengersPage({ passengers, setPassengers, initialShowManual, setPage }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void; initialShowManual?: boolean; setPage?: (p: string) => void }) {
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

  const filtered = useMemo(() => passengers.filter(p => {
    const fullName = `${p.name_ar} ${p.name_en}`;
    const searchMatch = !search || fullName.toLowerCase().includes(search.toLowerCase()) ||
      [p.passport, p.national_id, p.nat, p.phone, p.gender, p.services?.bus].join(" ").toLowerCase().includes(search.toLowerCase());
    if (!searchMatch) return false;
    return COLS.every(col => {
      const filter = colFilters[col.key];
      if (!filter) return true;
      return getVal(p, col.key, col.get).toLowerCase().includes(filter.toLowerCase());
    });
  }), [passengers, search, colFilters]);

  const [docUploading, setDocUploading] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(initialShowManual || false);
  const [manualForm, setManualForm] = useState({ name_ar: "", name_en: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", id_expiry: "", gender: "ذكر", phone: "" });
  const [manualServices, setManualServices] = useState({ bus: "عادي", flight: "عادي", hotel_type: "ثنائية", hotel_view: "غير مطلة", camp_mina: "عادي", camp_arafa: "عادي" });
  const [manualSaving, setManualSaving] = useState(false);

  const handleManualSave = async () => {
    if (!manualForm.name_ar && !manualForm.name_en) { alert("اكتب الاسم على الأقل!"); return; }
    const dupP = manualForm.passport && passengers.some((p: Passenger) => p.passport === manualForm.passport);
    const dupN = manualForm.national_id && passengers.some((p: Passenger) => p.national_id === manualForm.national_id);
    if (dupP) { alert("⚠️ رقم الجواز ده مسجل بالفعل!"); return; }
    if (dupN) { alert("⚠️ رقم البطاقة ده مسجل بالفعل!"); return; }
    setManualSaving(true);
    const short_ar = makeShort(manualForm.name_ar);
    const short_en = makeShort(manualForm.name_en);
    const { data, error } = await supabase.from("passengers").insert([{ ...manualForm, short_ar, short_en, bus: manualServices.bus, flight: manualServices.flight, hotel_type: manualServices.hotel_type, hotel_view: manualServices.hotel_view, camp_mina: manualServices.camp_mina, camp_arafa: manualServices.camp_arafa }]).select();
    if (error) {
      console.error("Manual save error:", error);
      alert(`❌ فشل في حفظ البيانات: ${error.message || "يرجى المحاولة مرة أخرى"}`);
      setManualSaving(false);
      return;
    }
    if (data && data[0]) {
      setPassengers([...passengers, { id: data[0].id, ...manualForm, short_ar, short_en, services: manualServices, rel: "", linked: -1 } as Passenger]);
      setShowManual(false);
      setManualForm({ name_ar: "", name_en: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", id_expiry: "", gender: "ذكر", phone: "" });
    }
    setManualSaving(false);
  };

  const [showVerify, setShowVerify] = useState(false);
  const [verifyData, setVerifyData] = useState<{ passportUrl: string; idUrl: string; passenger: any; updates: any; isQatari: boolean; idMismatch: boolean; } | null>(null);

  const handleDocUpload = async (p: Passenger, docType: string, field: string, file: File) => {
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
        setVerifyData({ passportUrl: url || p.passport_url || "", idUrl: p.national_id_url, passenger: p, updates, isQatari: p.nat === "قطري", idMismatch: false });
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
        setVerifyData({ passportUrl: p.passport_url || "", idUrl: url || p.national_id_url || "", passenger: p, updates, isQatari, idMismatch: !!idMismatch });
        setShowVerify(true);
      } else {
        await saveDocUpdates(p, updates);
      }
    } else {
      const url = await uploadDoc(file, p.id, docType);
      if (url) {
        await supabase.from("passengers").update({ [field]: url }).eq("id", p.id);
        const updated = { ...p, [field]: url };
        setPassengers(passengers.map((x: Passenger) => x.id === p.id ? updated : x));
        setSelected(updated);
      }
      setDocUploading(null);
    }
  };

  const saveDocUpdates = async (p: Passenger, updates: Partial<Passenger>) => {
    await supabase.from("passengers").update(updates).eq("id", p.id);
    const updated = { ...p, ...updates };
    setPassengers(passengers.map((x: Passenger) => x.id === p.id ? updated : x));
    setSelected(updated);
  };

  const confirmVerify = async () => {
    if (!verifyData) return;
    await saveDocUpdates(verifyData.passenger, verifyData.updates);
    setShowVerify(false); setVerifyData(null);
  };

  const handleDocDelete = async (p: Passenger, field: string, url: string) => {
    if (!confirm("هتمسح المستند ده؟")) return;
    const path = getStoragePath(url);
    if (path) await supabase.storage.from("passengers-docs").remove([path]);
    await supabase.from("passengers").update({ [field]: null }).eq("id", p.id);
    const updated = { ...p, [field]: null };
    setPassengers(passengers.map((x: Passenger) => x.id === p.id ? updated : x));
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
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--paper)" }}>
          {/* أزرار الإضافة */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div onClick={() => setPage?.("scan")} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, cursor: "pointer", background: "linear-gradient(135deg,var(--em7),var(--em6))", color: "#fff", transition: "var(--transition)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
              <span style={{ fontSize: 12, fontWeight: 700 }}>مسح جواز</span>
            </div>
            <div onClick={() => setShowManual(true)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, cursor: "pointer", background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", transition: "var(--transition)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M16 3l5 5L8 21H3v-5z"/></svg>
              <span style={{ fontSize: 12, fontWeight: 700 }}>إضافة يدوي</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 99, padding: "8px 14px", transition: "var(--transition)" }}
              onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--g5)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 3px rgba(200,162,75,.12)"; }}
              onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--line)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} style={{ border: "none", background: "transparent", fontSize: 13, flex: 1, outline: "none", fontFamily: "var(--font-body)", color: "var(--ink)" }} placeholder="ابحث بالاسم أو الجواز أو أي معلومة..." />
              {search && <span onClick={() => setSearch("")} style={{ cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1 }}>✕</span>}
            </div>
            <div style={{ display: "flex", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
              <div onClick={() => setViewMode("list")} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, background: viewMode === "list" ? "var(--em7)" : "var(--paper)", color: viewMode === "list" ? "var(--g3)" : "var(--muted)", fontWeight: viewMode === "list" ? 600 : 400, transition: "var(--transition)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </div>
              <div onClick={() => setViewMode("table")} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, background: viewMode === "table" ? "var(--em7)" : "var(--paper)", color: viewMode === "table" ? "var(--g3)" : "var(--muted)", fontWeight: viewMode === "table" ? 600 : 400, transition: "var(--transition)", borderRight: "1px solid var(--line)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
              </div>
            </div>
            <button onClick={() => setShowManual(true)} style={{ background: "linear-gradient(135deg, var(--em7), var(--em6))", color: "var(--text-inverse)", border: "none", padding: "8px 14px", borderRadius: 10, fontSize: 12, cursor: "pointer", fontWeight: 700, fontFamily: "var(--font-body)", display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(125,31,60,.22)", transition: "var(--transition)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              إضافة
            </button>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{filtered.length} من {passengers.length} حاج</div>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {viewMode === "list" ? (
            <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, margin: "12px 14px", overflow: "hidden" }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: 12 }}>لا توجد نتائج</div>
              ) : filtered.map(p => (
                <div key={p.id} onClick={() => setSelected(p)}
                  style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 18px", borderBottom: "1px solid var(--line)", cursor: "pointer", transition: "background .14s", background: selected?.id === p.id ? "var(--ivory)" : "transparent" }}
                  onMouseEnter={e => { if (selected?.id !== p.id) e.currentTarget.style.background = "var(--ivory)"; }}
                  onMouseLeave={e => { if (selected?.id !== p.id) e.currentTarget.style.background = "transparent"; }}>
                  {/* الأفاتار */}
                  <div style={{ borderRadius: "50%", flexShrink: 0, border: selected?.id === p.id ? "2px solid var(--g5)" : "2px solid transparent", lineHeight: 0 }}>
                    <Avatar name={p.name_ar} gender={p.gender} size={38} />
                  </div>
                  {/* الاسم والبيانات */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", display: "flex", alignItems: "center", gap: 5 }}>
                      {p.short_ar || p.name_ar}
                      {(isExpired(p.expiry) || isExpired((p as any).id_expiry)) && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "var(--danger-bg)", color: "var(--danger)" }}>منتهي</span>
                      )}
                      {!isExpired(p.expiry) && (isExpiringSoon(p.expiry) || isExpiringSoon((p as any).id_expiry)) && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "var(--warning-bg)", color: "var(--warning)" }}>قريب</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{p.nat} · {p.passport}{p.phone ? ` · ${p.phone}` : ""}</div>
                  </div>
                  {/* الشيبس */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: p.gender === "أنثى" ? "var(--fb)" : "var(--mb)", color: p.gender === "أنثى" ? "var(--ff)" : "var(--mf)" }}>{p.gender === "أنثى" ? "أنثى" : "ذكر"}</span>
                    {p.services?.bus === "VIP" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(200,162,75,.12)", color: "var(--g6)", border: "1px solid rgba(200,162,75,.25)" }}>VIP</span>}
                    {p.services?.flight === "درجة أولى" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "var(--info-bg)", color: "var(--info)" }}>أولى</span>}
                    {p.family_id && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(125,31,60,.08)", color: "var(--em7)" }}>أسرة</span>}
                  </div>
                  {/* الأزرار */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <div onClick={e => { e.stopPropagation(); setEditing(p); }} style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--muted)", transition: "var(--transition)" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--ivory2)"; e.currentTarget.style.color = "var(--em7)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </div>
                    <div onClick={e => { e.stopPropagation(); if (confirm("هتمسح الحاج ده؟")) deleteP(p.id); }} style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--muted)", transition: "var(--transition)" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--fb)"; e.currentTarget.style.color = "var(--ff)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "max-content", width: "100%" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                <tr style={{ background: "var(--em7)", color: "var(--g3)" }}>
                  <th style={{ padding: "8px 10px", border: "0.5px solid #17836", textAlign: "center" }}>م</th>
                  {COLS.map(col => <th key={col.key} style={{ padding: "8px 10px", border: "0.5px solid #17836", whiteSpace: "nowrap", textAlign: "right" }}>{col.label}</th>)}
                  <th style={{ padding: "8px 10px", border: "0.5px solid #17836", textAlign: "center" }}>إجراءات</th>
                </tr>
                <tr style={{ background: "var(--bg-2)" }}>
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
                  <tr key={p.id} onClick={() => setSelected(p)} style={{ cursor: "pointer", background: selected?.id === p.id ? "var(--success-bg)" : i % 2 === 0 ? "white" : "var(--bg-2)" }}>
                    <td style={{ padding: "6px 10px", border: "0.5px solid #eee", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                    {COLS.map(col => (
                      <td key={col.key} style={{ padding: "6px 10px", border: "0.5px solid #eee", whiteSpace: "nowrap" }}>
                        {getVal(p, col.key, col.get)}
                        {col.key === "name_ar" && ((isExpired(p.expiry) || isExpired((p as any).id_expiry)) ? <span style={{ marginRight: 4, color: "var(--danger)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> : (isExpiringSoon(p.expiry) || isExpiringSoon((p as any).id_expiry)) && <span style={{ marginRight: 4, color: "var(--warning)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>)}
                      </td>
                    ))}
                    <td style={{ padding: "6px 10px", border: "0.5px solid #eee", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button onClick={e => { e.stopPropagation(); setEditing(p); }} style={{ background: "var(--male-bg)", border: "none", padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: "pointer", color: "var(--info)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button onClick={e => { e.stopPropagation(); if (confirm("هتمسح الحاج ده؟")) deleteP(p.id); }} style={{ background: "var(--female-bg)", border: "none", padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: "pointer", color: "var(--danger)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
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
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16 }}>✕</button>
          </div>
          <div style={{ textAlign: "center", marginBottom: 12, background: "var(--bg-2)", borderRadius: 10, padding: 12 }}>
            {(selected as any).photo_url ? (
              <img src={(selected as any).photo_url} alt={selected.name_ar} style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", margin: "0 auto", display: "block", border: "2px solid #5DCAA5" }} />
            ) : <Avatar name={selected.name_ar} gender={selected.gender} size={48} />}
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>{selected.name_ar}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{selected.name_en}</div>
          </div>
          {(isExpired(selected.expiry) || isExpired((selected as any).id_expiry)) ? (
            <div style={{ background: "var(--female-bg)", border: "1.5px solid #c0392b", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontSize: 11, color: "var(--danger)", fontWeight: 700, textAlign: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> {isExpired(selected.expiry) ? "الجواز منتهي" : "البطاقة منتهية"}
            </div>
          ) : (isExpiringSoon(selected.expiry) || isExpiringSoon((selected as any).id_expiry)) && (
            <div style={{ background: "var(--warning-bg)", border: "1px solid #e67e22", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontSize: 11, color: "var(--warning)", fontWeight: 600, textAlign: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> صلاحية {isExpiringSoon(selected.expiry) ? "الجواز" : "البطاقة"} ستنتهي خلال أقل من 6 شهور
            </div>
          )}
          {[["الجواز", selected.passport], ["البطاقة", selected.national_id], ["الجنسية", selected.nat], ["الجنس", selected.gender], ["الميلاد", selected.dob], ["انتهاء الجواز", selected.expiry], ["التليفون", selected.phone]].filter(([, v]) => v).map(([icon, val]) => (
            <div key={icon as string} style={{ background: "var(--bg-2)", borderRadius: 8, padding: "6px 10px", marginBottom: 4, fontSize: 11 }}>{icon as string} {val as string}</div>
          ))}
          <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginTop: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6 }}>الخدمات</div>
            {[["الباص", selected.services?.bus], ["الطيران", selected.services?.flight], ["الفندق", `${selected.services?.hotel_type || ""} ${selected.services?.hotel_view || ""}`.trim()], ["منى", selected.services?.camp_mina], ["عرفة", selected.services?.camp_arafa]].map(([icon, label, val]) => (
              <div key={label as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "0.5px solid #f5f5f5" }}>
                <span style={{ color: "var(--text-muted)" }}>{icon as string} {label as string}</span>
                <span style={{ fontWeight: 500, color: (val === "VIP" || val === "درجة أولى" || val === "خاص") ? "var(--warning)" : "var(--text)" }}>{val as string}</span>
              </div>
            ))}
          </div>
          <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8 }}>المستندات</div>
            {([
              ["صورة شخصية", (selected as any).photo_url, "photo_url", "photo", "image/*"],
              ["جواز السفر", (selected as any).passport_url, "passport_url", "passport_doc", "image/*"],
              ["البطاقة", (selected as any).national_id_url, "national_id_url", "idcard", "image/*"],
              ["العقد", (selected as any).contract_url, "contract_url", "contract", "image/*,application/pdf"],
            ] as [string, string, string, string, string][]).map(([label, url, field, docType, accept]) => (
              <div key={label} style={{ padding: "7px 0", borderBottom: "0.5px solid #f5f5f5" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: url ? "var(--text)" : "var(--text-muted)" }}>{label}</span>
                  {docUploading === docType ? (
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>جاري الرفع...</span>
                  ) : url ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => window.open(url, "_blank")} style={{ background: "var(--male-bg)", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "var(--info)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg> عرض</button>
                      <button onClick={() => downloadFile(url)} style={{ background: "var(--success-bg)", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "var(--primary-dark)" }}>⬇️</button>
                      <button onClick={() => handleDocDelete(selected, field, url)} style={{ background: "var(--female-bg)", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "var(--danger)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
                    </div>
                  ) : (
                    <>
                      <input id={`upload-${docType}`} type="file" accept={accept} style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(selected, docType, field, f); e.currentTarget.value = ""; }} />
                      <button onClick={() => document.getElementById(`upload-${docType}`)?.click()} style={{ background: "var(--success-bg)", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "var(--primary-dark)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> رفع</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* الأقارب */}
          <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 500 }}>الأقارب</div>
              <button onClick={() => { setShowLinkFamily(true); setLinkSearch(""); }} style={{ background: "var(--success-bg)", border: "none", padding: "2px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "var(--primary-dark)" }}>+ ربط</button>
            </div>
            {getFamilyMembers(selected).length === 0 ? (
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>لا يوجد أقارب مرتبطين</div>
            ) : (
              getFamilyMembers(selected).map(fm => (
                <div key={fm.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "0.5px solid #f5f5f5" }}>
                  <div onClick={() => setSelected(fm)} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer" }}>
                    <Avatar name={fm.name_ar} gender={fm.gender} size={24} />
                    <span style={{ fontSize: 11 }}>{fm.short_ar || fm.name_ar}</span>
                  </div>
                  <button onClick={() => handleUnlinkFamily(fm)} title="فك الارتباط مع هذا الشخص" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--border)", fontSize: 12 }}>✕</button>
                </div>
              ))
            )}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditing(selected)} style={{ ...btnP({ background: "var(--male-bg)", color: "var(--info)" }), flex: 1 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> تعديل</button>
            <button onClick={() => { if (confirm("هتمسح الحاج ده؟")) deleteP(selected.id); }} style={{ background: "var(--female-bg)", border: "none", padding: "7px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "var(--danger)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
          </div>
        </div>
      )}

      {/* مودال التحقق من الهوية */}
      <Modal show={showVerify} onClose={() => { setShowVerify(false); setVerifyData(null); }} title="تأكيد هوية الحاج" maxWidth={520}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.6 }}>تأكد إن صورة الجواز وصورة البطاقة لنفس الشخص قبل الحفظ</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          {[["صورة الجواز", verifyData?.passportUrl], ["صورة البطاقة", verifyData?.idUrl]].map(([label, url]) => (
            <div key={label as string} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ background: "var(--bg-2)", padding: "6px 10px", fontSize: 11, fontWeight: 500, borderBottom: "0.5px solid #e5e5e5" }}>{label as string}</div>
              {url ? (
                <img src={url as string} alt={label as string} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--border)", fontSize: 12 }}>لم يتم الرفع</div>
              )}
            </div>
          ))}
        </div>
        {verifyData?.idMismatch && (
          <div style={{ background: "var(--warning-bg)", border: "0.5px solid #e67e22", borderRadius: 8, padding: "8px 12px", marginBottom: 14, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
            <span style={{ fontSize: 12, color: "var(--warning)", lineHeight: 1.6 }}>الرقم الشخصي في البطاقة مختلف عن المسجل في الجواز — تأكد قبل الحفظ</span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={confirmVerify} style={{ background: "var(--em7)", color: "var(--g3)", border: "none", padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> نعم، نفس الشخص — حفظ</button>
          <button onClick={() => { setShowVerify(false); setVerifyData(null); }} style={{ background: "var(--female-bg)", color: "var(--danger)", border: "0.5px solid #f0c0cc", padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> لا، مش نفس الشخص</button>
        </div>
      </Modal>

      <Modal show={showLinkFamily} onClose={() => setShowLinkFamily(false)} title="ربط بأقارب">
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>اختر الحاج اللي عايز تربطه بـ {selected?.short_ar}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "var(--text-muted)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21-4.35-4.35"/></svg></span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={linkSearch} onChange={e => setLinkSearch(e.target.value)} autoFocus />
        </div>
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {passengers.filter(p => selected && p.id !== selected.id && (!linkSearch || p.name_ar.includes(linkSearch) || p.short_ar.includes(linkSearch))).map(p => (
            <div key={p.id} onClick={() => selected && handleLinkFamily(selected, p)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: "pointer", background: "transparent" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--success-bg)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <Avatar name={p.name_ar} gender={p.gender} size={28} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar || p.name_ar}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.nat} · {p.gender}</div>
              </div>
              {p.family_id && <span style={{ fontSize: 9, background: "var(--success-bg)", color: "var(--primary-dark)", padding: "1px 5px", borderRadius: 99 }}>عنده أقارب</span>}
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
                <div key={k as string}><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>{l as string}</div><input style={inp} value={(editing as any)[k as string] || ""} onChange={e => setEditing({ ...editing, [k as string]: e.target.value })} /></div>
              ))}
              <div><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>الجنس</div><select style={inp} value={editing.gender} onChange={e => setEditing({ ...editing, gender: e.target.value })}><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option></select></div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8 }}>الخدمات المطلوبة</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {([["الباص", "bus", ["عادي","VIP"]], ["الطيران", "flight", ["عادي","درجة أولى","بدون"]], ["نوع الغرفة", "hotel_type", ["ثنائية","ثلاثية","رباعية","سويت"]], ["🪟 إطلالة", "hotel_view", ["مطلة","غير مطلة"]], ["منى", "camp_mina", ["عادي","خاص"]], ["عرفة", "camp_arafa", ["عادي","خاص"]]] as [string,string,string[]][]).map(([l,k,opts]) => (
                  <div key={k}><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{l}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {opts.map(o => <div key={o} onClick={() => setEditing({ ...editing, services: { ...editing.services, [k]: o } })} style={{ flex: 1, padding: "4px 2px", borderRadius: 6, border: "1.5px solid " + (editing.services?.[k as keyof typeof editing.services] === o ? "var(--em7)" : "var(--border)"), background: editing.services?.[k as keyof typeof editing.services] === o ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", fontSize: 10, color: editing.services?.[k as keyof typeof editing.services] === o ? "var(--em7)" : "var(--text-muted)", textAlign: "center" as const }}>{o}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => saveEdit(editing)} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> حفظ</button>
              <button onClick={() => setEditing(null)} style={btnS()}>إلغاء</button>
            </div>
          </>
        )}
      </Modal>

      {/* مودال الإضافة اليدوية */}
      <Modal show={showManual} onClose={() => setShowManual(false)} title="إضافة حاج يدوياً" maxWidth={460}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>أدخل البيانات يدوياً — المستندات تقدر ترفعها بعدين من ملف الحاج</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {([["الاسم بالعربي *", "name_ar"], ["الاسم بالإنجليزي", "name_en"], ["رقم الجواز", "passport"], ["رقم البطاقة", "national_id"], ["الجنسية", "nat"], ["التليفون", "phone"], ["تاريخ الميلاد", "dob"], ["انتهاء الجواز", "expiry"], ["انتهاء البطاقة", "id_expiry"]] as [string,string][]).map(([l, k]) => (
            <div key={k}><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>{l}</div>
              <input style={inp} value={(manualForm as any)[k]} onChange={e => setManualForm(prev => ({ ...prev, [k]: e.target.value }))} />
            </div>
          ))}
          <div><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>الجنس</div>
            <select style={inp} value={manualForm.gender} onChange={e => setManualForm(prev => ({ ...prev, gender: e.target.value }))}>
              <option value="ذكر">ذكر</option><option value="أنثى">أنثى</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8 }}>الخدمات</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {([["الباص", "bus", ["عادي","VIP"]], ["الطيران", "flight", ["عادي","درجة أولى","بدون"]], ["نوع الغرفة", "hotel_type", ["ثنائية","ثلاثية","رباعية","سويت"]], ["🪟 إطلالة", "hotel_view", ["مطلة","غير مطلة"]], ["منى", "camp_mina", ["عادي","خاص"]], ["عرفة", "camp_arafa", ["عادي","خاص"]]] as [string,string,string[]][]).map(([l,k,opts]) => (
              <div key={k}><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{l}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {opts.map(o => <div key={o} onClick={() => setManualServices(prev => ({ ...prev, [k]: o }))} style={{ flex: 1, padding: "4px 2px", borderRadius: 6, border: `1.5px solid ${(manualServices as any)[k] === o ? "var(--em7)" : "var(--border)"}`, background: (manualServices as any)[k] === o ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", fontSize: 10, color: (manualServices as any)[k] === o ? "var(--em7)" : "var(--text-muted)", textAlign: "center" }}>{o}</div>)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleManualSave} disabled={manualSaving} style={{ ...btnP(), flex: 1, opacity: manualSaving ? 0.6 : 1 }}>{manualSaving ? "جاري الحفظ..." : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> حفظ</>}</button>
          <button onClick={() => setShowManual(false)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}


// ===== ملخص صفحة الطيران =====
function FlightsStats({ passengers }: { passengers: Passenger[] }) {
  const total = passengers.length;
  const assigned = passengers.filter(p => p.flight_id != null).length;
  const unassigned = passengers.filter(p => p.flight_id == null).length;
  const firstClass = passengers.filter(p => p.services?.flight === "درجة أولى").length;
  const withoutTicket = passengers.filter(p => p.services?.flight === "بدون").length;

  const cards = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", border: "#c8a24b", clr: "var(--em8)", bg: "var(--paper)" },
    { label: "موزّعون", num: assigned, sub: `${total ? Math.round(assigned/total*100) : 0}٪ من الإجمالي`, border: "#2A9D8F", clr: "#2A9D8F", bg: "rgba(42,157,143,0.05)" },
    { label: "غير موزّعين", num: unassigned, sub: unassigned > 0 ? "يحتاج توزيع" : "مكتمل", border: unassigned > 0 ? "#c0392b" : "#ccc", clr: unassigned > 0 ? "#c0392b" : "var(--muted)", bg: unassigned > 0 ? "rgba(192,57,43,0.05)" : "var(--paper)" },
    { label: "درجة أولى", num: firstClass, sub: `${total ? Math.round(firstClass/total*100) : 0}٪ من الإجمالي`, border: "#E8951A", clr: "#E8951A", bg: "rgba(232,149,26,0.05)" },
    { label: "بدون تذكرة", num: withoutTicket, sub: withoutTicket > 0 ? "يحتاج مراجعة" : "لا يوجد", border: withoutTicket > 0 ? "#7a2e45" : "#ccc", clr: withoutTicket > 0 ? "var(--ff)" : "var(--muted)", bg: withoutTicket > 0 ? "var(--fb)" : "var(--paper)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--ivory)" }}>
      {cards.map(({ label, num, sub, border, clr, bg }) => (
        <div key={label} style={{ background: bg, border: "1.5px solid var(--line)", borderRight: `4px solid ${border}`, borderRadius: 10, padding: "11px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 5 }}>{label}</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 700, lineHeight: 1, color: clr }}>{num}</div>
          <div style={{ fontSize: 11, marginTop: 4, color: "var(--g7)" }}>{sub}</div>
        </div>
      ))}
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
    if (error) { alert(`❌ فشل في إضافة الرحلة: ${error.message || "يرجى المحاولة مرة أخرى"}`); return; }
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
      <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 99, background: type === "ذهاب" ? "var(--male-bg)" : "var(--female-bg)", color: type === "ذهاب" ? "var(--info)" : "var(--female-fg)", display: "inline-block", marginBottom: 10 }}>
        {type === "ذهاب" ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4.5 1.5-4.5 1.5L6 8 0 9.7l3.3 3.3-1.2 5.6L6 17l1.4 3.8L12 18l2 2z"/></svg> رحلات الذهاب</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4.5 1.5-4.5 1.5L6 8 0 9.7l3.3 3.3-1.2 5.6L6 17l1.4 3.8L12 18l2 2z"/></svg> رحلات الإياب</>} ({groupFlights.length})
      </span>
      {groupFlights.length === 0 ? <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "6px 0" }}>لا يوجد رحلات بعد</div> :
        groupFlights.map(flight => {
          const isExpanded = expanded.has(flight.id);
          const fp = getFlightPassengers(flight.id);
          return (
            <div key={flight.id} style={{ border: `0.5px solid ${type === "ذهاب" ? "var(--male-bg)" : "var(--female-bg)"}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
              <div onClick={() => toggleFlight(flight.id)} style={{ padding: "10px 12px", background: type === "ذهاب" ? "var(--info-bg)" : "var(--female-bg)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 18 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="1.7" strokeLinecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4.5 1.5-4.5 1.5L6 8 0 9.7l3.3 3.3-1.2 5.6L6 17l1.4 3.8L12 18l2 2z"/></svg></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{flight.name} {flight.airline && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>— {flight.airline}</span>}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{flight.from_airport} {flight.to_airport ? `← ${flight.to_airport}` : ""} {flight.date ? `| ${flight.date}` : ""} {flight.time || ""}</div>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{fp.length} مسافر</span>
                <button onClick={e => { e.stopPropagation(); printFlight(flight); }} title="طباعة" style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--muted)", transition: "var(--transition)" }} onMouseEnter={e => { e.currentTarget.style.background = "var(--ivory2)"; e.currentTarget.style.color = "var(--ink)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.color = "var(--muted)"; }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
                <button onClick={e => { e.stopPropagation(); openAddP(flight.id); }} title="إضافة مسافر" style={{ height: 30, padding: "0 12px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(125,31,60,0.08)", border: "1px solid rgba(125,31,60,0.2)", cursor: "pointer", color: "var(--em7)", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-body)", transition: "var(--transition)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.15)"; }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(125,31,60,0.08)"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> إضافة</button>
                <button onClick={e => { e.stopPropagation(); deleteFlight(flight.id); }} title="حذف الرحلة" style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: fp.length === 0 ? "var(--fb)" : "var(--paper)", border: `1px solid ${fp.length === 0 ? "rgba(122,46,69,0.2)" : "var(--line)"}`, cursor: fp.length === 0 ? "pointer" : "not-allowed", color: fp.length === 0 ? "var(--ff)" : "var(--text-muted)", transition: "var(--transition)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {isExpanded && (
                <div style={{ padding: "8px 12px", borderTop: `0.5px solid ${type === "ذهاب" ? "var(--male-bg)" : "var(--female-bg)"}` }}>
                  {fp.length ? fp.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px", borderRadius: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", width: 18, textAlign: "center" }}>{i + 1}</span>
                      <Avatar name={p.name_ar} gender={p.gender} size={24} />
                      <span style={{ fontSize: 11, flex: 1 }}>{p.short_ar || p.name_ar}</span>
                      {(p as any).flight_class === "درجة أولى" && <span style={{ fontSize: 9, background: "var(--warning-bg)", color: "var(--warning)", padding: "1px 5px", borderRadius: 99 }}>⭐ أولى</span>}
                      <button onClick={() => removeP(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--border)", fontSize: 12 }}>✕</button>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "8px", color: "var(--text-muted)", fontSize: 11 }}>لا يوجد مسافرون</div>}
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
        <button onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.06)"; e.currentTarget.style.borderColor = "var(--em7)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--line)"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> رحلة جديدة</button>
        {flights.length > 0 && <button onClick={printAll} style={btnS()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة الكل</button>}
      </div>
      {!flights.length ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: 12 }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.2" strokeLinecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4.5 1.5-4.5 1.5L6 8 0 9.7l3.3 3.3-1.2 5.6L6 17l1.4 3.8L12 18l2 2z"/></svg><br />لا يوجد رحلات بعد</div> : (
        <>{renderGroup(goFlights, "ذهاب")}{renderGroup(retFlights, "إياب")}</>
      )}

      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNameError(""); }} title="رحلة جديدة" maxWidth={380}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع الرحلة</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["ذهاب", "إياب"] as const).map(t => (
              <div key={t} onClick={() => setFlightType(t)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${flightType === t ? (t === "ذهاب" ? "var(--info)" : "var(--female-fg)") : "var(--border)"}`, background: flightType === t ? (t === "ذهاب" ? "var(--male-bg)" : "var(--female-bg)") : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: flightType === t ? (t === "ذهاب" ? "var(--info)" : "var(--female-fg)") : "var(--text-muted)" }}>
                {t === "ذهاب" ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4.5 1.5-4.5 1.5L6 8 0 9.7l3.3 3.3-1.2 5.6L6 17l1.4 3.8L12 18l2 2z"/></svg> ذهاب</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4.5 1.5-4.5 1.5L6 8 0 9.7l3.3 3.3-1.2 5.6L6 17l1.4 3.8L12 18l2 2z"/></svg> إياب</>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>رقم الرحلة</div>
          <input style={{ ...inp, borderColor: nameError ? "var(--danger)" : "var(--border)" }} value={flightName} onChange={e => { setFlightName(e.target.value); setNameError(""); }} placeholder="مثال: QR501" autoFocus onKeyDown={e => e.key === "Enter" && addFlight()} />
          {nameError && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 3 }}>{nameError}</div>}
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>الشركة</div>
          <input style={inp} value={airline} onChange={e => setAirline(e.target.value)} placeholder="مثال: Qatar Airways" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>التاريخ</div><input style={inp} type="date" value={flightDate} onChange={e => setFlightDate(e.target.value)} /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>الوقت</div><input style={inp} type="time" value={flightTime} onChange={e => setFlightTime(e.target.value)} /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>من</div><input style={inp} value={fromAirport} onChange={e => setFromAirport(e.target.value)} placeholder="الدوحة DOH" /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>إلى</div><input style={inp} value={toAirport} onChange={e => setToAirport(e.target.value)} placeholder="جدة JED" /></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addFlight} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button>
          <button onClick={() => { setShowAdd(false); setNameError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>

      <Modal show={showAddP} onClose={() => setShowAddP(false)} title={`إضافة — ${currentFlight?.name} (${currentFlight?.type})`}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {(["عادي", ...(allSelectedWantFirst ? ["درجة أولى"] : [])] as string[]).map(cls => (
            <div key={cls} onClick={() => setAddFlightClass(cls)} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1.5px solid ${addFlightClass === cls ? "var(--em7)" : "var(--border)"}`, background: addFlightClass === cls ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: addFlightClass === cls ? "var(--em7)" : "var(--text-muted)" }}>
              {cls === "درجة أولى" ? "درجة أولى" : "عادي"}
            </div>
          ))}
          {!allSelectedWantFirst && selectedP.size > 0 && <div style={{ fontSize: 10, color: "var(--text-muted)", alignSelf: "center" }}>درجة أولى متاحة بس للي طلبوها</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "var(--text-muted)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21-4.35-4.35"/></svg></span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={pSearch} onChange={e => setPSearch(e.target.value)} />
        </div>
        {filteredP.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, padding: "1rem" }}>لا يوجد مسافرين متاحين</div> :
          filteredP.map(p => {
            const isSel = selectedP.has(p.id);
            const wantsFirst = p.services?.flight === "درجة أولى";
            return (
              <div key={p.id} onClick={() => toggleSelectP(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: "pointer", background: isSel ? "rgba(125,31,60,.08)" : wantsFirst ? "var(--warning-bg)" : "transparent", border: `0.5px solid ${isSel ? "var(--em7)" : wantsFirst ? "var(--accent)" : "transparent"}` }}>
                <Avatar name={p.name_ar} gender={p.gender} size={28} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar || p.name_ar}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.nat}</div>
                </div>
                {wantsFirst && <span style={{ fontSize: 9, background: "var(--warning-bg)", color: "var(--warning)", padding: "1px 5px", borderRadius: 99 }}>⭐ طلب أولى</span>}
                {isSel && <span style={{ color: "var(--em7)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></span>}
              </div>
            );
          })}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={confirmAddP} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة ({selectedP.size})</button>
          <button onClick={() => setShowAddP(false)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}

// ===== ملخص صفحة الباصات =====
function BusesStats({ buses, passengers }: { buses: Bus[]; passengers: Passenger[] }) {
  const stats = useMemo(() => {
    const total = passengers.length;
    const assignedCount = passengers.filter(p => p.bus_id != null).length;
    const unassigned = total - assignedCount;
    const vipRequested = passengers.filter(p => p.services?.bus === "VIP").length;
    return { total, assignedCount, unassigned, vipRequested };
  }, [buses, passengers]);
  const { total, assignedCount, unassigned, vipRequested } = stats;

  const cards = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", border: "#c8a24b", clr: "var(--em8)", bg: "var(--paper)" },
    { label: "موزّعون", num: assignedCount, sub: `${total ? Math.round(assignedCount/total*100) : 0}٪ من الإجمالي`, border: "#2A9D8F", clr: "#2A9D8F", bg: "rgba(42,157,143,0.05)" },
    { label: "غير موزّعين", num: unassigned, sub: unassigned > 0 ? "يحتاج توزيع" : "مكتمل", border: unassigned > 0 ? "#c0392b" : "#ccc", clr: unassigned > 0 ? "#c0392b" : "var(--muted)", bg: unassigned > 0 ? "rgba(192,57,43,0.05)" : "var(--paper)" },
    { label: "طالبين VIP", num: vipRequested, sub: `${total ? Math.round(vipRequested/total*100) : 0}٪ من الإجمالي`, border: "#E8951A", clr: "#E8951A", bg: "rgba(232,149,26,0.05)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--ivory)" }}>
      {cards.map(({ label, num, sub, border, clr, bg }) => (
        <div key={label} style={{ background: bg, border: "1.5px solid var(--line)", borderRight: `4px solid ${border}`, borderRadius: 10, padding: "11px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 5 }}>{label}</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 700, lineHeight: 1, color: clr }}>{num}</div>
          <div style={{ fontSize: 11, marginTop: 4, color: "var(--g7)" }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}


// ===== ملخص صفحة المخيمات =====
function CampsStats({ camps, passengers, campIdKey, campServiceKey }: { camps: Camp[]; passengers: Passenger[]; campIdKey: string; campServiceKey: string }) {
  const stats = useMemo(() => {
    const total = passengers.length;
    const assignedCount = passengers.filter(p => (p as any)[campIdKey] != null).length;
    const unassigned = total - assignedCount;
    const specialRequested = passengers.filter(p => (p.services as any)?.[campServiceKey] === "خاص").length;
    return { total, assignedCount, unassigned, specialRequested };
  }, [camps, passengers, campIdKey, campServiceKey]);
  const { total, assignedCount, unassigned, specialRequested } = stats;

  const cards = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", border: "#c8a24b", clr: "var(--em8)", bg: "var(--paper)" },
    { label: "موزّعون", num: assignedCount, sub: `${total ? Math.round(assignedCount/total*100) : 0}٪ من الإجمالي`, border: "#2A9D8F", clr: "#2A9D8F", bg: "rgba(42,157,143,0.05)" },
    { label: "غير موزّعين", num: unassigned, sub: unassigned > 0 ? "يحتاج توزيع" : "مكتمل", border: unassigned > 0 ? "#c0392b" : "#ccc", clr: unassigned > 0 ? "#c0392b" : "var(--muted)", bg: unassigned > 0 ? "rgba(192,57,43,0.05)" : "var(--paper)" },
    { label: "طالبين خاص", num: specialRequested, sub: `${total ? Math.round(specialRequested/total*100) : 0}٪ من الإجمالي`, border: "#E8951A", clr: "#E8951A", bg: "rgba(232,149,26,0.05)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--ivory)" }}>
      {cards.map(({ label, num, sub, border, clr, bg }) => (
        <div key={label} style={{ background: bg, border: "1.5px solid var(--line)", borderRight: `4px solid ${border}`, borderRadius: 10, padding: "11px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 5 }}>{label}</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 700, lineHeight: 1, color: clr }}>{num}</div>
          <div style={{ fontSize: 11, marginTop: 4, color: "var(--g7)" }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}

// ===== ملخص صفحة الفندق =====
function HotelStats({ rooms, passengers }: { rooms: Room[]; passengers: Passenger[] }) {
  const stats = useMemo(() => {
    const total = passengers.length;
    const assignedCount = passengers.filter(p => p.room_id != null).length;
    const unassigned = total - assignedCount;
    const viewRequested = passengers.filter(p => p.services?.hotel_view === "مطلة").length;
    return { total, assignedCount, unassigned, viewRequested };
  }, [rooms, passengers]);
  const { total, assignedCount, unassigned, viewRequested } = stats;

  // أنواع الغرف
  const roomTypes = ROOM_TYPES.map(t => ({
    type: t,
    count: rooms.filter(r => r.type === t).length,
    requested: passengers.filter(p => p.services?.hotel_type === t).length,
    colors: ROOM_COLORS[t],
  })).filter(r => r.count > 0 || r.requested > 0);

  const cards = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", border: "#c8a24b", clr: "var(--em8)", bg: "var(--paper)" },
    { label: "موزّعون", num: assignedCount, sub: `${total ? Math.round(assignedCount/total*100) : 0}٪ من الإجمالي`, border: "#2A9D8F", clr: "#2A9D8F", bg: "rgba(42,157,143,0.05)" },
    { label: "غير موزّعين", num: unassigned, sub: unassigned > 0 ? "يحتاج توزيع" : "مكتمل", border: unassigned > 0 ? "#c0392b" : "#ccc", clr: unassigned > 0 ? "#c0392b" : "var(--muted)", bg: unassigned > 0 ? "rgba(192,57,43,0.05)" : "var(--paper)" },
    { label: "طالبين مطل", num: viewRequested, sub: `${total ? Math.round(viewRequested/total*100) : 0}٪ من الإجمالي`, border: "#4A90D9", clr: "#4A90D9", bg: "rgba(74,144,217,0.05)" },
  ];

  return (
    <div style={{ borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--ivory)" }}>
      {/* الصف الأول — الإحصائيات */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "10px 14px 8px" }}>
        {cards.map(({ label, num, sub, border, clr, bg }) => (
          <div key={label} style={{ background: bg, border: "1.5px solid var(--line)", borderRight: `4px solid ${border}`, borderRadius: 10, padding: "11px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 5 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 700, lineHeight: 1, color: clr }}>{num}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: "var(--g7)" }}>{sub}</div>
          </div>
        ))}
      </div>
      {/* الصف الثاني — أنواع الغرف */}
      {roomTypes.length > 0 && (
        <div style={{ display: "flex", gap: 6, padding: "0 14px 10px", alignItems: "center" }}>
          <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600, marginLeft: 4 }}>الغرف:</span>
          {roomTypes.map(({ type, count, requested, colors }) => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: 5, background: colors[0], border: `1px solid ${colors[1]}22`, borderRadius: 7, padding: "4px 10px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors[1] }}>{type}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: colors[1], fontFamily: "var(--font-heading)" }}>{count}</span>
              <span style={{ fontSize: 10, color: colors[1], opacity: 0.7 }}>/ طلب {requested}</span>
            </div>
          ))}
        </div>
      )}
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
    if (error) { alert(`❌ فشل في إضافة الباص: ${error.message || "يرجى المحاولة مرة أخرى"}`); return; }
    if (!error && data?.[0]) {
      const newBus = data[0] as Bus;
      setBuses(prev => [...prev, newBus]);
      setExpanded(prev => new Set([...prev, newBus.id]));
      setBusName(""); setBusType("عادي"); setShowAdd(false);
    }
  };

  const deleteBus = async (id: number) => {
    if (getBusPassengers(id).length > 0) { alert("مش هينفع تمسح باص فيه مسافرين!"); return; }
    const { error } = await supabase.from("buses").delete().eq("id", id);
    if (error) { alert(`❌ فشل في حذف الباص: ${error.message}`); return; }
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
      setPassengers((passengers as Passenger[]).map(p => familyToAdd.some((f: Passenger) => f.id === p.id) ? { ...p, bus_id: currentBusId } : p));
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
    w.document.write(`<html><head><title>${bus.name}</title><style>body{font-family:Arial;direction:rtl;padding:20px}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:#1D9E75;color:white}</style></head><body><h2>${bus.name} ${bus.type === "VIP" ? "(VIP)" : ""}</h2><table><tr><th>م</th><th>الاسم</th></tr>${bp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };

  const printAll = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>تقرير الباصات</title><style>body{font-family:Arial;direction:rtl;padding:20px}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{border:1px solid #ccc;padding:7px;text-align:right}th{background:#1D9E75;color:white}@media print{.bus{page-break-after:always}}</style></head><body><h1>تقرير الباصات</h1>${buses.map(bus => { const bp = getBusPassengers(bus.id); return `<div class="bus"><h2>${bus.name} ${bus.type === "VIP" ? "(VIP)" : ""}</h2><table><tr><th>م</th><th>الاسم</th></tr>${bp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table></div>`; }).join("")}<script>window.print();</script></body></html>`);
    w.document.close();
  };

  const currentBus = buses.find(b => b.id === currentBusId);
  const filteredP = passengers.filter(p => !pSearch || p.name_ar.includes(pSearch));

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <BusesStats buses={buses} passengers={passengers} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.06)"; e.currentTarget.style.borderColor = "var(--em7)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--line)"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> باص جديد</button>
        {buses.length > 0 && <button onClick={printAll} style={btnS()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة الكل</button>}
      </div>
      {!buses.length ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: 12 }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg><br />لا يوجد باصات بعد</div> :
        buses.map(bus => {
          const isExpanded = expanded.has(bus.id);
          const bp = getBusPassengers(bus.id);
          const isVIP = bus.type === "VIP";
          return (
            <div key={bus.id} style={{ border: `0.5px solid ${isVIP ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
              <div onClick={() => toggleBus(bus.id)} style={{ padding: "10px 12px", background: isVIP ? "var(--warning-bg)" : "var(--bg-2)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 18 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>{bus.name} <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isVIP ? "var(--warning-bg)" : "var(--info-bg)", color: isVIP ? "var(--warning)" : "var(--info)" }}>{isVIP ? "VIP" : "عادي"}</span></div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{bp.length} مسافر</div>
                </div>
                <button onClick={e => { e.stopPropagation(); printBus(bus); }} title="طباعة" style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--muted)", transition: "var(--transition)" }} onMouseEnter={e => { e.currentTarget.style.background = "var(--ivory2)"; e.currentTarget.style.color = "var(--ink)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.color = "var(--muted)"; }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
                <button onClick={e => { e.stopPropagation(); openAddP(bus.id); }} title="إضافة مسافر" style={{ height: 30, padding: "0 12px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(125,31,60,0.08)", border: "1px solid rgba(125,31,60,0.2)", cursor: "pointer", color: "var(--em7)", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-body)", transition: "var(--transition)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.15)"; }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(125,31,60,0.08)"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> إضافة</button>
                <button onClick={e => { e.stopPropagation(); deleteBus(bus.id); }} title="حذف الباص" style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: bp.length === 0 ? "var(--fb)" : "var(--paper)", border: `1px solid ${bp.length === 0 ? "rgba(122,46,69,0.2)" : "var(--line)"}`, cursor: bp.length === 0 ? "pointer" : "not-allowed", color: bp.length === 0 ? "var(--ff)" : "var(--text-muted)", transition: "var(--transition)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {isExpanded && (
                <div style={{ padding: "8px 12px", borderTop: `0.5px solid ${isVIP ? "var(--accent)" : "var(--border)"}` }}>
                  {bp.length ? bp.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 4px", borderRadius: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", width: 18, textAlign: "center" }}>{i + 1}</span>
                      <Avatar name={p.name_ar} gender={p.gender} size={24} />
                      <span style={{ fontSize: 11, flex: 1 }}>{p.short_ar || p.name_ar}</span>
                      {p.services?.bus === "VIP" && <span style={{ fontSize: 9, background: "var(--warning-bg)", color: "var(--warning)", padding: "1px 5px", borderRadius: 99 }}>VIP</span>}
                      <select onChange={e => moveP(p.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}>
                        <option value="">نقل لـ...</option>
                        {buses.filter(b => b.id !== bus.id).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <button onClick={() => removeP(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--border)", fontSize: 12 }}>✕</button>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "10px", color: "var(--text-muted)", fontSize: 11 }}>لا يوجد مسافرون</div>}
                </div>
              )}
            </div>
          );
        })}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNameError(""); }} title="إضافة باص جديد" maxWidth={340}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>اسم الباص</div>
          <input style={{ ...inp, borderColor: nameError ? "var(--danger)" : "var(--border)" }} value={busName} onChange={e => { setBusName(e.target.value); setNameError(""); }} placeholder="مثال: باص 1" autoFocus onKeyDown={e => e.key === "Enter" && addBus()} />
          {nameError && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>{nameError}</div>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع الباص</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["عادي", "VIP"].map(t => <div key={t} onClick={() => setBusType(t)} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1.5px solid ${busType === t ? "var(--em7)" : "var(--border)"}`, background: busType === t ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: busType === t ? "var(--em7)" : "var(--text-muted)" }}>{t === "VIP" ? "VIP" : "عادي"}</div>)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addBus} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button>
          <button onClick={() => { setShowAdd(false); setNameError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
      <Modal show={showAddP} onClose={() => setShowAddP(false)} title={`إضافة مسافرين — ${currentBus?.name}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "var(--text-muted)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21-4.35-4.35"/></svg></span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={pSearch} onChange={e => setPSearch(e.target.value)} />
        </div>
        {filteredP.map(p => {
          const isAssigned = p.bus_id != null && p.bus_id !== currentBusId;
          const isInBus = p.bus_id === currentBusId;
          const isSel = selectedP.has(p.id);
          return (
            <div key={p.id} onClick={() => !isAssigned && !isInBus && toggleSelectP(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: isAssigned || isInBus ? "not-allowed" : "pointer", background: isSel ? "rgba(125,31,60,.08)" : p.services?.bus === "VIP" ? "var(--warning-bg)" : "transparent", border: `0.5px solid ${isSel ? "var(--em7)" : p.services?.bus === "VIP" ? "var(--accent)" : "transparent"}`, opacity: isAssigned ? 0.4 : 1 }}>
              <Avatar name={p.name_ar} gender={p.gender} size={28} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar || p.name_ar}</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>{isInBus ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> في هذا الباص</> : isAssigned ? "موزّع" : "غير موزّع"}</div></div>
              {p.services?.bus === "VIP" && <span style={{ fontSize: 9, background: "var(--warning-bg)", color: "var(--warning)", padding: "1px 5px", borderRadius: 99 }}>VIP</span>}
              {isSel && <span style={{ color: "var(--em7)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></span>}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={confirmAddP} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة ({selectedP.size})</button>
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
  const icon = pageType === "منى" ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>`;

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
    if (error) { alert(`❌ فشل في إضافة المخيم: ${error.message || "يرجى المحاولة مرة أخرى"}`); return; }
    if (!error && data?.[0]) {
      setCamps(prev => [...prev, data[0] as Camp]);
      setExpanded(prev => new Set([...prev, data[0].id]));
      setCampName(""); setCampGender("ذكر"); setCampType("عادي"); setShowAdd(false);
    }
  };

  const deleteCamp = async (id: number) => {
    if (getCampPassengers(id).length > 0) { alert("أزل المسافرين الأول!"); return; }
    const { error } = await supabase.from("camps").delete().eq("id", id);
    if (error) { alert(`❌ فشل في حذف المخيم: ${error.message}`); return; }
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
      setPassengers((passengers as Passenger[]).map(p => familyToAdd.some((f: Passenger) => f.id === p.id) ? { ...p, [campIdKey]: currentCampId } : p));
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
    w.document.write(`<html><head><title>مخيم ${camp.name}</title><style>body{font-family:Arial;direction:rtl;padding:20px}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:${camp.gender === "ذكر" ? "var(--info)" : "var(--female-fg)"};color:white}</style></head><body><h2>${icon} مخيم ${camp.name} — ${camp.gender === "ذكر" ? "رجال" : "نساء"} (${camp.type})</h2><table><tr><th>م</th><th>الاسم</th></tr>${cp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };

  const printAll = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>مخيمات ${pageType}</title><style>body{font-family:Arial;direction:rtl;padding:20px}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{border:1px solid #ccc;padding:7px;text-align:right}@media print{.c{page-break-after:always}}</style></head><body><h1>${icon} مخيمات ${pageType}</h1>${camps.map(camp => { const cp = getCampPassengers(camp.id); return `<div class="c"><h2 style="background:${camp.gender === "ذكر" ? "var(--info)" : "var(--female-fg)"};color:white;padding:8px;border-radius:6px">مخيم ${camp.name} — ${camp.gender === "ذكر" ? "رجال" : "نساء"}</h2><table><tr><th style="background:#555;color:white">م</th><th style="background:#555;color:white">الاسم</th></tr>${cp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table></div>`; }).join("")}<script>window.print();</script></body></html>`);
    w.document.close();
  };

  const currentCamp = camps.find(c => c.id === currentCampId);
  const genderPool = currentCamp?.type === "خاص" ? passengers : passengers.filter(p => p.gender === currentCamp?.gender);
  const filteredP = genderPool.filter(p => !pSearch || p.name_ar.includes(pSearch));
  const maleCamps = camps.filter(c => c.gender === "ذكر");
  const femaleCamps = camps.filter(c => c.gender === "أنثى");

  const renderGroup = (groupCamps: Camp[], gender: "ذكر" | "أنثى") => (
    <div style={{ marginBottom: 16 }}>
      <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 99, background: gender === "ذكر" ? "var(--male-bg)" : "var(--female-bg)", color: gender === "ذكر" ? "var(--info)" : "var(--female-fg)", display: "inline-block", marginBottom: 10 }}>
        {gender === "ذكر" ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> رجال</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> نساء</>} ({groupCamps.length})
      </span>
      {groupCamps.length === 0 ? <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "6px 0" }}>لا يوجد مخيمات بعد</div> :
        groupCamps.map(camp => {
          const isExpanded = expanded.has(camp.id);
          const cp = getCampPassengers(camp.id);
          const sameCamps = camps.filter(c => c.id !== camp.id && c.gender === camp.gender);
          const isSpecial = camp.type === "خاص";
          return (
            <div key={camp.id} style={{ border: `0.5px solid ${isSpecial ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
              <div onClick={() => toggleCamp(camp.id)} style={{ padding: "9px 12px", background: isSpecial ? "var(--warning-bg)" : "var(--bg-2)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <span style={{ display:"flex", alignItems:"center" }} dangerouslySetInnerHTML={{ __html: icon }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>مخيم {camp.name} <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isSpecial ? "var(--warning-bg)" : "var(--bg-2)", color: isSpecial ? "var(--warning)" : "var(--text-muted)" }}>{isSpecial ? "خاص" : "عادي"}</span></div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{cp.length} مسافر</div>
                </div>
                <button onClick={e => { e.stopPropagation(); printCamp(camp); }} style={{ background: "var(--bg-2)", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
                <button onClick={e => { e.stopPropagation(); openAddP(camp.id); }} title="إضافة مسافر" style={{ height: 30, padding: "0 12px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(125,31,60,0.08)", border: "1px solid rgba(125,31,60,0.2)", cursor: "pointer", color: "var(--em7)", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-body)", transition: "var(--transition)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.15)"; }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(125,31,60,0.08)"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> إضافة</button>
                <button onClick={e => { e.stopPropagation(); deleteCamp(camp.id); }} title="حذف الخيمة" style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: cp.length === 0 ? "var(--fb)" : "var(--paper)", border: `1px solid ${cp.length === 0 ? "rgba(122,46,69,0.2)" : "var(--line)"}`, cursor: cp.length === 0 ? "pointer" : "not-allowed", color: cp.length === 0 ? "var(--ff)" : "var(--text-muted)", transition: "var(--transition)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {isExpanded && (
                <div style={{ padding: "8px 12px", borderTop: `0.5px solid ${isSpecial ? "var(--accent)" : "var(--border)"}` }}>
                  {cp.length ? cp.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 4px", borderRadius: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", width: 18, textAlign: "center" }}>{i + 1}</span>
                      <Avatar name={p.name_ar} gender={p.gender} size={24} />
                      <span style={{ fontSize: 11, flex: 1 }}>{p.short_ar}</span>
                      {(p.services as any)[serviceKey] === "خاص" && <span style={{ fontSize: 9, background: "var(--warning-bg)", color: "var(--warning)", padding: "1px 5px", borderRadius: 99 }}>⭐ خاص</span>}
                      {sameCamps.length > 0 && <select onChange={e => moveP(p.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}><option value="">نقل لـ...</option>{sameCamps.map(c => <option key={c.id} value={c.id}>مخيم {c.name}</option>)}</select>}
                      <button onClick={() => removeP(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--border)", fontSize: 12 }}>✕</button>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "10px", color: "var(--text-muted)", fontSize: 11 }}>لا يوجد مسافرون</div>}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <CampsStats camps={camps} passengers={passengers} campIdKey={campIdKey} campServiceKey={pageType === "منى" ? "camp_mina" : "camp_arafa"} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.06)"; e.currentTarget.style.borderColor = "var(--em7)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--line)"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> مخيم جديد</button>
        {camps.length > 0 && <button onClick={printAll} style={btnS()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة الكل</button>}
      </div>
      {!camps.length ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: 12 }}><div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>لا يوجد مخيمات بعد</div> : (<>{renderGroup(maleCamps, "ذكر")}{renderGroup(femaleCamps, "أنثى")}</>)}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNameError(""); }} title={`${icon} مخيم جديد`} maxWidth={340}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>رقم / اسم المخيم</div>
          <input style={{ ...inp, borderColor: nameError ? "var(--danger)" : "var(--border)" }} value={campName} onChange={e => { setCampName(e.target.value); setNameError(""); }} autoFocus onKeyDown={e => e.key === "Enter" && addCamp()} />
          {nameError && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>{nameError}</div>}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>الجنس</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["ذكر", "أنثى"] as const).map(g => <div key={g} onClick={() => setCampGender(g)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1.5px solid ${campGender === g ? (g === "ذكر" ? "var(--info)" : "var(--female-fg)") : "var(--border)"}`, background: campGender === g ? (g === "ذكر" ? "var(--male-bg)" : "var(--female-bg)") : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: campGender === g ? (g === "ذكر" ? "var(--info)" : "var(--female-fg)") : "var(--text-muted)" }}>{g === "ذكر" ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> رجال</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> نساء</>}</div>)}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع الخيمة</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["عادي", "خاص"] as const).map(t => <div key={t} onClick={() => setCampType(t)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1.5px solid ${campType === t ? "var(--em7)" : "var(--border)"}`, background: campType === t ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: campType === t ? "var(--em7)" : "var(--text-muted)" }}>{t === "خاص" ? "خاص" : "عادي"}</div>)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addCamp} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button>
          <button onClick={() => { setShowAdd(false); setNameError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
      <Modal show={showAddP} onClose={() => setShowAddP(false)} title={`إضافة ${currentCamp?.gender === "ذكر" ? "رجال" : "نساء"} — مخيم ${currentCamp?.name}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "var(--text-muted)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21-4.35-4.35"/></svg></span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={pSearch} onChange={e => setPSearch(e.target.value)} />
        </div>
        {filteredP.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, padding: "1rem" }}>لا يوجد مسافرين</div> :
          filteredP.map(p => {
            const isInCamp = (p as any)[campIdKey] === currentCampId;
            const isAssigned = (p as any)[campIdKey] != null && !isInCamp;
            const isSel = selectedP.has(p.id);
            const wantsSpecial = (p.services as any)[serviceKey] === "خاص";
            return (
              <div key={p.id} onClick={() => !isAssigned && !isInCamp && toggleSelectP(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: isAssigned || isInCamp ? "not-allowed" : "pointer", background: isSel ? "rgba(125,31,60,.08)" : wantsSpecial ? "var(--warning-bg)" : "transparent", border: `0.5px solid ${isSel ? "var(--em7)" : wantsSpecial ? "var(--accent)" : "transparent"}`, opacity: isAssigned ? 0.4 : 1 }}>
                <Avatar name={p.name_ar} gender={p.gender} size={28} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar}</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>{isInCamp ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> في المخيم</> : isAssigned ? "موزّع" : "غير موزّع"}</div></div>
                {wantsSpecial && <span style={{ fontSize: 9, background: "var(--warning-bg)", color: "var(--warning)", padding: "1px 5px", borderRadius: 99 }}>⭐ خاص</span>}
                {isSel && <span style={{ color: "var(--em7)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></span>}
              </div>
            );
          })}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={confirmAddP} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة ({selectedP.size})</button>
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
      const [bg] = ROOM_COLORS[room.type] || ["var(--bg-2)"];
      return `<div style="margin-bottom:12px"><div style="background:${bg};padding:5px 10px;border:1px solid #ddd;border-bottom:none;font-size:11px;font-weight:bold;display:flex;justify-content:space-between"><span>${room.type}</span><span>${room.number}${room.floor ? ` (طابق ${room.floor})` : ""}</span></div><table style="width:100%;border-collapse:collapse;font-size:11px"><tr style="background:#f5f5f5"><th style="padding:4px 8px;border:1px solid #ddd;text-align:center;width:28px">م</th><th style="padding:4px 8px;border:1px solid #ddd;text-align:right">الاسم</th></tr>${rp.map((p, i) => `<tr><td style="padding:4px 8px;border:1px solid #ddd;text-align:center">${i + 1}</td><td style="padding:4px 8px;border:1px solid #ddd">${p.short_ar}</td></tr>`).join("")}</table></div>`;
    };
    w.document.write(`<html><head><title>تقرير الفندق</title><style>body{font-family:Arial;direction:rtl;padding:16px}h1{text-align:center}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}</style></head><body><h1>تقرير الفندق</h1><div class="grid"><div>${left.map(renderRoom).join("")}</div><div>${right.map(renderRoom).join("")}</div></div><script>window.print();</script></body></html>`);
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
        <button onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.06)"; e.currentTarget.style.borderColor = "var(--em7)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--line)"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> غرفة جديدة</button>
        <button onClick={() => setShowRange(true)} style={btnS({ flex: 1 })}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> نطاق</button>
        <button onClick={() => fileRef.current?.click()} style={btnS({ flex: 1 })}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg> Excel</button>
        {rooms.length > 0 && <button onClick={() => setShowPrint(true)} style={btnS({ flex: 1 })}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة</button>}
        <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleExcel(e.target.files[0])} />
      </div>
      {!rooms.length ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: 12 }}><div style={{ fontSize: 32, marginBottom: 8 }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/></svg></div>لا يوجد غرف بعد</div> : (
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden" }}>
          {rooms.map(room => {
          const isExpanded = expanded.has(room.id);
          const rp = getRoomPassengers(room.id);
          const [typeBg, typeClr] = ROOM_COLORS[room.type] || ["var(--bg-2)", "var(--text)"];
          return (
            <div key={room.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
              <div onClick={() => toggleRoom(room.id)} style={{ padding: "9px 12px", background: "var(--bg-2)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: typeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>غرفة {room.number} {room.floor && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>ط{room.floor}</span>} <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: typeBg, color: typeClr }}>{room.type}</span></div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{rp.length} مسافر</div>
                </div>
                <button onClick={e => { e.stopPropagation(); openAddP(room.id); }} style={{ background: "var(--success-bg)", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", color: "var(--primary-dark)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> إضافة</button>
                <button onClick={e => { e.stopPropagation(); deleteRoom(room.id); }} style={{ background: rp.length === 0 ? "var(--female-bg)" : "var(--bg-2)", border: "none", padding: "3px 7px", borderRadius: 6, fontSize: 11, cursor: rp.length === 0 ? "pointer" : "not-allowed", color: rp.length === 0 ? "var(--danger)" : "var(--border)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {isExpanded && (
                <div style={{ padding: "8px 12px", borderTop: "0.5px solid #e5e5e5" }}>
                  {rp.length ? rp.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 4px", borderRadius: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", width: 18, textAlign: "center" }}>{i + 1}</span>
                      <Avatar name={p.name_ar} gender={p.gender} size={24} />
                      <span style={{ fontSize: 11, flex: 1 }}>{p.short_ar}</span>
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: ROOM_COLORS[p.services.hotel_type]?.[0] || "var(--bg-2)", color: ROOM_COLORS[p.services.hotel_type]?.[1] || "var(--text-muted)" }}>{p.services.hotel_type} {p.services.hotel_view}</span>
                      {p.services.hotel_type !== room.type && <span style={{ fontSize: 9, color: "var(--warning)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>}
                      <select onChange={e => moveP(p.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}><option value="">نقل لـ...</option>{rooms.filter(r => r.id !== room.id).map(r => <option key={r.id} value={r.id}>غرفة {r.number}</option>)}</select>
                      <button onClick={() => removeP(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--border)", fontSize: 12 }}>✕</button>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "10px", color: "var(--text-muted)", fontSize: 11 }}>لا يوجد مسافرون</div>}
                </div>
              )}
            </div>
          );
          })}
        </div>
      )}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNumberError(""); }} title="غرفة جديدة" maxWidth={340}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>رقم الغرفة</div><input style={{ ...inp, borderColor: numberError ? "var(--danger)" : "var(--border)" }} value={roomNumber} onChange={e => { setRoomNumber(e.target.value); setNumberError(""); }} autoFocus onKeyDown={e => e.key === "Enter" && addRoom()} />{numberError && <div style={{ fontSize: 10, color: "var(--danger)", marginTop: 3 }}>{numberError}</div>}</div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>الطابق</div><input style={inp} value={roomFloor} onChange={e => setRoomFloor(e.target.value)} placeholder="مثال: 16" /></div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع الغرفة</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {ROOM_TYPES.map(t => { const [bg, clr] = ROOM_COLORS[t]; return <div key={t} onClick={() => setRoomType(t)} style={{ flex: 1, minWidth: "45%", padding: 7, borderRadius: 8, border: `1.5px solid ${roomType === t ? clr : "var(--border)"}`, background: roomType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: roomType === t ? clr : "var(--text-muted)" }}>{t}</div>; })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}><button onClick={addRoom} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button><button onClick={() => { setShowAdd(false); setNumberError(""); }} style={btnS()}>إلغاء</button></div>
      </Modal>
      <Modal show={showRange} onClose={() => { setShowRange(false); setRangeError(""); }} title="إضافة نطاق غرف" maxWidth={360}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>من رقم</div><input style={inp} type="number" value={rangeFrom} onChange={e => { setRangeFrom(e.target.value); setRangeError(""); }} /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>إلى رقم</div><input style={inp} type="number" value={rangeTo} onChange={e => { setRangeTo(e.target.value); setRangeError(""); }} /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>الطابق</div><input style={inp} value={rangeFloor} onChange={e => setRangeFloor(e.target.value)} /></div>
        </div>
        {rangeError && <div style={{ fontSize: 11, color: "var(--danger)", marginBottom: 8 }}>{rangeError}</div>}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع الغرف</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {ROOM_TYPES.map(t => { const [bg, clr] = ROOM_COLORS[t]; return <div key={t} onClick={() => setRangeType(t)} style={{ flex: 1, minWidth: "45%", padding: 7, borderRadius: 8, border: `1.5px solid ${rangeType === t ? clr : "var(--border)"}`, background: rangeType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: rangeType === t ? clr : "var(--text-muted)" }}>{t}</div>; })}
          </div>
        </div>
        {rangeFrom && rangeTo && parseInt(rangeFrom) <= parseInt(rangeTo) && <div style={{ fontSize: 11, color: "var(--em7)", marginBottom: 10, background: "rgba(125,31,60,.06)", padding: "6px 10px", borderRadius: 8 }}>سيتم إضافة {parseInt(rangeTo) - parseInt(rangeFrom) + 1} غرفة</div>}
        <div style={{ display: "flex", gap: 8 }}><button onClick={addRange} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button><button onClick={() => { setShowRange(false); setRangeError(""); }} style={btnS()}>إلغاء</button></div>
      </Modal>
      <Modal show={showAddP} onClose={() => setShowAddP(false)} title={`إضافة مسافرين — غرفة ${currentRoom?.number}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "var(--text-muted)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21-4.35-4.35"/></svg></span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={pSearch} onChange={e => setPSearch(e.target.value)} />
        </div>
        {filteredP.map(p => {
          const isInRoom = p.room_id === currentRoomId;
          const isAssigned = p.room_id != null && !isInRoom;
          const isSel = selectedP.has(p.id);
          const [reqBg, reqClr] = ROOM_COLORS[p.services.hotel_type] || ["var(--bg-2)", "var(--text-muted)"];
          return (
            <div key={p.id} onClick={() => !isAssigned && !isInRoom && toggleSelectP(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: isAssigned || isInRoom ? "not-allowed" : "pointer", background: isSel ? "rgba(125,31,60,.08)" : "transparent", border: `0.5px solid ${isSel ? "var(--em7)" : "transparent"}`, opacity: isAssigned ? 0.4 : 1 }}>
              <Avatar name={p.name_ar} gender={p.gender} size={28} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar}</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>{isInRoom ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> في الغرفة</> : isAssigned ? "موزّع" : "غير موزّع"}</div></div>
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: reqBg, color: reqClr }}>{p.services.hotel_type} {p.services.hotel_view}</span>
              {isSel && <span style={{ color: "var(--em7)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></span>}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button onClick={confirmAddP} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة ({selectedP.size})</button><button onClick={() => setShowAddP(false)} style={btnS()}>إلغاء</button></div>
      </Modal>
      <Modal show={showPrint} onClose={() => setShowPrint(false)} title="خيارات الطباعة" maxWidth={340}>
        {[["all", "طباعة كل الغرف"], ["floor", "طباعة دور معين"], ["type", "طباعة نوع معين"]].map(([val, label]) => (
          <div key={val} onClick={() => setPrintFilter(val as any)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 6, background: printFilter === val ? "rgba(125,31,60,.08)" : "var(--bg-2)", border: `0.5px solid ${printFilter === val ? "var(--em7)" : "var(--border)"}` }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", background: printFilter === val ? "var(--em7)" : "var(--bg-card)", border: `2px solid ${printFilter === val ? "var(--em7)" : "var(--border)"}` }} />
            <span style={{ fontSize: 12 }}>{label}</span>
          </div>
        ))}
        {printFilter === "floor" && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>اختر الطابق</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {floors.map(f => <div key={f} onClick={() => setPrintFloor(f)} style={{ padding: "5px 12px", borderRadius: 99, border: `1.5px solid ${printFloor === f ? "var(--em7)" : "var(--border)"}`, background: printFloor === f ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", fontSize: 12, color: printFloor === f ? "var(--em7)" : "var(--text-muted)" }}>طابق {f}</div>)}
            </div>
          </div>
        )}
        {printFilter === "type" && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>اختر نوع الغرفة</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {ROOM_TYPES.map(t => { const [bg, clr] = ROOM_COLORS[t]; return <div key={t} onClick={() => setPrintType(t)} style={{ flex: 1, padding: 6, borderRadius: 8, border: `1.5px solid ${printType === t ? clr : "var(--border)"}`, background: printType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: printType === t ? clr : "var(--text-muted)" }}>{t}</div>; })}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button onClick={handlePrint} style={{ ...btnP(), flex: 1 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة</button><button onClick={() => setShowPrint(false)} style={btnS()}>إلغاء</button></div>
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

  const openDelete = (s: { id: number; name: string; created_at: string }) => { setSeasonToDelete(s); setDeleteStep(1); setShowDelete(true); };

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

  const openSeason = async (season: { id: number; name: string; created_at: string }) => {
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
          <div style={{ background: "var(--warning-bg)", border: "1px solid #e67e22", borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ fontSize: 13, fontWeight: 600 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> إقفال الموسم الحالي</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>إقفال الموسم وبدء موسم حج جديد</div></div>
            <button onClick={() => { setShowClose(true); setCloseStep(1); setNewSeasonName(""); }} style={{ background: "var(--warning)", color: "var(--bg-card)", border: "none", padding: "6px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>إقفال</button>
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>المواسم المحفوظة</div>
        {seasons.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}><div style={{ fontSize: 32, marginBottom: 8 }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/></svg></div><div>لا يوجد مواسم محفوظة بعد</div></div>
        ) : seasons.map(s => (
          <div key={s.id} onClick={() => openSeason(s)} style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "14px 16px", marginBottom: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-card)" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--bg-2)"} onMouseLeave={e => e.currentTarget.style.background = "white"}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--success-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/></svg></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>موسم {s.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>أُقفل: {new Date(s.closed_at).toLocaleDateString("ar-EG")} · بواسطة {s.closed_by}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {currentUser.permissions.view_archive && (
                <button onClick={e => { e.stopPropagation(); openDelete(s); }} style={{ background: "var(--female-bg)", border: "none", padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "var(--danger)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg> مسح</button>
              )}
              <span style={{ color: "var(--border)", fontSize: 18 }}>›</span>
            </div>
          </div>
        ))}
        <Modal show={showClose} onClose={() => setShowClose(false)} title="إقفال الموسم" maxWidth={380}>
          {/* مؤشر الخطوات */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {[1, 2, 3].map(s => (
              <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: closeStep >= s ? "var(--warning)" : "var(--border)" }} />
            ))}
          </div>

          {/* الخطوة 1: تحذير */}
          {closeStep === 1 && (
            <>
              <div style={{ background: "var(--female-bg)", border: "1px solid #e74c3c", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--danger)", marginBottom: 8 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> تنبيه مهم — إقفال الموسم</div>
                <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7 }}>
                  أنت على وشك إقفال الموسم الحالي نهائياً.<br /><br />
                  سيتم نقل جميع البيانات (الحجاج، الباصات، المخيمات، الغرف) إلى الأرشيف، ولن تتمكن من التعديل عليها بعد ذلك — للعرض فقط.<br /><br />
                  سيبدأ موسم جديد فارغ تماماً.<br /><br />
                  <span style={{ fontWeight: 700, color: "var(--danger)" }}>هذا الإجراء لا يمكن التراجع عنه.</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setCloseStep(2)} style={{ background: "var(--warning)", color: "var(--bg-card)", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1 }}>فهمت، التالي ←</button>
                <button onClick={() => setShowClose(false)} style={btnS()}>إلغاء</button>
              </div>
            </>
          )}

          {/* الخطوة 2: اسم الموسم الجديد */}
          {closeStep === 2 && (
            <>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>اكتب اسم الموسم الجديد الذي سيبدأ بعد الإقفال:</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>اسم الموسم الجديد</div>
                <input style={inp} value={newSeasonName} onChange={e => setNewSeasonName(e.target.value)} placeholder="مثال: 1449" autoFocus />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { if (!newSeasonName.trim()) { alert("اكتب اسم الموسم الجديد!"); return; } setCloseStep(3); }} style={{ background: "var(--warning)", color: "var(--bg-card)", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1 }}>التالي ←</button>
                <button onClick={() => setCloseStep(1)} style={btnS()}>→ رجوع</button>
              </div>
            </>
          )}

          {/* الخطوة 3: التأكيد النهائي */}
          {closeStep === 3 && (
            <>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>تأكيد إقفال الموسم</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>سيتم إقفال الموسم الحالي نهائياً<br />وبدء موسم <span style={{ fontWeight: 700, color: "var(--em7)" }}>{newSeasonName}</span></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={closeSeason} disabled={closing} style={{ background: "var(--danger)", color: "var(--bg-card)", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1, opacity: closing ? 0.6 : 1 }}>{closing ? "جاري الإقفال..." : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> إقفال الموسم نهائياً</>}</button>
                <button onClick={() => setCloseStep(2)} disabled={closing} style={btnS()}>→ رجوع</button>
              </div>
            </>
          )}
        </Modal>
        <Modal show={showDelete} onClose={() => setShowDelete(false)} title="مسح موسم من الأرشيف" maxWidth={380}>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {[1, 2, 3].map(s => <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: deleteStep >= s ? "var(--danger)" : "var(--border)" }} />)}
          </div>
          {deleteStep === 1 && (
            <>
              <div style={{ background: "var(--female-bg)", border: "1px solid #e74c3c", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--danger)", marginBottom: 8 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> تحذير — مسح موسم من الأرشيف</div>
                <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7 }}>
                  أنت على وشك مسح موسم <span style={{ fontWeight: 700 }}>{seasonToDelete?.name}</span> نهائياً من الأرشيف.<br /><br />
                  سيتم مسح جميع البيانات المرتبطة بهذا الموسم (الحجاج، الباصات، المخيمات، الغرف) بشكل كامل.<br /><br />
                  <span style={{ fontWeight: 700, color: "var(--danger)" }}>هذا الإجراء لا يمكن التراجع عنه.</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setDeleteStep(2)} style={{ background: "var(--danger)", color: "var(--bg-card)", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1 }}>فهمت، التالي ←</button>
                <button onClick={() => setShowDelete(false)} style={btnS()}>إلغاء</button>
              </div>
            </>
          )}
          {deleteStep === 2 && (
            <>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>هل أنت متأكد 100% إنك عايز تمسح موسم <span style={{ fontWeight: 700, color: "var(--danger)" }}>{seasonToDelete?.name}</span> وكل بياناته؟</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setDeleteStep(3)} style={{ background: "var(--danger)", color: "var(--bg-card)", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1 }}>نعم، متأكد — التالي ←</button>
                <button onClick={() => setDeleteStep(1)} style={btnS()}>→ رجوع</button>
              </div>
            </>
          )}
          {deleteStep === 3 && (
            <>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>تأكيد المسح النهائي</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>سيتم مسح موسم <span style={{ fontWeight: 700, color: "var(--danger)" }}>{seasonToDelete?.name}</span> وكل بياناته نهائياً</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={confirmDelete} disabled={deleting} style={{ background: "var(--danger)", color: "var(--bg-card)", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1, opacity: deleting ? 0.6 : 1 }}>{deleting ? "جاري المسح..." : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg> مسح نهائي</>}</button>
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
        <button onClick={() => setSelected(null)} style={btnS()}>رجوع</button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>موسم {selected.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{data.passengers.length} حاج · للعرض فقط</div>
        </div>
      </div>
      {/* تاب التقارير */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[["passengers", "الحجاج"], ["flight", "الطيران"], ["buses", "الباصات"], ["mina", "منى"], ["arafa", "عرفة"], ["hotel", "الفندق"]].map(([id, label]) => (
          <div key={id} onClick={() => setActiveReport(id)} style={{ padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, background: activeReport === id ? "var(--em7)" : "var(--bg-2)", color: activeReport === id ? "var(--text-inverse)" : "var(--text-muted)", fontWeight: activeReport === id ? 500 : 400 }}>{label}</div>
        ))}
      </div>

      {loading ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>جاري التحميل...</div> : (<>

        {activeReport === "passengers" && (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr style={{ background: "var(--em7)", color: "var(--g3)" }}>{["م", "الاسم", "رقم الجواز", "الجنسية", "الجنس"].map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{data.passengers.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--bg-2)" }}><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{i + 1}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee", fontWeight: 500 }}>{p.name_ar}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.passport}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.nat}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.gender}</td></tr>)}</tbody>
            </table>
            <button onClick={printPassengers} style={{ ...btnS(), width: "100%", marginTop: 12 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة</button>
          </>
        )}

        {activeReport === "flight" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, direction: "ltr" }}>
            <thead><tr style={{ background: "var(--em7)", color: "var(--g3)" }}>{["S.N.", "FULL NAME", "NAT.", "PASSPORT NO.", "GENDER"].map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>{data.passengers.filter(p => p.services?.flight !== "بدون").map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--bg-2)" }}><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{i + 1}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee", fontWeight: 500 }}>{p.name_en}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.nat}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.passport}</td><td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.gender === "ذكر" ? "MR." : "MRS."}</td></tr>)}</tbody>
          </table>
        )}

        {activeReport === "buses" && data.buses.map(bus => {
          const bp = getBusPassengers(bus.id);
          return (
            <div key={bus.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "var(--bg-2)", fontSize: 13, fontWeight: 500 }}>{bus.name} ({bus.type}) · {bp.length} مسافر</div>
              {bp.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead><tr style={{ background: "var(--em7)", color: "var(--g3)" }}><th style={{ padding: "5px 10px" }}>م</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الجنسية</th></tr></thead><tbody>{bp.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--bg-2)" }}><td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center" }}>{i + 1}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.nat}</td></tr>)}</tbody></table>}
            </div>
          );
        })}

        {(activeReport === "mina" || activeReport === "arafa") && data.camps.filter(c => c.page_type === (activeReport === "mina" ? "منى" : "عرفة")).map(camp => {
          const key = activeReport === "mina" ? "camp_mina_id" : "camp_arafa_id";
          const cp = getCampPassengers(camp.id, key);
          return (
            <div key={camp.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "var(--bg-2)", fontSize: 13, fontWeight: 500 }}>{activeReport === "mina" ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>` : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>`} مخيم {camp.name} — {camp.gender === "ذكر" ? "رجال" : "نساء"} · {cp.length} مسافر</div>
              {cp.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead><tr style={{ background: camp.gender === "ذكر" ? "var(--info)" : "var(--female-fg)", color: "var(--bg-card)" }}><th style={{ padding: "5px 10px" }}>م</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th></tr></thead><tbody>{cp.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--bg-2)" }}><td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center" }}>{i + 1}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td></tr>)}</tbody></table>}
            </div>
          );
        })}

        {activeReport === "hotel" && data.rooms.map(room => {
          const rp = getRoomPassengers(room.id);
          return (
            <div key={room.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "var(--bg-2)", fontSize: 13, fontWeight: 500 }}>غرفة {room.number} {room.floor && `(ط${room.floor})`} · {room.type} · {rp.length} مسافر</div>
              {rp.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead><tr style={{ background: "var(--em7)", color: "var(--g3)" }}><th style={{ padding: "5px 10px" }}>م</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الجنس</th></tr></thead><tbody>{rp.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--bg-2)" }}><td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center" }}>{i + 1}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td><td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.gender}</td></tr>)}</tbody></table>}
            </div>
          );
        })}

      </>)}
    </div>
  );
}


// ============================================================
// ReportsPage — النسخة الجديدة الكاملة
// ============================================================

// دالة مساعدة: توليد HTML موحد للطباعة والـ PDF
function makeHTML(title: string, body: string, landscape = false, logoUrl = "") {
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" style="height:60px;object-fit:contain" />`
    : `<div style="width:60px;height:60px;background:#0C447C;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:24px">✈️</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title}</title>
<style>
  @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; direction: rtl; margin: 0; padding: 0; font-size: 10px; color: #222; }
  .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 2px solid #0C447C; padding-bottom: 10px; }
  .page-title { font-size: 20px; font-weight: 700; color: #0C447C; text-align: center; flex: 1; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #0C447C; color: white; padding: 7px 10px; text-align: right; font-size: 10px; }
  td { border: 0.5px solid #ddd; padding: 6px 10px; text-align: right; }
  tr:nth-child(even) td { background: #f5f8ff; }
  .section-title { font-size: 14px; font-weight: 700; color: #0C447C; margin: 14px 0 6px; text-align: center; }
  .page-break { page-break-after: always; }
  .footer { text-align: center; color: #aaa; font-size: 9px; margin-top: 20px; border-top: 0.5px solid #eee; padding-top: 6px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="page-header">
  ${logoHtml}
  <div class="page-title">${title}</div>
  ${logoHtml}
</div>
${body}
<div class="footer">حملة الأقصى — تقرير ${title}</div>
</body></html>`;
}

// دالة: طباعة في نفس الصفحة عبر iframe مخفي
function printInPage(html: string) {
  const existing = document.getElementById("__print_frame__");
  if (existing) existing.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "__print_frame__";
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }, 600);
}

// دالة: تحميل PDF (عبر blob HTML)
function downloadPDF(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ReportsPage({ passengers }: { passengers: Passenger[] }) {
  const config = useConfig();
  const logoUrl = config.logo_url || "";

  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);

  // تقرير الفندق — فلتر الطباعة
  const [hotelPrintFilter, setHotelPrintFilter] = useState<"all" | "floor" | "type">("all");
  const [hotelPrintFloor, setHotelPrintFloor] = useState("");
  const [hotelPrintType, setHotelPrintType] = useState<string>("");
  const floors = [...new Set(rooms.map(r => r.floor).filter(Boolean))].sort();

  // تقرير الطيران — نوع التقرير الفرعي
  const [flightSubReport, setFlightSubReport] = useState<"airline" | "per_flight" | null>(null);

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
      const [{ data: b }, { data: c }, { data: r }, { data: f }] = await Promise.all([
        supabase.from("buses").select("*").order("created_at"),
        supabase.from("camps").select("*").order("created_at"),
        supabase.from("rooms").select("*").order("number"),
        supabase.from("flights").select("*").order("date"),
      ]);
      if (b) setBuses(b as Bus[]);
      if (c) setCamps(c as Camp[]);
      if (r) setRooms(r as Room[]);
      if (f) setFlights(f as Flight[]);
      setLoading(false);
    };
    load();
  }, []);

  // ============================================================
  // تقرير الحجاج
  // ============================================================
  const getPassengersHTML = () => {
    const rows = passengers.map((p, i) =>
      `<tr><td style="text-align:center">${i + 1}</td>${activeCols.map(c => `<td>${c.get(p) || "—"}</td>`).join("")}</tr>`
    ).join("");
    const body = `<table><tr><th style="text-align:center;width:30px">م</th>${activeCols.map(c => `<th>${c.label}</th>`).join("")}</tr>${rows}</table>`;
    return makeHTML("كشف الحجاج", body, true, logoUrl);
  };

  const exportPassengersXLSX = () => {
    const headers = ["م", ...activeCols.map(c => c.label)];
    const rows = passengers.map((p, i) => [i + 1, ...activeCols.map(c => c.get(p) || "")]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 4 }, ...activeCols.map(c => ({ wch: Math.max(c.label.length + 2, 15) }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحجاج");
    XLSX.writeFile(wb, "تقرير_الحجاج.xlsx");
  };

  // ============================================================
  // تقرير الطيران — خطوط الطيران (airline list)
  // ============================================================
  const getAirlineHTML = () => {
    const list = passengers.filter(p => p.services?.flight !== "بدون");
    const rows = list.map((p, i) => {
      const nat = p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat;
      const gender = p.gender === "ذكر" ? "MR." : "MRS.";
      const cls = p.flight_class === "درجة أولى" ? "FIRST CLASS" : "";
      return `<tr><td style="text-align:center">${i + 1}</td><td>${p.name_en}</td><td>${nat}</td><td>${p.passport}</td><td>${p.phone || "—"}</td><td>${gender}</td><td>${cls}</td></tr>`;
    }).join("");
    const body = `<table style="direction:ltr"><tr><th style="text-align:center;width:30px">S.N.</th><th>FULL NAME</th><th>NAT.</th><th>PASSPORT NO.</th><th>TEL. NO.</th><th>GENDER</th><th>CLASS</th></tr>${rows}</table>`;
    return makeHTML("Pilgrims Flight List", body, true, logoUrl);
  };

  const exportAirlineXLSX = () => {
    const list = passengers.filter(p => p.services?.flight !== "بدون");
    const headers = ["S.N.", "FULL NAME", "NAT.", "PASSPORT NO.", "TEL. NO.", "GENDER", "CLASS"];
    const rows = list.map((p, i) => [
      i + 1, p.name_en,
      p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat,
      p.passport, p.phone || "—",
      p.gender === "ذكر" ? "MR." : "MRS.",
      p.flight_class === "درجة أولى" ? "FIRST CLASS" : ""
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 7 }, { wch: 13 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Flight List");
    XLSX.writeFile(wb, "flight_list.xlsx");
  };

  // ============================================================
  // تقرير الطيران — كل رحلة
  // ============================================================
  const getPerFlightHTML = () => {
    const sections = flights.map(flight => {
      const fp = passengers.filter(p => p.flight_id === flight.id);
      const rows = fp.map((p, i) => {
        const nat = p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat;
        const gender = p.gender === "ذكر" ? "MR." : "MRS.";
        const cls = p.flight_class === "درجة أولى" ? "FIRST CLASS" : "";
        return `<tr><td style="text-align:center">${i + 1}</td><td>${p.name_en}</td><td>${nat}</td><td>${p.passport}</td><td>${p.phone || "—"}</td><td>${gender}</td><td>${cls}</td></tr>`;
      }).join("");
      return `
        <div class="page-break">
          <div style="background:#f0f4ff;border:1px solid #0C447C;border-radius:8px;padding:12px 16px;margin-bottom:14px;direction:rtl">
            <div style="font-size:16px;font-weight:700;color:#0C447C;margin-bottom:8px">${flight.name} — ${flight.type}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:10px">
              <div><span style="color:#888">الخط:</span> ${flight.airline}</div>
              <div><span style="color:#888">التاريخ:</span> ${flight.date}</div>
              <div><span style="color:#888">الوقت:</span> ${flight.time}</div>
              <div><span style="color:#888">من:</span> ${flight.from_airport}</div>
              <div><span style="color:#888">إلى:</span> ${flight.to_airport}</div>
              <div><span style="color:#888">عدد الحجاج:</span> ${fp.length}</div>
            </div>
          </div>
          <table style="direction:ltr"><tr><th style="text-align:center;width:30px">S.N.</th><th>FULL NAME</th><th>NAT.</th><th>PASSPORT NO.</th><th>TEL. NO.</th><th>GENDER</th><th>CLASS</th></tr>${rows}</table>
        </div>`;
    }).join("");
    return makeHTML("تقرير الرحلات", sections, true, logoUrl);
  };

  const exportPerFlightXLSX = () => {
    const wb = XLSX.utils.book_new();
    flights.forEach(flight => {
      const fp = passengers.filter(p => p.flight_id === flight.id);
      const headers = ["S.N.", "FULL NAME", "NAT.", "PASSPORT NO.", "TEL. NO.", "GENDER", "CLASS"];
      const info = [["الرحلة:", flight.name], ["الخط:", flight.airline], ["التاريخ:", flight.date], ["الوقت:", flight.time], ["من:", flight.from_airport], ["إلى:", flight.to_airport], []];
      const rows = fp.map((p, i) => [
        i + 1, p.name_en,
        p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat,
        p.passport, p.phone || "—",
        p.gender === "ذكر" ? "MR." : "MRS.",
        p.flight_class === "درجة أولى" ? "FIRST CLASS" : ""
      ]);
      const ws = XLSX.utils.aoa_to_sheet([...info, headers, ...rows]);
      ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 7 }, { wch: 13 }];
      XLSX.utils.book_append_sheet(wb, ws, flight.name.slice(0, 31));
    });
    XLSX.writeFile(wb, "تقرير_الرحلات.xlsx");
  };

  // ============================================================
  // تقرير الباصات
  // ============================================================
  const getBusesHTML = () => {
    const sections = buses.map(bus => {
      const bp = passengers.filter(p => p.bus_id === bus.id);
      const rows = bp.map((p, i) =>
        `<tr><td style="text-align:center">${i + 1}</td><td>${p.short_ar || p.name_ar}</td></tr>`
      ).join("");
      return `<div class="page-break">
        <div class="section-title">${bus.name}${bus.type === "VIP" ? " ⭐ VIP" : ""}</div>
        <table><tr><th style="text-align:center;width:40px">م</th><th>اسم الحاج / الحاجة</th></tr>${rows}</table>
      </div>`;
    }).join("");
    return makeHTML("تقرير الباصات", sections, false, logoUrl);
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

  // ============================================================
  // تقرير المخيمات (منى / عرفة)
  // ============================================================
  const getCampsHTML = (pageType: "منى" | "عرفة") => {
    const campIdKey = pageType === "منى" ? "camp_mina_id" : "camp_arafa_id";
    const icon = pageType === "منى" ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>`;
    const pageCamps = camps.filter(c => c.page_type === pageType);
    const sections = pageCamps.map(camp => {
      const cp = passengers.filter(p => (p as any)[campIdKey] === camp.id);
      const isMale = camp.gender === "ذكر";
      const headerColor = isMale ? "var(--info)" : "var(--female-fg)";
      // عمودين جنب بعض
      const half = Math.ceil(cp.length / 2);
      const col1 = cp.slice(0, half);
      const col2 = cp.slice(half);
      const maxRows = Math.max(col1.length, col2.length);
      let tableRows = "";
      for (let i = 0; i < maxRows; i++) {
        const p1 = col1[i];
        const p2 = col2[i];
        tableRows += `<tr>
          <td style="text-align:center;width:30px">${p1 ? i + 1 : ""}</td>
          <td>${p1 ? (p1.short_ar || p1.name_ar) : ""}</td>
          <td style="text-align:center;width:30px;border-right:2px solid #0C447C">${p2 ? half + i + 1 : ""}</td>
          <td>${p2 ? (p2.short_ar || p2.name_ar) : ""}</td>
        </tr>`;
      }
      return `<div class="page-break">
        <div style="text-align:center;margin-bottom:12px">
          <div style="font-size:22px;font-weight:700;color:${headerColor}">${icon} مخيم ${isMale ? "رجال" : "نساء"} ${camp.name}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">${camp.type} · ${cp.length} مسافر</div>
        </div>
        <table>
          <tr>
            <th style="text-align:center;width:30px;background:${headerColor}">م</th>
            <th style="background:${headerColor}">اسم الحاج</th>
            <th style="text-align:center;width:30px;background:${headerColor}">م</th>
            <th style="background:${headerColor}">اسم الحاج</th>
          </tr>
          ${tableRows}
        </table>
      </div>`;
    }).join("");
    return makeHTML(`مخيمات ${pageType}`, sections, false, logoUrl);
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

  // ============================================================
  // تقرير الفندق
  // ============================================================
  const getFilteredRooms = () => {
    if (hotelPrintFilter === "floor") return rooms.filter(r => r.floor === hotelPrintFloor);
    if (hotelPrintFilter === "type") return rooms.filter(r => r.type === hotelPrintType);
    return rooms;
  };

  const getHotelHTML = () => {
    const filtered = getFilteredRooms();
    // 3 أعمدة
    const col1 = filtered.filter((_, i) => i % 3 === 0);
    const col2 = filtered.filter((_, i) => i % 3 === 1);
    const col3 = filtered.filter((_, i) => i % 3 === 2);
    const renderRoomBlock = (room: Room) => {
      const rp = passengers.filter(p => p.room_id === room.id);
      const [bg, clr] = ROOM_COLORS[room.type] || ["var(--bg-2)", "var(--text)"];
      return `<div style="margin-bottom:10px;break-inside:avoid">
        <div style="background:${bg};color:${clr};padding:4px 8px;border:1px solid ${clr}33;border-bottom:none;font-size:10px;font-weight:700;display:flex;justify-content:space-between;border-radius:4px 4px 0 0">
          <span>${room.type}</span><span>غرفة ${room.number}${room.floor ? ` (ط${room.floor})` : ""}</span>
        </div>
        <table style="margin:0">
          <tr style="background:#f0f4ff"><th style="text-align:center;width:20px;background:#0C447C">م</th><th style="background:#0C447C">الاسم</th></tr>
          ${rp.map((p, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${p.short_ar || p.name_ar}</td></tr>`).join("")}
        </table>
      </div>`;
    };
    const body = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <div>${col1.map(renderRoomBlock).join("")}</div>
      <div>${col2.map(renderRoomBlock).join("")}</div>
      <div>${col3.map(renderRoomBlock).join("")}</div>
    </div>`;
    const subtitle = hotelPrintFilter === "floor" ? ` — الطابق ${hotelPrintFloor}` : hotelPrintFilter === "type" ? ` — ${hotelPrintType}` : "";
    return makeHTML(`تقرير الفندق${subtitle}`, body, true, logoUrl);
  };

  const exportHotelXLSX = () => {
    const filtered = getFilteredRooms();
    const rows: any[][] = [["رقم الغرفة", "الطابق", "النوع", "م", "اسم الحاج", "الجنس", "طلب الحاج"]];
    filtered.forEach(room => {
      const rp = passengers.filter(p => p.room_id === room.id);
      rp.forEach((p, i) => rows.push([room.number, room.floor || "—", room.type, i + 1, p.short_ar || p.name_ar, p.gender, `${p.services?.hotel_type} ${p.services?.hotel_view}`]));
      if (rp.length === 0) rows.push([room.number, room.floor || "—", room.type, "", "لا يوجد مسافرون", "", ""]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الفندق");
    XLSX.writeFile(wb, "تقرير_الفندق.xlsx");
  };

  // ============================================================
  // أزرار التصدير الأربعة
  // ============================================================
  const ExportButtons = ({
    onView, onExcel, onPDF, onPrint
  }: { onView?: () => void; onExcel: () => void; onPDF: () => void; onPrint: () => void }) => (
    <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
      {onView && <button onClick={onView} style={{ ...btnS({ flex: 1, minWidth: 80 }) }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg> عرض</button>}
      <button onClick={onExcel} style={{ ...btnP({ flex: 1, minWidth: 80 }) }}>⬇️ Excel</button>
      <button onClick={onPDF} style={{ background: "var(--info)", color: "var(--bg-card)", border: "none", padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500, flex: 1, minWidth: 80 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> PDF</button>
      <button onClick={onPrint} style={{ ...btnS({ flex: 1, minWidth: 80 }) }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة</button>
    </div>
  );

  // ============================================================
  // قائمة التقارير
  // ============================================================
  const reports = [
    { id: "passengers_report", name: "تقرير الحجاج", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`, desc: "كشف بيانات الحجاج", color: "var(--success-bg)" },
    { id: "flight", name: "تقرير الطيران", icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4.5 1.5-4.5 1.5L6 8 0 9.7l3.3 3.3-1.2 5.6L6 17l1.4 3.8L12 18l2 2z"/></svg>`, desc: "خطوط الطيران والرحلات", color: "var(--male-bg)" },
    { id: "buses", name: "تقرير الباصات", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>`, desc: "توزيع المسافرين على الباصات", color: "var(--info-bg)" },
    { id: "mina", name: "تقرير منى", icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>`, desc: "مخيمات منى", color: "var(--success-bg)" },
    { id: "arafa", name: "تقرير عرفة", icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>`, desc: "مخيمات عرفة", color: "var(--warning-bg)" },
    { id: "hotel", name: "تقرير الفندق", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/></svg>`, desc: "توزيع الغرف", color: "var(--female-bg)" },
  ];

  // ============================================================
  // الـ UI
  // ============================================================
  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      {!activeReport ? (
        <>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>اختر التقرير</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {reports.map(r => (
              <div key={r.id} onClick={() => { setActiveReport(r.id); setFlightSubReport(null); }}
                style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, background: "var(--bg-card)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--bg-2)"}
                onMouseLeave={e => e.currentTarget.style.background = "white"}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: r.color, display: "flex", alignItems: "center", justifyContent: "center" }} dangerouslySetInnerHTML={{ __html: r.icon }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{r.desc}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "var(--success-bg)", color: "var(--primary-dark)" }}>Excel</span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "var(--male-bg)", color: "var(--info)" }}>PDF</span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "var(--bg-2)", color: "var(--text-muted)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div>
          <button onClick={() => setActiveReport(null)} style={{ ...btnS(), marginBottom: 14 }}>رجوع</button>

          {/* ===== تقرير الحجاج ===== */}
          {activeReport === "passengers_report" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير الحجاج</div>
              <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>اختر الأعمدة</div>
                  <div onClick={toggleAll} style={{ fontSize: 11, color: "var(--em7)", cursor: "pointer" }}>
                    {selectedCols.length === ALL_COLS.length ? "إلغاء الكل" : "تحديد الكل"}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {ALL_COLS.map(col => (
                    <div key={col.key} onClick={() => toggleCol(col.key)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, cursor: "pointer", background: selectedCols.includes(col.key) ? "var(--success-bg)" : "var(--bg-2)", border: `0.5px solid ${selectedCols.includes(col.key) ? "var(--em7)" : "var(--border)"}` }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, background: selectedCols.includes(col.key) ? "var(--em7)" : "var(--bg-card)", border: `1.5px solid ${selectedCols.includes(col.key) ? "var(--em7)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {selectedCols.includes(col.key) && <span style={{ color: "var(--bg-card)", fontSize: 10 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></span>}
                      </div>
                      <span style={{ fontSize: 11 }}>{col.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{passengers.length} حاج · {activeCols.length} عمود</div>
              <ExportButtons
                onExcel={exportPassengersXLSX}
                onPDF={() => downloadPDF(getPassengersHTML(), "تقرير_الحجاج.html")}
                onPrint={() => printInPage(getPassengersHTML())}
              />
            </>
          )}

          {/* ===== تقرير الطيران ===== */}
          {activeReport === "flight" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير الطيران</div>
              {!flightSubReport ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { id: "airline", icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`, name: "تقرير خطوط الطيران", desc: "كشف الحجاج لإرساله لشركة الطيران" },
                    { id: "per_flight", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--em7)" strokeWidth="1.7" strokeLinecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4.5 1.5-4.5 1.5L6 8 0 9.7l3.3 3.3-1.2 5.6L6 17l1.4 3.8L12 18l2 2z"/></svg>`, name: "تقرير كل رحلة", desc: "قائمة الحجاج على كل رحلة مع تفاصيلها" },
                  ].map(sub => (
                    <div key={sub.id} onClick={() => setFlightSubReport(sub.id as any)}
                      style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-card)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--bg-2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "white"}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--male-bg)", display: "flex", alignItems: "center", justifyContent: "center" }} dangerouslySetInnerHTML={{ __html: sub.icon }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{sub.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <button onClick={() => setFlightSubReport(null)} style={{ ...btnS(), marginBottom: 14, fontSize: 11 }}>رجوع للطيران</button>

                  {/* خطوط الطيران */}
                  {flightSubReport === "airline" && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>تقرير خطوط الطيران</div>
                      <div style={{ overflowX: "auto", marginBottom: 12 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, direction: "ltr" }}>
                          <thead>
                            <tr style={{ background: "var(--info)", color: "var(--bg-card)" }}>
                              {["S.N.", "FULL NAME", "NAT.", "PASSPORT NO.", "TEL. NO.", "GENDER", "CLASS"].map(h =>
                                <th key={h} style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {passengers.filter(p => p.services?.flight !== "بدون").map((p, i) => (
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--info-bg)" }}>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{i + 1}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee", fontWeight: 500 }}>{p.name_en}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.passport}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.phone || "—"}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.gender === "ذكر" ? "MR." : "MRS."}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.flight_class === "درجة أولى" ? "⭐ FIRST" : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <ExportButtons
                        onExcel={exportAirlineXLSX}
                        onPDF={() => downloadPDF(getAirlineHTML(), "flight_list.html")}
                        onPrint={() => printInPage(getAirlineHTML())}
                      />
                    </>
                  )}

                  {/* كل رحلة */}
                  {flightSubReport === "per_flight" && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4.5 1.5-4.5 1.5L6 8 0 9.7l3.3 3.3-1.2 5.6L6 17l1.4 3.8L12 18l2 2z"/></svg> تقرير كل رحلة</div>
                      {loading ? <div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div> :
                        flights.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>لا يوجد رحلات</div> :
                        flights.map(flight => {
                          const fp = passengers.filter(p => p.flight_id === flight.id);
                          return (
                            <div key={flight.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
                              <div style={{ background: "var(--male-bg)", padding: "10px 14px", borderBottom: "0.5px solid #dce8f8" }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--info)" }}>{flight.name} — {flight.type}</div>
                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                                  <span style={{display:"flex",alignItems:"center",gap:4}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> {flight.airline}</span>
                                  <span style={{display:"flex",alignItems:"center",gap:4}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> {flight.date}</span>
                                  <span>⏰ {flight.time}</span>
                                  <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19 4c-2 0-4.5 1.5-4.5 1.5L6 8 0 9.7l3.3 3.3-1.2 5.6L6 17l1.4 3.8L12 18l2 2z"/></svg> {flight.from_airport} → {flight.to_airport}</span>
                                  <span style={{ color: "var(--info)", fontWeight: 500 }}>{fp.length} حاج</span>
                                </div>
                              </div>
                              {fp.length > 0 && (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, direction: "ltr" }}>
                                  <thead>
                                    <tr style={{ background: "var(--info)", color: "var(--bg-card)" }}>
                                      {["S.N.", "FULL NAME", "NAT.", "PASSPORT NO.", "GENDER", "CLASS"].map(h =>
                                        <th key={h} style={{ padding: "5px 10px", textAlign: "left" }}>{h}</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {fp.map((p, i) => (
                                      <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--info-bg)" }}>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{i + 1}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.name_en}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.nat === "قطري" ? "QAT" : "EGY"}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.passport}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.gender === "ذكر" ? "MR." : "MRS."}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.flight_class === "درجة أولى" ? "⭐ FIRST" : ""}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          );
                        })
                      }
                      <ExportButtons
                        onExcel={exportPerFlightXLSX}
                        onPDF={() => downloadPDF(getPerFlightHTML(), "تقرير_الرحلات.html")}
                        onPrint={() => printInPage(getPerFlightHTML())}
                      />
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ===== تقرير الباصات ===== */}
          {activeReport === "buses" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير الباصات</div>
              {loading ? <div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div> :
                buses.length === 0 ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد باصات</div> :
                <>
                  {buses.map(bus => {
                    const bp = passengers.filter(p => p.bus_id === bus.id);
                    return (
                      <div key={bus.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div style={{ padding: "8px 12px", background: bus.type === "VIP" ? "var(--warning-bg)" : "var(--bg-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{bus.name} {bus.type === "VIP" && <span style={{ fontSize: 10, background: "var(--warning-bg)", color: "var(--warning)", padding: "1px 6px", borderRadius: 99 }}>VIP</span>}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{bp.length} مسافر</div>
                        </div>
                        {bp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: "var(--info)", color: "var(--bg-card)" }}>
                              <th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>اسم الحاج / الحاجة</th>
                            </tr></thead>
                            <tbody>{bp.map((p, i) =>
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--info-bg)" }}>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td>
                              </tr>
                            )}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons
                    onExcel={exportBusesXLSX}
                    onPDF={() => downloadPDF(getBusesHTML(), "تقرير_الباصات.html")}
                    onPrint={() => printInPage(getBusesHTML())}
                  />
                </>
              }
            </>
          )}

          {/* ===== تقرير منى ===== */}
          {activeReport === "mina" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير مخيمات منى</div>
              {loading ? <div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div> :
                camps.filter(c => c.page_type === "منى").length === 0 ?
                  <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد مخيمات</div> :
                <>
                  {camps.filter(c => c.page_type === "منى").map(camp => {
                    const cp = passengers.filter(p => p.camp_mina_id === camp.id);
                    const isMale = camp.gender === "ذكر";
                    return (
                      <div key={camp.id} style={{ border: `0.5px solid ${camp.type === "خاص" ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div style={{ padding: "8px 12px", background: camp.type === "خاص" ? "var(--warning-bg)" : "var(--bg-2)", display: "flex", justifyContent: "space-between" }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>مخيم {camp.name}
                            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isMale ? "var(--male-bg)" : "var(--female-bg)", color: isMale ? "var(--info)" : "var(--female-fg)", marginRight: 6 }}>{isMale ? "رجال" : "نساء"}</span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>({camp.type}) · {cp.length} مسافر</span>
                          </div>
                        </div>
                        {cp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: isMale ? "var(--info)" : "var(--female-fg)", color: "var(--bg-card)" }}>
                              <th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الجنسية</th>
                            </tr></thead>
                            <tbody>{cp.map((p, i) =>
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--bg-2)" }}>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.nat}</td>
                              </tr>
                            )}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons
                    onExcel={() => exportCampsXLSX("منى")}
                    onPDF={() => downloadPDF(getCampsHTML("منى"), "تقرير_مخيمات_منى.html")}
                    onPrint={() => printInPage(getCampsHTML("منى"))}
                  />
                </>
              }
            </>
          )}

          {/* ===== تقرير عرفة ===== */}
          {activeReport === "arafa" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير مخيمات عرفة</div>
              {loading ? <div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div> :
                camps.filter(c => c.page_type === "عرفة").length === 0 ?
                  <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد مخيمات</div> :
                <>
                  {camps.filter(c => c.page_type === "عرفة").map(camp => {
                    const cp = passengers.filter(p => p.camp_arafa_id === camp.id);
                    const isMale = camp.gender === "ذكر";
                    return (
                      <div key={camp.id} style={{ border: `0.5px solid ${camp.type === "خاص" ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div style={{ padding: "8px 12px", background: camp.type === "خاص" ? "var(--warning-bg)" : "var(--bg-2)", display: "flex", justifyContent: "space-between" }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>مخيم {camp.name}
                            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isMale ? "var(--male-bg)" : "var(--female-bg)", color: isMale ? "var(--info)" : "var(--female-fg)", marginRight: 6 }}>{isMale ? "رجال" : "نساء"}</span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>({camp.type}) · {cp.length} مسافر</span>
                          </div>
                        </div>
                        {cp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: isMale ? "var(--info)" : "var(--female-fg)", color: "var(--bg-card)" }}>
                              <th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الجنسية</th>
                            </tr></thead>
                            <tbody>{cp.map((p, i) =>
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--bg-2)" }}>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.nat}</td>
                              </tr>
                            )}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons
                    onExcel={() => exportCampsXLSX("عرفة")}
                    onPDF={() => downloadPDF(getCampsHTML("عرفة"), "تقرير_مخيمات_عرفة.html")}
                    onPrint={() => printInPage(getCampsHTML("عرفة"))}
                  />
                </>
              }
            </>
          )}

          {/* ===== تقرير الفندق ===== */}
          {activeReport === "hotel" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير الفندق</div>
              {/* فلتر الطباعة */}
              <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>نطاق التقرير</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {[["all", "كل الغرف"], ["floor", "دور معين"], ["type", "نوع معين"]].map(([val, label]) => (
                    <div key={val} onClick={() => setHotelPrintFilter(val as any)}
                      style={{ flex: 1, minWidth: 80, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${hotelPrintFilter === val ? "var(--info)" : "var(--border)"}`, background: hotelPrintFilter === val ? "var(--male-bg)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: hotelPrintFilter === val ? "var(--info)" : "var(--text-muted)" }}>
                      {label}
                    </div>
                  ))}
                </div>
                {hotelPrintFilter === "floor" && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {floors.map(f => (
                      <div key={f} onClick={() => setHotelPrintFloor(f)}
                        style={{ padding: "5px 12px", borderRadius: 99, border: `1.5px solid ${hotelPrintFloor === f ? "var(--info)" : "var(--border)"}`, background: hotelPrintFloor === f ? "var(--male-bg)" : "transparent", cursor: "pointer", fontSize: 12, color: hotelPrintFloor === f ? "var(--info)" : "var(--text-muted)" }}>
                        طابق {f}
                      </div>
                    ))}
                  </div>
                )}
                {hotelPrintFilter === "type" && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {ROOM_TYPES.map(t => {
                      const [bg, clr] = ROOM_COLORS[t];
                      return (
                        <div key={t} onClick={() => setHotelPrintType(t)}
                          style={{ flex: 1, padding: 6, borderRadius: 8, border: `1.5px solid ${hotelPrintType === t ? clr : "var(--border)"}`, background: hotelPrintType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: hotelPrintType === t ? clr : "var(--text-muted)" }}>
                          {t}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {loading ? <div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div> :
                rooms.length === 0 ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد غرف</div> :
                <>
                  {getFilteredRooms().map(room => {
                    const rp = passengers.filter(p => p.room_id === room.id);
                    const [typeBg, typeClr] = ROOM_COLORS[room.type] || ["var(--bg-2)", "var(--text)"];
                    return (
                      <div key={room.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div style={{ padding: "7px 12px", background: "var(--bg-2)", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: typeBg, color: typeClr }}>{room.type}</span>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>غرفة {room.number} {room.floor && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>ط{room.floor}</span>}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginRight: "auto" }}>{rp.length} مسافر</div>
                        </div>
                        {rp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: "var(--info)", color: "var(--bg-card)" }}>
                              <th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الجنس</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>طلب</th>
                            </tr></thead>
                            <tbody>{rp.map((p, i) =>
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--info-bg)" }}>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.gender}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.services?.hotel_type} {p.services?.hotel_view}</td>
                              </tr>
                            )}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons
                    onExcel={exportHotelXLSX}
                    onPDF={() => downloadPDF(getHotelHTML(), "تقرير_الفندق.html")}
                    onPrint={() => printInPage(getHotelHTML())}
                  />
                </>
              }
            </>
          )}
        </div>
      )}
    </div>
  );
}


export default function App() {
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

  const mapPassenger = (p: Record<string, unknown>) => ({
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
  // صفحات full-height (بتستخدم كل المساحة)
  const FULL_PAGES = ["dash", "passengers", "manual", "buses", "flights", "mina", "arafa", "hotel"];
  const isFull = FULL_PAGES.includes(page);

  const renderPage = () => {
    switch (page) {
      case "dash": return <Dashboard passengers={passengers} setPage={setPage} currentUser={currentUser!} onLogout={handleLogout} />;
      case "scan": return <ScanPage passengers={passengers} setPassengers={setPassengers} setPage={setPage} />;
      case "passengers": case "manual": return <PassengersPage passengers={passengers} setPassengers={setPassengers} initialShowManual={page === "manual"} setPage={setPage} />;
      case "buses": return <BusesPage passengers={passengers} setPassengers={setPassengers} />;
      case "flights": return <FlightsPage passengers={passengers} setPassengers={setPassengers} />;
      case "mina": return <CampsPage pageType="منى" passengers={passengers} setPassengers={setPassengers} />;
      case "arafa": return <CampsPage pageType="عرفة" passengers={passengers} setPassengers={setPassengers} />;
      case "hotel": return <HotelPage passengers={passengers} setPassengers={setPassengers} />;
      case "reports": return <ReportsPage passengers={passengers} />;
      case "archive": return <ArchivePage currentUser={currentUser} />;
      case "users": return <UsersPage currentUser={currentUser} />;
      default: return <Dashboard passengers={passengers} setPage={setPage} currentUser={currentUser} onLogout={handleLogout} />;
    }
  };
  return (
    <div style={{ display: "flex", height: "100vh", direction: "rtl", fontFamily: "var(--font-body)", background: "var(--ivory)", overflow: "hidden" }}>
      <Sidebar page={page} setPage={setPage} count={passengers.length} currentUser={currentUser} onLogout={handleLogout} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* محتوى الصفحة */}
        {isFull ? (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>{renderPage()}</div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", background: "var(--ivory)" }}>
            <div style={{ maxWidth: page === "scan" ? 620 : 900, margin: "0 auto", padding: "20px" }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, color: "var(--em8)", marginBottom: 16 }}>{pageTitles[page]}</div>
              {renderPage()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
