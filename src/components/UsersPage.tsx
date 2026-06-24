import { useState, useEffect } from "react";
import type { ChangeEvent } from "react";
import { supabase } from "../supabase";
import type { User } from "../types";
import { ALL_PERMISSIONS, inp, btnP, btnS, uploadDoc } from "../utils";
import { useConfig } from "../config/ConfigContext";
import { Modal } from "./Modal";
import { AlertModal, useAlert } from "./AlertModal";

function UsersPage({ currentUser }: { currentUser: User }) {
  const config = useConfig();
  const { alert: alertState, showAlert } = useAlert();
  const [users, setUsers] = useState<User[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [perms, setPerms] = useState<Record<string, boolean>>({});

  // ===== بيانات الشركة =====
  const [companyForm, setCompanyForm] = useState({
    name_ar: "", name_en: "", tagline: "", contact_phone: "", contact_email: "",
    season_label: "", color_primary: "#6B1F3A", color_accent: "#0C447C", logo_url: "" as string | null, banner_image_url: "" as string | null, banner_position: "center" as string, banner_position_x: "50" as string,
  });
  const [companySaving, setCompanySaving] = useState(false);
  const dragStartRef = useRef<{ x: number; pos: number } | null>(null);
  const [companyUploading, setCompanyUploading] = useState(false);
  const [companyMsg, setCompanyMsg] = useState("");

  useEffect(() => {
    setCompanyForm({
      name_ar: config.name_ar || "", name_en: config.name_en || "", tagline: config.tagline || "",
      contact_phone: config.contact_phone || "", contact_email: config.contact_email || "",
      season_label: config.season_label || "", color_primary: config.color_primary || "#6B1F3A",
      color_accent: config.color_accent || "#0C447C", logo_url: config.logo_url || "", banner_image_url: config.banner_image_url || "", banner_position: (config as any).banner_position || "center", banner_position_x: (config as any).banner_position_x || "50",
    });
  }, [config]);

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
      name_ar: companyForm.name_ar, name_en: companyForm.name_en, tagline: companyForm.tagline,
      contact_phone: companyForm.contact_phone, contact_email: companyForm.contact_email,
      season_label: companyForm.season_label, color_primary: companyForm.color_primary,
      color_accent: companyForm.color_accent, logo_url: companyForm.logo_url, banner_image_url: companyForm.banner_image_url, banner_position: companyForm.banner_position, banner_position_x: companyForm.banner_position_x,
    }).eq("id", 1);
    setCompanySaving(false);
    if (error) { setCompanyMsg("حصل خطأ أثناء الحفظ"); return; }
    setCompanyMsg("تم الحفظ بنجاح — سيتم تحديث الصفحة...");
    setTimeout(() => window.location.reload(), 1200);
  };

  useEffect(() => {
    supabase.from("users").select("*").order("id").then(({ data }: any) => { if (data) setUsers(data); });
  }, []);

  const openAdd = () => { setForm({ name: "", username: "", password: "" }); setPerms(Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, false]))); setEditUser(null); setShowAdd(true); };
  const openEdit = (u: User) => { setForm({ name: u.name, username: u.username, password: "" }); setPerms({ ...u.permissions }); setEditUser(u); setShowAdd(true); };
  const togglePerm = (key: string) => setPerms(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleAll = () => { const allOn = ALL_PERMISSIONS.every(p => perms[p.key]); setPerms(Object.fromEntries(ALL_PERMISSIONS.map(p => [p.key, !allOn]))); };

  const saveUser = async () => {
    if (!form.name || !form.username) return;
    if (editUser) {
      if (form.password.trim()) {
        await supabase.rpc("update_user", { p_id: editUser.id, p_name: form.name, p_username: form.username, p_password: form.password, p_permissions: perms });
      } else {
        await supabase.from("users").update({ name: form.name, username: form.username, permissions: perms }).eq("id", editUser.id);
      }
      setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, name: form.name, username: form.username, permissions: perms } : u));
    } else {
      if (!form.password) return;
      await supabase.rpc("create_user", { p_name: form.name, p_username: form.username, p_password: form.password, p_permissions: perms });
      const { data } = await supabase.from("users").select("*").order("id");
      if (data) setUsers(data as User[]);
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
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      {currentUser.permissions.manage_users && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", marginBottom: 12, background: "var(--paper)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 10 }}>بيانات الشركة</div>

          {/* الشعار + صورة البانر */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            {/* الشعار */}
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, border: "1px solid var(--line)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-2)", flexShrink: 0 }}>
                {companyForm.logo_url
                  ? <img src={companyForm.logo_url} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 22, fontWeight: 800, color: companyForm.color_primary }}>{(companyForm.name_ar || "ح").trim().charAt(0)}</span>}
              </div>
              <label style={{ ...btnS(), cursor: "pointer", display: "inline-block", fontSize:10, padding:"3px 8px" }}>
                {companyUploading ? "جاري الرفع..." : "تغيير الشعار"}
                <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={companyUploading} style={{ display: "none" }} />
              </label>
            </div>
            {/* صورة البانر — preview مع drag */}
            <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
              {/* Preview مع drag */}
              {companyForm.banner_image_url ? (
                <div style={{ position:"relative", width:"100%", height:80, borderRadius:10, overflow:"hidden", border:"1px solid var(--border)", cursor:"ew-resize", userSelect:"none" }}
                  onMouseDown={e => {
                    dragStartRef.current = { x: e.clientX, pos: parseFloat(companyForm.banner_position_x ?? "50") };
                    const onMove = (mv: MouseEvent) => {
                      if (!dragStartRef.current) return;
                      const dx = mv.clientX - dragStartRef.current.x;
                      const newPos = Math.max(0, Math.min(100, dragStartRef.current.pos - dx * 0.5));
                      setCompanyForm(p => ({ ...p, banner_position_x: String(Math.round(newPos)) }));
                    };
                    const onUp = () => { dragStartRef.current = null; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
                    document.addEventListener("mousemove", onMove);
                    document.addEventListener("mouseup", onUp);
                  }}>
                  <img src={companyForm.banner_image_url} alt="banner" style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:(companyForm.banner_position_x ?? "50")+"% "+(companyForm.banner_position ?? "center"), pointerEvents:"none" }} />
                  <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.25)" }}>
                    <div style={{ color:"#fff", fontSize:10, fontWeight:600, display:"flex", alignItems:"center", gap:4 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15l-5-5L5 21"/><path d="M3 9l5 5L18 3"/></svg>
                      اسحب يمين/شمال لضبط الصورة
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ width:"100%", height:80, borderRadius:10, background:"var(--bg-2)", border:"1px dashed var(--border)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
              )}
              {/* أزرار الرفع + أعلى/أسفل */}
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <label style={{ ...btnS(), cursor:"pointer", fontSize:10, padding:"4px 10px", flexShrink:0 }}>
                  {companyUploading ? "جاري الرفع..." : "رفع صورة"}
                  <input type="file" accept="image/*" style={{ display:"none" }} onChange={async e => {
                    const file = e.target.files?.[0]; if (!file) return;
                    const url = await uploadDoc(file, 0, "company_banner");
                    if (url) setCompanyForm(prev => ({ ...prev, banner_image_url: url, banner_position_x: "50" }));
                    e.target.value = "";
                  }} />
                </label>
                {(["top","center","bottom"] as const).map(pos => (
                  <button key={pos} onClick={() => setCompanyForm(p => ({ ...p, banner_position: pos }))}
                    style={{ flex:1, padding:"4px 0", borderRadius:6, border:"1px solid var(--border)", background:companyForm.banner_position===pos?"var(--primary)":"var(--bg-2)", color:companyForm.banner_position===pos?"#fff":"var(--text)", fontSize:10, cursor:"pointer", fontFamily:"var(--font-body)" }}>
                    {pos==="top"?"أعلى":pos==="center"?"وسط":"أسفل"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 6 }}>
            <div><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>اسم الشركة (عربي)</div><input style={{...inp, fontSize:12, padding:"5px 8px"}} value={companyForm.name_ar} onChange={e => setCompanyForm(p => ({ ...p, name_ar: e.target.value }))} /></div>
            <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>اسم الشركة (إنجليزي)</div><input style={inp} value={companyForm.name_en} onChange={e => setCompanyForm(p => ({ ...p, name_en: e.target.value }))} /></div>
          </div>
          <div style={{ marginBottom: 8 }}><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>الشعار النصي (Tagline)</div><input style={inp} value={companyForm.tagline} onChange={e => setCompanyForm(p => ({ ...p, tagline: e.target.value }))} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>رقم التواصل</div><input style={inp} value={companyForm.contact_phone} onChange={e => setCompanyForm(p => ({ ...p, contact_phone: e.target.value }))} /></div>
            <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>البريد الإلكتروني</div><input style={inp} value={companyForm.contact_email} onChange={e => setCompanyForm(p => ({ ...p, contact_email: e.target.value }))} /></div>
          </div>
          <div style={{ marginBottom: 8 }}><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>اسم الموسم</div><input style={inp} value={companyForm.season_label} onChange={e => setCompanyForm(p => ({ ...p, season_label: e.target.value }))} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>اللون الأساسي</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="color" value={companyForm.color_primary} onChange={e => setCompanyForm(p => ({ ...p, color_primary: e.target.value }))} style={{ width: 36, height: 32, padding: 0, border: "0.5px solid var(--border)", borderRadius: 6, cursor: "pointer" }} />
                <input style={{ ...inp, flex: 1 }} value={companyForm.color_primary} onChange={e => setCompanyForm(p => ({ ...p, color_primary: e.target.value }))} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>اللون الثانوي</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="color" value={companyForm.color_accent} onChange={e => setCompanyForm(p => ({ ...p, color_accent: e.target.value }))} style={{ width: 36, height: 32, padding: 0, border: "0.5px solid var(--border)", borderRadius: 6, cursor: "pointer" }} />
                <input style={{ ...inp, flex: 1 }} value={companyForm.color_accent} onChange={e => setCompanyForm(p => ({ ...p, color_accent: e.target.value }))} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={saveCompanyConfig} disabled={companySaving} style={{ ...btnP(), opacity: companySaving ? 0.6 : 1 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> {companySaving ? "جاري الحفظ..." : "حفظ بيانات الشركة"}
            </button>
            {companyMsg && <span style={{ fontSize: 12, color: companyMsg.includes("خطأ") ? "var(--danger)" : "var(--em7)" }}>{companyMsg}</span>}
          </div>
        </div>
      )}

      {currentUser.permissions.manage_users && <button onClick={openAdd} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", marginBottom: 14, background: "linear-gradient(135deg,var(--em7),var(--em6))", color: "#fff", border: "none", padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> مستخدم جديد</button>}
      {users.map(u => (
        <div key={u.id} style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, background: "var(--paper)" }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: u.username === "admin" ? "rgba(200,162,75,0.15)" : "var(--mb)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {u.username === "admin"
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.8"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--mf)" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            }
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{u.name}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>@{u.username} · {Object.values(u.permissions).filter(Boolean).length} صلاحية</div>
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
        <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 3 }}>كلمة المرور{editUser ? " (اتركها فارغة للإبقاء على الحالية)" : ""}</div><input type="password" style={inp} value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder={editUser ? "اتركها فارغة إذا لم تتغير" : ""} /></div>
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

export { UsersPage };
