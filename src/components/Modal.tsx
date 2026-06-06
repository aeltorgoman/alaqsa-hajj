export function Modal({ show, onClose, title, children, maxWidth = 420 }: any) {
  if (!show) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "white", borderRadius: 12, width: "92%", maxWidth,
        maxHeight: "88%", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.15)"
      }}>
        <div style={{
          padding: "12px 16px", borderBottom: "0.5px solid #e5e5e5",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          position: "sticky", top: 0, background: "white", zIndex: 1
        }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#888" }}>✕</button>
        </div>
        <div style={{ padding: "14px 16px" }}>{children}</div>
      </div>
    </div>
  );
}
