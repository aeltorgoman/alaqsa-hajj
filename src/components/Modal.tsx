import React from "react";

function Modal({ show, onClose, title, children, maxWidth = 420 }: { show: boolean; onClose: () => void; title: string; children?: React.ReactNode; maxWidth?: number; }) {
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

export { Modal };
