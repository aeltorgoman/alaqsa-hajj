/* ═══ أوّليّاتُ العرض المشتركة ═══
   البطاقةُ وترويستُها ووحدةُ المعلومة وزرُّ الخريطة. كانت أربعَ
   مغلَّفاتٍ داخل `PilgrimPortal` تلتقط `brand` و`gold` و`fontD` من
   محيطها؛ فصارت مكوّناتٍ تأخذ `t` (سمةَ البوابة) صراحةً.

   ⚠️ والأنماطُ منقولةٌ حرفاً بحرف — كلُّ رقمٍ ولونٍ وحدٍّ كما كان.
   وهذه الأربعةُ تستحقّ الاستخراج لأنّ لها **استعمالاً حقيقيّاً
   متكرّراً** عبر بطاقاتٍ عدّة، لا لأنّها تختصر أسطراً. */
import type { ReactNode } from "react";
import { Icon, ICONS } from "./PortalIcons";
import { INK, LABEL, type PortalTheme } from "./portal.theme";


export function CardHeader(
  { t, icon, title, sub, bigTitle = false }:
  { t: PortalTheme; icon: string; title: string; sub?: string; bigTitle?: boolean },
) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <div style={{ width: 46, height: 46, borderRadius: 13, background: `${t.gold}1e`, border: `1.5px solid ${t.gold}55`, display: "flex", alignItems: "center", justifyContent: "center", color: t.goldDark, flexShrink: 0 }}><Icon d={icon} size={23} /></div>
      <div>
        <div style={{ fontFamily: t.fontD, fontWeight: 800, fontSize: bigTitle ? 26 : 22, color: INK }}>{title}</div>
        {sub && <div style={{ fontSize: 16, fontWeight: 600, color: LABEL, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ═══ وحدةُ المعلومة — التسميةُ فوق قيمتها ═══
   جُرِّب الجنبُ إلى الجنب («الغرفة ١٢٠٤» في سطر) فانضغطت الثلاثةُ
   في سطرٍ واحدٍ على الجوّال وصارت تُقرأ نصّاً متّصلاً لا ثلاثَ
   معلومات. فصُفَّت رأسيّاً: تسميةٌ صغيرةٌ هادئة، وتحتها القيمةُ
   ثقيلةً كبيرة. */
export function InfoUnit(
  { t, k, v, big = false, full = false }:
  { t: PortalTheme; k: string; v: string; big?: boolean; full?: boolean },
) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 1, minWidth: 0,
      flex: full ? "1 1 100%" : "1 1 auto",
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: LABEL, lineHeight: 1.6 }}>{k}</span>
      <span style={{
        fontFamily: t.fontD, fontWeight: 900, fontSize: big ? 24 : 19,
        color: big ? t.brand : INK, lineHeight: 1.35,
        minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word",
      }}>{v}</span>
    </div>
  );
}

/* الوحداتُ تتجاور ما اتّسع السطر ثم تنزل — لا شبكةَ ثابتة تكسر
   عند اسمٍ طويل، ولا عمودٌ يهدر عرض الشاشة عند اسمٍ قصير. */
export function InfoUnits({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "14px 20px", padding: "2px 0" }}>{children}</div>
  );
}

const mapsUrl = (q: string) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}`;

export function AddressLink(
  { t, address, url }: { t: PortalTheme; address: string; url?: string | null },
) {
  return (
    <a href={url || mapsUrl(address)} target="_blank" rel="noreferrer"
      style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12, background: `${t.gold}18`, border: `1.5px solid ${t.gold}66`, borderRadius: 13, padding: "12px 14px", textDecoration: "none" }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: t.gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon d={ICONS.pin} size={18} color="#fff" />
      </div>
      <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: INK, lineHeight: 1.8 }}>{address}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: t.goldDark, fontFamily: t.fontD, whiteSpace: "nowrap" }}>افتح الخريطة</span>
    </a>
  );
}
