/* ═══ عارضُ المستند ═══
   شاشةٌ كاملةٌ لمستندٍ واحد. **لا توقيعَ هنا ولا وصولَ تخزين**:
   الرابطُ الموقَّع يصل جاهزاً من الأب، فيبقى نموذجُ الوصول حيث هو.

   ⚠️ ونوعُ العرض يأتي من الخادم (`is_pdf`) لا من امتداد الرابط.
   والـPDF يُصيَّر داخل الصفحة (`PortalPdfView`) لا في `<iframe>`: Chrome
   على Android لا يعرضه في إطار، وSafari على iPhone يعرض أولى صفحاته.
   والصورةُ كما كانت. وبديلُ الصفحة المستقلّة باقٍ لمتصفّحٍ تعذّر فيه العرض. */
import { useState, type ReactNode } from "react";
import { Icon, ICONS } from "./PortalIcons";
import type { PortalTheme } from "./portal.theme";
import { PortalPdfView } from "./PortalPdfView";
import type { PortalDocType } from "../../utils";

/* اسمُ الملفّ المنزَّل لاتينيٌّ عمداً: Chromium يُسقط الاسمَ العربيَّ في خاصيّة
   `download` ويسمّيه «download» */
const DOWNLOAD_NAME: Record<PortalDocType, string> = {
  flight_ticket: "flight-ticket", hajj_permit: "hajj-permit", photo: "photo",
};

type Props = {
  t: PortalTheme;
  doc: { title: string; url: string; isPdf: boolean; type: PortalDocType };
  /** بايتاتُ الـPDF عبر مسار البوابة نفسِه (`portalDocBytes`) */
  loadPdf: (signal: AbortSignal) => Promise<Uint8Array>;
  showDownload: boolean;
  bannerH: number;
  banner: ReactNode;
  onClose: () => void;
};

export function DocumentViewer({ t, doc, loadPdf, showDownload, bannerH, banner, onClose }: Props) {
  /* نوع العرض يأتي من الخادم: الرابط الموقّع لا يُقرأ منه امتداد */
  const isPdf = doc.isPdf;
  /* تنزيلُ الـPDF من الملفّ المتحقَّق منه نفسِه (Blob على أصل البوابة): خاصيّةُ
     `download` تُهمَل على رابطٍ من أصلٍ آخر، فكان «تنزيل» يفتح الملفَّ ولا ينزّله */
  const [pdfDownload, setPdfDownload] = useState("");
  const downloadHref = isPdf ? pdfDownload : doc.url;
  const fileName = `${DOWNLOAD_NAME[doc.type]}${isPdf ? ".pdf" : ""}`;
  return (

      <div dir="rtl" style={{ minHeight: "100dvh", background: "#1c0d12", fontFamily: t.font, display: "flex", flexDirection: "column", paddingTop: bannerH }}>
        {banner}
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, color: "#fff" }}>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.13)", border: "none", borderRadius: 13, width: 46, height: 46, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon d={ICONS.back} size={22} /></button>
          <div style={{ fontFamily: t.fontD, fontWeight: 800, fontSize: 19, flex: 1 }}>{doc.title}</div>
          {showDownload && downloadHref && <a href={downloadHref} download={fileName} target={isPdf ? undefined : "_blank"} rel="noreferrer" data-testid="doc-download" style={{ background: t.goldBright, borderRadius: 13, padding: "11px 20px", color: t.brandDeep, fontSize: 15, fontWeight: 800, textDecoration: "none", display: "flex", alignItems: "center", gap: 8, fontFamily: t.fontD }}><Icon d={ICONS.download} size={17} />تنزيل</a>}
        </div>
        <div style={{ flex: 1, padding: "0 12px 12px" }}>
          {isPdf
            ? <PortalPdfView t={t} title={doc.title} loadBytes={loadPdf} showDownload={showDownload}
                fallbackUrl={doc.url} onDownloadUrl={setPdfDownload} />
            : <img src={doc.url} alt={doc.title} style={{ width: "100%", borderRadius: 15 }} />}
        </div>
      </div>
  );
}
