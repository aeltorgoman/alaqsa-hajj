import { useState, useEffect } from "react";
import type { ChangeEvent } from "react";
import { supabase } from "../supabase";
import type { User } from "../types";
import { ALL_PERMISSIONS, inp, btnP, btnS, uploadDoc } from "../utils";
import { useConfig } from "../config/ConfigContext";
import { Modal } from "./Modal";
import { AlertModal, useAlert } from "./AlertModal";
import { ThemeSwitcher } from "../config/ThemeContext";

/* ─── helpers ─── */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "linear-gradient(135deg,#7D1F3C,#A32D52)",
  "linear-gradient(135deg,#2563eb,#1d4ed8)",
  "linear-gradient(135deg,#059669,#047857)",
  "linear-gradient(135deg,#7c3aed,#6d28d9)",
  "linear-gradient(135deg,#d97706,#b45309)",
  "linear-gradient(135deg,#0891b2,#0e7490)",
];

/* ─── Switch component ─── */
function Switch({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <div
      onClick={disabled ? undefined : onChange}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: on ? "var(--primary)" : "var(--line)",
        position: "relative", cursor: disabled ? "not-allowed" : "pointer",
        transition: "background .2s", flexShrink: 0, opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: "absolute", width: 14, height: 14, borderRadius: "50%",
        background: "white", top: 3,
        right: on ? 3 : "auto", left: on ? "auto" : 3,
        transition: "all .2s",
        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
      }} />
    </div>
  );
}

/* ─── shared style tokens ─── */
const card: React.CSSProperties = {
  background: "var(--paper)", border: "1px solid var(--line)",
  borderRadius: 14, boxShadow: "0 1px 4px rgba(92,24,48,.06)",
  overflow: "hidden", marginBottom: 14,
};

const cardHead: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "13px 18px", borderBottom: "1px solid var(--bg-2)",
  background: "linear-gradient(135deg,rgba(125,31,60,.03),transparent 70%)",
};

const cardIcon: React.CSSProperties = {
  width: 32, height: 32, background: "rgba(125,31,60,.08)",
  borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
  color: "var(--primary)", flexShrink: 0,
};

const cardBody: React.CSSProperties = { padding: "18px" };

const fieldLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "var(--em8)", marginBottom: 4, display: "block",
};

const divider: React.CSSProperties = { height: 1, background: "var(--bg-2)", margin: "14px 0" };

