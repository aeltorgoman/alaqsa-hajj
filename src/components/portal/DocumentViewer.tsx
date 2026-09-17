/* ═══ عارضُ المستند ═══
   شاشةٌ كاملةٌ لمستندٍ واحد. **لا توقيعَ هنا ولا وصولَ تخزين**:
   الرابطُ الموقَّع يصل جاهزاً من الأب، فيبقى نموذجُ الوصول حيث هو.

   ⚠️ ونوعُ العرض يأتي من الخادم (`is_pdf`) لا من امتداد الرابط.
   وبديلُ الصفحة المستقلّة يبقى ظاهراً دائماً لمتصفّحاتٍ لا تعرض
   PDF داخل إطار (iOS Safari أشهرُها). */
import type { ReactNode } from "react";
import { Icon, ICONS } from "./PortalIcons";
import type { PortalTheme } from "./portal.theme";

type Props = {
  t: PortalTheme;
  doc: { title: string; url: string; isPdf: boolean };
  showDownload: boolean;
  bannerH: number;
  banner: ReactNode;
  onClose: () => void;
};

export function DocumentViewer({ t, doc, showDownload, bannerH, banner, onClose }: Props) {
  /* نوع العرض يأتي من الخادم: الرابط الموقّع لا يُقرأ منه امتداد */
  const isPdf = doc.isPdf;
  return (

      <div dir="rtl" style={{ minHeight: "100dvh", background: "#1c0d12", fontFamily: t.font, display: "flex", flexDirection: "column", paddingTop: bannerH }}>
        {banner}
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, color: "#fff" }}>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.13)", border: "none", borderRadius: 13, width: 46, height: 46, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon d={ICONS.back} size={22} /></button>
          <div style={{ fontFamily: t.fontD, fontWeight: 800, fontSize: 19, flex: 1 }}>{doc.title}</div>
          {showDownload && <a href={doc.url} download target="_blank" rel="noreferrer" style={{ background: t.goldBright, borderRadius: 13, padding: "11px 20px", color: t.brandDeep, fontSize: 15, fontWeight: 800, textDecoration: "none", display: "flex", alignItems: "center", gap: 8, fontFamily: t.fontD }}><Icon d={ICONS.download} size={17} />تنزيل</a>}
        </div>
        <div style={{ flex: 1, padding: "0 12px 12px" }}>
          {isPdf
            ? <>
                <iframe src={doc.url} title={doc.title} style={{ width: "100%", height: "100%", minHeight: "74dvh", border: "none", borderRadius: 15, background: "#fff" }} />
                {/* بعضُ المتصفّحات — وiOS Safari أشهرُها — لا تعرض PDF
                    داخل إطار، فتبقى مساحةٌ بيضاء بلا تفسير. فيُعرض
                    مخرجٌ صريحٌ دائماً: الرابطُ الموقّع نفسه في صفحةٍ
                    مستقلّة. ولا يُغيَّر التوقيعُ ولا مدّتُه ولا مصدرُه. */}
                <a href={doc.url} target="_blank" rel="noreferrer"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, marginTop: 10, borderRadius: 13, background: "rgba(255,255,255,.14)", border: "1.5px solid rgba(255,255,255,.3)", color: "#fff", fontFamily: t.fontD, fontWeight: 800, fontSize: 15.5, textDecoration: "none" }}>
                  لا يظهر المستند؟ افتحه في صفحة مستقلة
                </a>
              </>
            : <img src={doc.url} alt={doc.title} style={{ width: "100%", borderRadius: 15 }} />}
        </div>
      </div>
  );
}
