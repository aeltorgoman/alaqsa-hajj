// كومبوننت موحّد لكروت الإحصائيات — يُستخدم في PassengersPage, FlightsPage,
// BusesPage, CampsPage, HotelPage بدل تكرار نفس بنية الكارت في كل صفحة.
// الألوان ثابتة ومستقلة عن الثيم — تدرجات جريئة بنص أبيض.

export type StatTone = "brand" | "success" | "danger" | "warning" | "info" | "muted" | "female";

const TONE_STYLES: Record<StatTone, { grad: string; shadow: string; icon: string }> = {
  brand: {
    grad: "linear-gradient(135deg, #5C1228 0%, #A8294F 100%)",
    shadow: "rgba(92,18,40,.45)",
    icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  },
  success: {
    grad: "linear-gradient(135deg, #064E3B 0%, #059669 100%)",
    shadow: "rgba(6,78,59,.4)",
    icon: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
  },
  danger: {
    grad: "linear-gradient(135deg, #7F1D1D 0%, #DC2626 100%)",
    shadow: "rgba(220,38,38,.4)",
    icon: `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`,
  },
  warning: {
    grad: "linear-gradient(135deg, #8B6700 0%, #D4A017 100%)",
    shadow: "rgba(212,160,23,.45)",
    icon: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
  },
  info: {
    grad: "linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)",
    shadow: "rgba(37,99,235,.4)",
    icon: `<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>`,
  },
  female: {
    grad: "linear-gradient(135deg, #831843 0%, #DB2777 100%)",
    shadow: "rgba(219,39,119,.4)",
    icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  },
  muted: {
    grad: "linear-gradient(135deg, #374151 0%, #6B7280 100%)",
    shadow: "rgba(55,65,81,.35)",
    icon: `<circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>`,
  },
};

export interface StatCardData {
  label: string;
  num: string | number;
  sub: string;
  tone: StatTone;
  /** مسار SVG اختياري (Lucide) — يُستخدم بدلاً من الأيقونة الافتراضية للـ tone */
  icon?: string;
}

/** كارت إحصائية واحد */
export function StatCard({ label, num, sub, tone, icon }: StatCardData) {
  const s = TONE_STYLES[tone];
  const iconPath = icon ?? s.icon;
  return (
    <div
      style={{
        background: s.grad,
        borderRadius: 14,
        padding: "14px 16px",
        boxShadow: `0 6px 18px ${s.shadow}`,
        position: "relative",
        overflow: "hidden",
        transition: "transform .15s, box-shadow .15s",
        cursor: "default",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 10px 24px ${s.shadow}`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "none";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 6px 18px ${s.shadow}`;
      }}
    >
      {/* دائرة زخرفية خلفية */}
      <div style={{
        position: "absolute", bottom: -18, left: -18,
        width: 72, height: 72, borderRadius: "50%",
        background: "rgba(255,255,255,.08)",
        pointerEvents: "none",
      }} />
      {/* أيقونة + عنوان */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: "rgba(255,255,255,.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <svg
            width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="white" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            dangerouslySetInnerHTML={{ __html: iconPath }}
          />
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.85)", fontWeight: 700 }}>{label}</div>
      </div>
      {/* الرقم الرئيسي */}
      <div style={{
        fontFamily: "var(--font-heading)",
        fontSize: 36, fontWeight: 900,
        color: "white", lineHeight: 1,
        letterSpacing: "-1px",
      }}>{num}</div>
      {/* النص الفرعي */}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.72)", fontWeight: 600, marginTop: 5 }}>{sub}</div>
    </div>
  );
}

/** صف كروت إحصائية — شبكة بعدد أعمدة مرن حسب عدد الكروت */
export function StatsRow({ cards }: { cards: StatCardData[] }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cards.length}, 1fr)`,
      gap: 10,
      padding: "12px 14px",
      borderBottom: "1px solid var(--line)",
      flexShrink: 0,
    }}>
      {cards.map(c => <StatCard key={c.label} {...c} />)}
    </div>
  );
}
