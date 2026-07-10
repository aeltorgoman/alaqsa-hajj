/* ═══════════════════════════════════════════════════════
   LoadingSpinner — مؤشر تحميل موحد بألوان الهوية
   ═══════════════════════════════════════════════════════ */

function LoadingSpinner({ label = "جارٍ تحميل البيانات..." }: { label?: string }) {
  return (
    <div style={{
      flex: 1, minHeight: 300, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 14,
      direction: "rtl", fontFamily: "var(--font-body)",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        border: "3px solid var(--line)",
        borderTopColor: "var(--primary)",
        animation: "hajjSpin .8s linear infinite",
      }} />
      <div style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: 600 }}>{label}</div>
      <style>{`
        @keyframes hajjSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export { LoadingSpinner };