/* ─── component ─── */
function UsersPage({ currentUser }: { currentUser: User }) {
  const config = useConfig();
  const { alert: alertState, showAlert } = useAlert();

  const [activeTab, setActiveTab] = useState<"identity" | "system" | "users">("identity");

  /* users */
  const [users, setUsers] = useState<User[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [perms, setPerms] = useState<Record<string, boolean>>({});

  /* company */
  const [companyForm, setCompanyForm] = useState({
    name_ar: "", name_en: "", tagline: "",
    contact_phone: "", contact_email: "",
    season_label: "",
    color_primary: "#6B1F3A", color_accent: "#0C447C",
    logo_url: "" as string | null,
    banner_image_url: "" as string | null,
  });
  const [companySaving, setCompanySaving] = useState(false);
  const [companyUploading, setCompanyUploading] = useState(false);
  const [companyMsg, setCompanyMsg] = useState("");

  useEffect(() => {
    setCompanyForm({
      name_ar: config.name_ar || "",
      name_en: config.name_en || "",
      tagline: config.tagline || "",
      contact_phone: config.contact_phone || "",
      contact_email: config.contact_email || "",
      season_label: config.season_label || "",
      color_primary: config.color_primary || "#6B1F3A",
      color_accent: config.color_accent || "#0C447C",
      logo_url: config.logo_url || "",
      banner_image_url: config.banner_image_url || "",
    });
  }, [config]);

  useEffect(() => {
    supabase.from("users").select("*").order("id").then(({ data }: any) => {
      if (data) setUsers(data);
    });
  }, []);

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCompanyUploading(true);
    const url = await uploadDoc(file, 0, "company_logo");
    setCompanyUploading(false);
    if (url) setCompanyForm(prev => ({ ...prev, logo_url: url }));
    else showAlert("error", "فشل رفع الشعار، يرجى المحاولة مرة أخرى");
  };

  const saveCompanyConfig = async () => {
    setCompanySaving(true);
    setCompanyMsg("");
    const { error } = await supabase.from("company_config").update({
      name_ar: companyForm.name_ar, name_en: companyForm.name_en,
      tagline: companyForm.tagline, contact_phone: companyForm.contact_phone,
      contact_email: companyForm.contact_email, season_label: companyForm.season_label,
      color_primary: companyForm.color_primary, color_accent: companyForm.color_accent,
      logo_url: companyForm.logo_url, banner_image_url: companyForm.banner_image_url,
    }).eq("id", 1);
    setCompanySaving(false);
    if (error) { setCompanyMsg("حصل خطأ أثناء الحفظ"); return; }
    setCompanyMsg("تم الحفظ بنجاح — سيتم تحديث الصفحة...");
    setTimeout(() => window.location.reload(), 1200);
  };

  /* ── [FIX #4] reset form completely on openAdd ── */
  const openAdd = () => {
    setEditUser(null);
    setForm({ name: "", username: "", password: "" });
    setPerms(Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, false])));
    setShowAdd(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({ name: u.name, username: u.username, password: "" });
    setPerms({ ...u.permissions });
    setShowAdd(true);
  };

  const togglePerm = (key: string) => setPerms(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleAll = () => {
    const allOn = ALL_PERMISSIONS.every(p => perms[p.key]);
    setPerms(Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, !allOn])));
  };

  const [savingUser, setSavingUser] = useState(false);

  const saveUser = async () => {
    if (!form.name || !form.username) return;
    setSavingUser(true);
    try {
      if (editUser) {
        if (form.password.trim()) {
          const { error } = await supabase.rpc("update_user", { p_id: editUser.id, p_name: form.name, p_username: form.username, p_password: form.password, p_permissions: perms });
          if (error) { showAlert("error", "تعذر حفظ التعديلات: " + error.message); return; }
        } else {
          const { error } = await supabase.from("users").update({ name: form.name, username: form.username, permissions: perms }).eq("id", editUser.id);
          if (error) { showAlert("error", "تعذر حفظ التعديلات: " + error.message); return; }
        }
        setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, name: form.name, username: form.username, permissions: perms } : u));
      } else {
        if (!form.password) return;
        const { error } = await supabase.rpc("create_user", { p_name: form.name, p_username: form.username, p_password: form.password, p_permissions: perms });
        if (error) { showAlert("error", "تعذر إنشاء المستخدم: " + error.message); return; }
        const { data, error: fetchError } = await supabase.from("users").select("*").order("id");
        if (fetchError) { showAlert("error", "تم الإنشاء لكن تعذر تحديث القائمة: " + fetchError.message); return; }
        if (data) setUsers(data as User[]);
      }
      showAlert("success", "تم حفظ بيانات المستخدم بنجاح");
      setShowAdd(false);
    } catch (e: any) {
      showAlert("error", "حدث خطأ غير متوقع أثناء الحفظ: " + (e?.message || ""));
    } finally {
      setSavingUser(false);
    }
  };

  const deleteUser = async (id: number) => {
    if (!confirm("هل تريد حذف هذا المستخدم؟")) return;
    await supabase.from("users").delete().eq("id", id);
    setUsers(prev => prev.filter(x => x.id !== id));
  };

  /* ── [FEATURE #2] toggle is_active ── */
  const toggleActive = async (u: User) => {
    const current = (u as any).is_active === false ? false : true;
    const newVal = !current;
    await supabase.from("users").update({ is_active: newVal }).eq("id", u.id);
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: newVal } as any : x));
  };

  const tabBtn = (id: typeof activeTab): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "9px 16px", fontFamily: "var(--font-body)", fontSize: 12,
    fontWeight: activeTab === id ? 800 : 600,
    color: activeTab === id ? "var(--primary)" : "var(--text-muted)",
    background: activeTab === id ? "var(--bg)" : "transparent",
    border: activeTab === id ? "1.5px solid var(--line)" : "1.5px solid transparent",
    borderBottom: "none", borderRadius: "10px 10px 0 0",
    cursor: "pointer", position: "relative", bottom: -1.5, transition: "all .15s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />

      {/* ── PAGE HEADER ── */}
      <div style={{ padding: "18px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 700, color: "var(--primary)" }}>إعدادات الحملة</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>تخصيص هوية وإعدادات {config.name_ar || "الحملة"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg,var(--em8),var(--em7))", color: "var(--accent-light)", fontSize: 11, fontWeight: 700, padding: "7px 14px", borderRadius: 99, boxShadow: "0 2px 8px rgba(92,24,48,.25)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          {companyForm.season_label || "موسم الحج"}
        </div>
      </div>

      {/* ── TABS BAR ── */}
      <div style={{ display: "flex", gap: 2, padding: "14px 20px 0", borderBottom: "1.5px solid var(--line)", flexShrink: 0 }}>
        <button style={tabBtn("identity")} onClick={() => setActiveTab("identity")}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          بيانات الهوية
        </button>
        <button style={tabBtn("system")} onClick={() => setActiveTab("system")}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          إعدادات النظام
        </button>
        <button style={tabBtn("users")} onClick={() => setActiveTab("users")}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          المستخدمون
        </button>
      </div>

      {/* ── TAB CONTENT ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px 0" }}>

        {/* ══════════ TAB 1: IDENTITY ══════════ */}
        {activeTab === "identity" && (
          <div>
            <div style={card}>
              <div style={cardHead}>
                <div style={cardIcon}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>الهوية البصرية</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>البانر الرئيسي، الشعار، والأسماء</div>
                </div>
              </div>
              <div style={cardBody}>

                {/* BANNER + LOGO */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 12, marginBottom: 16 }}>
                  <div>
                    <span style={fieldLabel}>صورة البانر الرئيسي</span>
                    <div style={{ position: "relative", height: 120, borderRadius: 10, overflow: "hidden", border: "1.5px dashed var(--accent)", background: "var(--bg-2)" }}>
                      {companyForm.banner_image_url ? (
                        <div style={{ width: "100%", height: "100%", backgroundImage: `url(${companyForm.banner_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>لا توجد صورة</span>
                        </div>
                      )}
                      <label style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, background: "rgba(92,24,48,.5)", color: "white", fontSize: 11, fontWeight: 600, opacity: 0, cursor: "pointer", transition: "opacity .2s" }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                        onMouseLeave={e => (e.currentTarget.style.opacity = "0")}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        {companyUploading ? "جاري الرفع..." : "رفع صورة جديدة"}
                        <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
                          const file = e.target.files?.[0]; if (!file) return;
                          setCompanyUploading(true);
                          const url = await uploadDoc(file, 0, "company_banner");
                          setCompanyUploading(false);
                          if (url) setCompanyForm(prev => ({ ...prev, banner_image_url: url }));
                          e.target.value = "";
                        }} />
                      </label>
                    </div>
                  </div>

                  <div>
                    <span style={fieldLabel}>شعار الحملة</span>
                    <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, border: "1.5px dashed var(--accent)", borderRadius: 12, background: "var(--bg-2)", height: "calc(100% - 22px)", cursor: "pointer" }}>
                      <div style={{ width: 56, height: 56, borderRadius: "50%", border: "2px solid var(--line)", background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                        {companyForm.logo_url
                          ? <img src={companyForm.logo_url} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <span style={{ fontSize: 22, fontWeight: 800, color: "var(--primary)" }}>{(companyForm.name_ar || "ح").trim().charAt(0)}</span>
                        }
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--primary)" }}>{companyUploading ? "جاري الرفع..." : "تغيير الشعار"}</div>
                        <div style={{ fontSize: 9, color: "var(--text-muted)" }}>PNG · SVG</div>
                      </div>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={companyUploading} style={{ display: "none" }} />
                    </label>
                  </div>
                </div>

                <div style={divider} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={fieldLabel}>اسم الحملة (عربي)</label>
                    <input style={{ ...inp, fontSize: 12 }} value={companyForm.name_ar} onChange={e => setCompanyForm(p => ({ ...p, name_ar: e.target.value }))} />
                  </div>
                  <div>
                    <label style={fieldLabel}>اسم الحملة (إنجليزي)</label>
                    <input style={{ ...inp, fontSize: 12 }} dir="ltr" value={companyForm.name_en} onChange={e => setCompanyForm(p => ({ ...p, name_en: e.target.value }))} />
                  </div>
                  <div>
                    <label style={fieldLabel}>اسم الموسم</label>
                    <input style={{ ...inp, fontSize: 12 }} value={companyForm.season_label} onChange={e => setCompanyForm(p => ({ ...p, season_label: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label style={fieldLabel}>الشعار النصي (Tagline)</label>
                  <input style={inp} value={companyForm.tagline} onChange={e => setCompanyForm(p => ({ ...p, tagline: e.target.value }))} />
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>يظهر في الشاشة الرئيسية وصفحة تسجيل الدخول</div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ══════════ TAB 2: SYSTEM ══════════ */}
        {activeTab === "system" && (
          <div>
            <div style={card}>
              <div style={cardHead}>
                <div style={cardIcon}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>بيانات التواصل</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>تظهر في التقارير وصفحة تسجيل الدخول</div>
                </div>
              </div>
              <div style={cardBody}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={fieldLabel}>رقم التواصل</label>
                    <input style={inp} dir="ltr" value={companyForm.contact_phone} onChange={e => setCompanyForm(p => ({ ...p, contact_phone: e.target.value }))} />
                  </div>
                  <div>
                    <label style={fieldLabel}>البريد الإلكتروني</label>
                    <input style={inp} dir="ltr" value={companyForm.contact_email} onChange={e => setCompanyForm(p => ({ ...p, contact_email: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── [FIX #5] COLOR PICKERS ── */}
            <div style={card}>
              <div style={cardHead}>
                <div style={cardIcon}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>ألوان النظام</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>تؤثر على التقارير وأوراق الطباعة</div>
                </div>
              </div>
              <div style={cardBody}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={fieldLabel}>اللون الأساسي</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="color"
                        value={companyForm.color_primary}
                        onChange={e => setCompanyForm(p => ({ ...p, color_primary: e.target.value }))}
                        style={{ width: 36, height: 36, padding: 2, border: "1.5px solid var(--line)", borderRadius: 8, cursor: "pointer", background: "none", flexShrink: 0 }}
                      />
                      <input style={{ ...inp, flex: 1, fontFamily: "monospace", fontSize: 11 }} value={companyForm.color_primary} onChange={e => setCompanyForm(p => ({ ...p, color_primary: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label style={fieldLabel}>اللون الثانوي</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="color"
                        value={companyForm.color_accent}
                        onChange={e => setCompanyForm(p => ({ ...p, color_accent: e.target.value }))}
                        style={{ width: 36, height: 36, padding: 2, border: "1.5px solid var(--line)", borderRadius: 8, cursor: "pointer", background: "none", flexShrink: 0 }}
                      />
                      <input style={{ ...inp, flex: 1, fontFamily: "monospace", fontSize: 11 }} value={companyForm.color_accent} onChange={e => setCompanyForm(p => ({ ...p, color_accent: e.target.value }))} />
                    </div>
                  </div>
                </div>
                <div style={{ padding: 12, background: "rgba(125,31,60,.03)", border: "1px solid rgba(125,31,60,.08)", borderRadius: 10 }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>معاينة</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1, height: 28, background: companyForm.color_primary, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10, fontWeight: 700 }}>الأساسي</div>
                    <div style={{ flex: 1, height: 28, background: companyForm.color_accent, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10, fontWeight: 700 }}>الثانوي</div>
                    <div style={{ flex: 1, height: 28, background: `linear-gradient(135deg,${companyForm.color_primary},${companyForm.color_accent})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10, fontWeight: 700 }}>التدرج</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── [FIX #6] المظهر — نفس الـ ThemeSwitcher الموجود في الداشبورد ── */}
            <div style={card}>
              <div style={cardHead}>
                <div style={cardIcon}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>المظهر</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>اختر مظهر النظام المفضل لديك</div>
                </div>
              </div>
              <div style={cardBody}>
                <ThemeSwitcher />
              </div>
            </div>
          </div>
        )}
        {activeTab === "users" && (
          <div>
            <div style={card}>
              <div style={cardHead}>
                <div style={cardIcon}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>المستخدمون والإداريون</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>إدارة حسابات وصلاحيات فريق الحملة</div>
                </div>
                {currentUser.permissions.manage_users && (
                  <button onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "var(--primary)", color: "white", border: "none", borderRadius: 9, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(125,31,60,.25)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    مستخدم جديد
                  </button>
                )}
              </div>
              <div style={cardBody}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {users.map((u, idx) => {
                    const isOwner = u.username === "admin";
                    const isActive = (u as any).is_active !== false;
                    const avatarBg = isOwner
                      ? "linear-gradient(135deg,#c8a24b,#8a6a22)"
                      : AVATAR_COLORS[idx % AVATAR_COLORS.length];
                    return (
                      <div key={u.id} style={{
                        background: isOwner ? "linear-gradient(135deg,rgba(212,172,79,.07),var(--paper))" : "var(--paper)",
                        border: `1px solid ${isOwner ? "rgba(212,172,79,.4)" : "var(--line)"}`,
                        borderRadius: 12, padding: "12px",
                        display: "flex", alignItems: "flex-start", gap: 10,
                        opacity: isActive ? 1 : 0.6,
                        transition: "all .2s",
                      }}>
                        {/* AVATAR */}
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: avatarBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "white", flexShrink: 0, boxShadow: "0 2px 6px rgba(0,0,0,.15)" }}>
                          {getInitials(u.name)}
                        </div>
                        {/* INFO */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace", marginTop: 2 }}>@{u.username}</div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 5, padding: "2px 7px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: isOwner ? "rgba(212,172,79,.15)" : "rgba(125,31,60,.07)", color: isOwner ? "#8a6a22" : "var(--primary)", border: `1px solid ${isOwner ? "rgba(212,172,79,.3)" : "rgba(125,31,60,.15)"}` }}>
                            {isOwner && <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
                            {isOwner ? "المدير العام" : `${Object.values(u.permissions).filter(Boolean).length} صلاحية`}
                          </div>
                        </div>
                        {/* ── [FEATURE #2 + FIX #3] ACTIONS ── */}
                        {currentUser.permissions.manage_users && !isOwner && (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                            {/* Switch تفعيل الحساب */}
                            <Switch on={isActive} onChange={() => toggleActive(u)} />
                            {/* أزرار التعديل والحذف */}
                            <div style={{ display: "flex", gap: 4 }}>
                              <button
                                onClick={() => openEdit(u)}
                                title="تعديل"
                                style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid var(--line)", background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-muted)", transition: "all .15s" }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--info)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--info)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--line)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                              </button>
                              <button
                                onClick={() => deleteUser(u.id)}
                                title="حذف"
                                style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid var(--line)", background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-muted)", transition: "all .15s" }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--danger)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--danger)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--line)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(125,31,60,.03)", border: "1px solid rgba(125,31,60,.08)", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    إجمالي الحسابات: <strong style={{ color: "var(--primary)" }}>{users.length} مستخدمين</strong>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    نشطون: <strong style={{ color: "var(--primary)" }}>{users.filter(u => (u as any).is_active !== false).length}</strong>
                  </span>
                </div>

              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── STICKY SAVE BAR ── */}
      {activeTab !== "users" && currentUser.permissions.manage_users && (
        <div style={{ flexShrink: 0, padding: "12px 20px 16px", background: "linear-gradient(to top, var(--bg) 80%, transparent)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {companyMsg && (
            <span style={{ fontSize: 12, color: companyMsg.includes("خطأ") ? "var(--danger)" : "var(--em7)", display: "flex", alignItems: "center", marginLeft: "auto" }}>
              {companyMsg}
            </span>
          )}
          <button style={{ padding: "9px 16px", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--line)", borderRadius: 9, fontFamily: "var(--font-body)", fontSize: 12, cursor: "pointer" }} onClick={() => window.location.reload()}>
            إلغاء
          </button>
          <button onClick={saveCompanyConfig} disabled={companySaving} style={{ ...btnP(), display: "flex", alignItems: "center", gap: 7, opacity: companySaving ? 0.6 : 1 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            {companySaving ? "جاري الحفظ..." : "حفظ الإعدادات"}
          </button>
        </div>
      )}

      {/* ── ADD/EDIT MODAL ── */}
      <Modal show={showAdd} onClose={() => setShowAdd(false)} title={editUser ? "تعديل مستخدم" : "مستخدم جديد"}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>الاسم</div>
            <input style={inp} value={form.name} autoComplete="off" onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>اسم المستخدم</div>
            {/* [FIX #4] autoComplete="off" prevents browser from filling last username */}
            <input style={inp} value={form.username} autoComplete="off" onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>كلمة المرور{editUser ? " (اتركها فارغة للإبقاء على الحالية)" : ""}</div>
          <input type="password" style={inp} value={form.password} autoComplete="new-password" onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder={editUser ? "اتركها فارغة إذا لم تتغير" : ""} />
        </div>

        {/* ── [FEATURE #1] PERMISSIONS AS SWITCHES ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>الصلاحيات</div>
          <div onClick={toggleAll} style={{ fontSize: 11, color: "var(--em7)", cursor: "pointer", fontWeight: 600 }}>
            {ALL_PERMISSIONS.every(p => perms[p.key]) ? "إلغاء الكل" : "تحديد الكل"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
          {ALL_PERMISSIONS.map(p => (
            <div
              key={p.key}
              onClick={() => togglePerm(p.key)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 9, cursor: "pointer", background: perms[p.key] ? "rgba(125,31,60,.06)" : "var(--bg-2)", border: `1px solid ${perms[p.key] ? "rgba(125,31,60,.2)" : "var(--border)"}`, transition: "all .15s" }}
            >
              <span style={{ fontSize: 12, color: "var(--ink)", fontWeight: perms[p.key] ? 600 : 400 }}>{p.label}</span>
              <Switch on={perms[p.key]} onChange={() => togglePerm(p.key)} />
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={saveUser} disabled={savingUser} style={{ ...btnP(), flex: 1, opacity: savingUser ? 0.6 : 1 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> {savingUser ? "جاري الحفظ..." : "حفظ"}
          </button>
          <button onClick={() => setShowAdd(false)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>

    </div>
  );
}

export { UsersPage };
