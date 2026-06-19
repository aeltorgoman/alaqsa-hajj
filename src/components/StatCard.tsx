// كومبوننت موحّد لكروت الإحصائيات — يُستخدم في PassengersPage, FlightsPage,
// BusesPage, CampsPage, HotelPage بدل تكرار نفس بنية الكارت في كل صفحة.
// الألوان مربوطة بالمتغيرات الدلالية للثيم (--success/--danger/--warning/--info)
// عشان تتقرى صح في كل الثيمات بما فيها الداكن، وتتظبط تلقائياً مع أي ثيم جديد.

export type StatTone = "brand" | "success" | "danger" | "warning" | "info" | "muted" | "female";

const TONE_STYLES: Record<StatTone, { border: string; clr: string; bg: string }> = {
  brand:   { border: "#c8a24b",          clr: "var(--em8)",        bg: "var(--paper)" },
  success: { border: "var(--success)",   clr: "var(--success)",    bg: "var(--success-bg)" },
  danger:  { border: "var(--danger)",    clr: "var(--danger)",     bg: "var(--danger-bg)" },
  warning: { border: "var(--warning)",   clr: "var(--warning)",    bg: "var(--warning-bg)" },
  info:    { border: "var(--info)",      clr: "var(--info)",       bg: "var(--info-bg)" },
  female:  { border: "var(--female-fg)", clr: "var(--female-fg)",  bg: "var(--female-bg)" },
  muted:   { border: "#ccc",             clr: "var(--muted)",      bg: "var(--paper)" },
};

export interface StatCardData {
  label: string;
  num: string | number;
  sub: string;
  tone: StatTone;
}

/** كارت إحصائية واحد */
export function StatCard({ label, num, sub, tone }: StatCardData) {
  const s = TONE_STYLES[tone];
  return (
    <div style={{ background: s.bg, border: "1.5px solid var(--line)", borderRight: `4px solid ${s.border}`, borderRadius: 10, padding: "11px 14px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 700, lineHeight: 1, color: s.clr }}>{num}</div>
      <div style={{ fontSize: 11, marginTop: 4, color: "var(--g7)" }}>{sub}</div>
    </div>
  );
}

/** صف كروت إحصائية — شبكة بعدد أعمدة مرن حسب عدد الكروت */
export function StatsRow({ cards }: { cards: StatCardData[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cards.length},1fr)`, gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--ivory)" }}>
      {cards.map(c => <StatCard key={c.label} {...c} />)}
    </div>
  );
}
