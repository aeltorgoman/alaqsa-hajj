import { createContext, useContext, useEffect, useState } from "react"; import type { ReactNode } from "react";
import type { AppConfig } from "./AppConfig";

// ===== أنواع الثيمات =====
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

// ===== Context =====
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

// ===== Provider =====
export function ThemeProvider({
  children,
  config,
}: {
  children: ReactNode;
  config?: AppConfig;
}) {
  // الثيم بييجي من:
  // ١. localStorage (اختيار المستخدم)
  // ٢. config.theme (إعداد الشركة من Supabase)
  // ٣. "qatar-heritage" افتراضي
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

  // تطبيق الثيم على الـ document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", themeId);

    // إزالة كل الثيمات القديمة
    THEMES.forEach(t => document.body.classList.remove(`theme-${t.id}`));
    document.body.classList.add(`theme-${themeId}`);

    // Dark mode للمتصفح
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

// ===== Hook =====
export function useTheme() {
  return useContext(ThemeContext);
}

// ===== مكوّن اختيار الثيم =====
export function ThemeSwitcher() {
  const { themeId, setTheme, themes } = useTheme();

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 6,
      padding: "8px 0",
    }}>
      <div style={{
        fontSize: 10,
        color: "var(--text-sidebar-muted)",
        padding: "0 12px",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        marginBottom: 2,
      }}>
        المظهر
      </div>
      {themes.map(theme => (
        <div
          key={theme.id}
          onClick={() => setTheme(theme.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            cursor: "pointer",
            borderRadius: "0 8px 8px 0",
            marginLeft: 4,
            background: themeId === theme.id ? "var(--bg-sidebar-hover)" : "transparent",
            border: themeId === theme.id ? `1px solid var(--border-sidebar)` : "1px solid transparent",
            transition: "var(--transition)",
          }}
        >
          {/* معاينة الألوان */}
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: theme.preview.sidebar, border: "1px solid rgba(255,255,255,0.2)" }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: theme.preview.primary }} />
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: theme.preview.bg, border: "1px solid rgba(0,0,0,0.1)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--text-sidebar)", fontWeight: themeId === theme.id ? 600 : 400 }}>
              {theme.nameAr}
            </div>
          </div>
          {themeId === theme.id && (
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)", flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
  );
}
