import { createContext, useContext, useEffect, useState } from "react"; import type { ReactNode } from "react";
import type { AppConfig } from "./AppConfig";

export type ThemeId = "qatar-heritage" | "dark-heritage" | "modern-green" | "royal-emerald";

export interface Theme {
  id: ThemeId;
  name: string;
  nameAr: string;
  description: string;
  preview: {
    primary: string;
    bg: string;
    sidebar: string;
  };
}

export const THEMES: Theme[] = [
  {
    id: "qatar-heritage",
    name: "Qatar Heritage",
    nameAr: "التراث القطري",
    description: "بورجوندي وذهبي — هوية عريقة",
    preview: { primary: "#7D1F3C", bg: "#F5EFE8", sidebar: "#2C0E1A" },
  },
  {
    id: "dark-heritage",
    name: "Dark Heritage",
    nameAr: "التراث الداكن",
    description: "داكن فاخر — نبيتي وذهبي",
    preview: { primary: "#C9A84C", bg: "#0F0A0C", sidebar: "#080F0C" },
  },
  {
    id: "modern-green",
    name: "Modern Blue",
    nameAr: "الأزرق العصري",
    description: "أزرق ملكي احترافي نظيف",
    preview: { primary: "#0C5FA8", bg: "#F3F7FA", sidebar: "#073E6E" },
  },
  {
    id: "royal-emerald",
    name: "Royal Emerald",
    nameAr: "زمردي ملكي",
    description: "أخضر غامق وذهبي — وقار ملكي",
    preview: { primary: "#0f5340", bg: "#F6F3EA", sidebar: "#0b3b2e" },
  },
];

interface ThemeContextValue {
  themeId: ThemeId;
  theme: Theme;
  setTheme: (id: ThemeId) => void;
  themes: Theme[];
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: "qatar-heritage",
  theme: THEMES[0],
  setTheme: () => {},
  themes: THEMES,
});

export function ThemeProvider({
  children,
  config,
}: {
  children: ReactNode;
  config?: AppConfig;
}) {
  const getInitialTheme = (): ThemeId => {
    try {
      const saved = localStorage.getItem("hajj_theme") as ThemeId;
      if (saved && THEMES.find(t => t.id === saved)) return saved;
    } catch {}
    const configTheme = (config as any)?.theme as ThemeId;
    if (configTheme && THEMES.find(t => t.id === configTheme)) return configTheme;
    return "qatar-heritage";
  };

  const [themeId, setThemeId] = useState<ThemeId>(getInitialTheme);

  const setTheme = (id: ThemeId) => {
    setThemeId(id);
    try { localStorage.setItem("hajj_theme", id); } catch {}
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeId);
    THEMES.forEach(t => document.body.classList.remove(`theme-${t.id}`));
    document.body.classList.add(`theme-${themeId}`);
    const isDark = themeId === "dark-heritage";
    document.documentElement.classList.toggle("dark", isDark);
  }, [themeId]);

  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];

  return (
    <ThemeContext.Provider value={{ themeId, theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/* ── [FIX #3] ThemeSwitcher — ألوان مرتبطة بالثيم وليس بالـ sidebar ── */
export function ThemeSwitcher() {
  const { themeId, setTheme, themes } = useTheme();
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 0" }}>
      <div style={{
        fontSize: 10, color: "var(--text-muted)",
        padding: "0 12px", letterSpacing: "0.05em",
        textTransform: "uppercase", marginBottom: 4,
        fontWeight: 600,
      }}>
        المظهر
      </div>
      {themes.map(t => {
        const active = themeId === t.id;
        return (
          <div
            key={t.id}
            onClick={() => setTheme(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 12px", cursor: "pointer",
              borderRadius: 9, margin: "0 6px",
              background: active ? `${theme.preview.primary}15` : "transparent",
              border: active ? `1px solid ${theme.preview.primary}40` : "1px solid transparent",
              transition: "all .15s",
            }}
            onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-2)"; }}
            onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
          >
            {/* معاينة الألوان */}
            <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: t.preview.sidebar, border: "1px solid rgba(0,0,0,.15)" }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: t.preview.primary }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: t.preview.bg, border: "1px solid rgba(0,0,0,.1)" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "var(--ink)", fontWeight: active ? 700 : 400 }}>{t.nameAr}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>{t.description}</div>
            </div>
            {active && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={theme.preview.primary} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
