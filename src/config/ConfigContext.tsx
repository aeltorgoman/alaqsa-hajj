import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { AppConfig } from "./AppConfig";
import { DEFAULT_CONFIG } from "./AppConfig";
import { ThemeProvider } from "./ThemeContext";
import { CompanyContext } from "../company/CompanyContext";
import { companyService, normalizeCompanyProfile } from "../company/companyService";
import type { Database } from "../types/database";
import { applyCompanyMetadata } from "../company/companyMetadata";

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<Database["public"]["Tables"]["company_assets"]["Row"][]>([]);

  useEffect(() => {
    companyService.load().then(({ config: data, assets: assetRows, error }) => {
        if (data && !error) {
          const featureValues = data.features && typeof data.features === "object" && !Array.isArray(data.features)
            ? data.features : {};
          setConfig({
            ...DEFAULT_CONFIG, ...data,
            features: { ...DEFAULT_CONFIG.features, ...featureValues },
          } as unknown as AppConfig);
          /* حفظ نسخة محلية تُستخدم في شاشة البدء بالزيارات القادمة */
          try {
            localStorage.setItem("hajj_company_boot", JSON.stringify({
              name_ar: data.name_ar || "",
              tagline: data.tagline || "",
              logo_url: data.logo_url || "",
              color_primary: data.color_primary || "",
              color_accent: data.color_accent || "",
            }));
          } catch { /* التخزين المحلي غير متاح */ }
        }
        setAssets(assetRows);
        setLoading(false);
      });
  }, []);

  const profile = normalizeCompanyProfile(config, assets);
  useEffect(() => { applyCompanyMetadata(profile); }, [profile]);

  if (loading) {
    /* قراءة آخر إعدادات محفوظة — تُملأ الشاشة ببيانات الحملة الحقيقية */
    let boot: { name_ar?: string; tagline?: string; logo_url?: string; color_primary?: string; color_accent?: string } = {};
    try {
      const raw = localStorage.getItem("hajj_company_boot") || localStorage.getItem("aqsa_boot_config");
      if (raw) {
        boot = JSON.parse(raw);
        localStorage.setItem("hajj_company_boot", raw);
        localStorage.removeItem("aqsa_boot_config");
      }
    } catch { /* التخزين المحلي غير متاح */ }

    /* الألوان: من إعدادات الحملة إن وُجدت، وإلا ألوان النظام الافتراضية */
    const primary = boot.color_primary || "#7D1F3C";  /* عنابي الثيم الافتراضي */
    const accent  = boot.color_accent  || "#c8a24b";  /* ذهبي الثيم الافتراضي */
    const accentSoft = "#e7cd8a";
    const hasIdentity = Boolean(boot.name_ar);

    /* تدرّج الخلفية مشتق من اللون الأساسي */
    const darken = (hex: string, amount = 0.28) => {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!m) return hex;
      const [r, g, b] = [1, 2, 3].map(i => Math.round(parseInt(m[i], 16) * (1 - amount)));
      return `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
    };
    const primaryDark = darken(primary);

    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", fontFamily: "'Tajawal', sans-serif",
        background: `linear-gradient(150deg, ${primaryDark} 0%, ${primary} 55%, ${primaryDark} 100%)`,
        position: "relative", overflow: "hidden",
      }}>
        <link href="https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@500;600&family=Tajawal:wght@400;500&display=swap" rel="stylesheet" />
        {/* نقشة النجمة الثمانية الخافتة في الخلفية */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.07, pointerEvents: "none",
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Cpath d='M52,30 L38.3,33.4 L45.6,45.6 L33.4,38.3 L30,52 L26.6,38.3 L14.4,45.6 L21.7,33.4 L8,30 L21.7,26.6 L14.4,14.4 L26.6,21.7 L30,8 L33.4,21.7 L45.6,14.4 L38.3,26.6 Z' fill='none' stroke='%23${accentSoft.replace("#", "")}' stroke-width='1.1'/%3E%3C/svg%3E")`,
        }} />
        <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
          {/* شعار الحملة إن وُجد، وإلا النجمة الدوّارة */}
          {boot.logo_url ? (
            <img src={boot.logo_url} alt="" style={{
              width: 76, height: 76, objectFit: "contain", borderRadius: "50%",
              border: `2px solid ${accentSoft}`, background: "rgba(255,255,255,.08)",
              padding: 5, margin: "0 auto 18px", display: "block",
              animation: "company-fade .5s ease",
            }} />
          ) : (
            <svg width="64" height="64" viewBox="0 0 44 44" fill="none" stroke={accentSoft} strokeWidth="1.4" style={{ margin: "0 auto 18px", display: "block", animation: "company-spin 3.2s linear infinite" }}>
              <path d="M22 3 L26.5 8.5 L33.5 8 L33 15 L38.5 19.5 L33 24 L33.5 31 L26.5 30.5 L22 36 L17.5 30.5 L10.5 31 L11 24 L5.5 19.5 L11 15 L10.5 8 L17.5 8.5 Z" />
              <circle cx="22" cy="19.5" r="4.5" fill={accentSoft} stroke="none" />
            </svg>
          )}

          {hasIdentity ? (
            <>
              <div style={{ fontFamily: "'Reem Kufi', serif", fontWeight: 600, fontSize: 22, color: "#fffdf8", marginBottom: 6, letterSpacing: "0.5px" }}>
                {boot.name_ar}
              </div>
              {boot.tagline && (
                <div style={{ fontSize: 12, color: "rgba(231,205,138,0.85)", letterSpacing: "1px", marginBottom: 22 }}>
                  {boot.tagline}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: "rgba(231,205,138,0.85)", letterSpacing: "1px", marginBottom: 22 }}>
              جارٍ التحميل...
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent, animation: "company-pulse 1.2s ease-in-out infinite" }} />
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent, animation: "company-pulse 1.2s ease-in-out 0.2s infinite" }} />
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent, animation: "company-pulse 1.2s ease-in-out 0.4s infinite" }} />
          </div>
        </div>
        <style>{`
          @keyframes company-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes company-pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.15); } }
          @keyframes company-fade { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: scale(1); } }
        `}</style>
      </div>
    );
  }

  return (
    <CompanyContext.Provider value={profile}>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </CompanyContext.Provider>
  );
}
