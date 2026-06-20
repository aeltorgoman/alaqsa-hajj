import * as XLSX from "xlsx";
import { supabase } from "../supabase";

export function makeShort(fullName: string): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 3) return parts.join(" ");
  return [parts[0], parts[1], parts[parts.length - 1]].join(" ");
}

export function isExpiringSoon(dateStr: string): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  const now = new Date();
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  return d >= now && d < sixMonths;
}

export function isExpired(dateStr: string): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  return d < new Date();
}

export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  let d: Date | null = null;
  const parts = dateStr.split(/[\/\-.]/).map(s => s.trim());
  if (parts.length === 3) {
    if (parts[0].length === 4) d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    else d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
  }
  if (!d || isNaN(d.getTime())) return null;
  return d;
}

// وقت نسبي (منذ X) — يُستخدم لعرض وقت إضافة الحاج في "آخر المضافين"
export function timeAgo(isoString?: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "الآن";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `منذ ${diffHour} ساعة`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `منذ ${diffDay} يوم`;
  const diffMonth = Math.floor(diffDay / 30);
  return `منذ ${diffMonth} شهر`;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve((e.target?.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function scanDocument(file: File, mode: "passport" | "idcard" | "hajj_permit" | "auto"): Promise<any> {
  const base64 = await fileToBase64(file);
  const response = await fetch("https://zkucwcnclbfvukhdqhgc.supabase.co/functions/v1/Scan-passport", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64, mediaType: file.type, mode })
  });
  const data = await response.json();
  const text = data.content ? data.content.map((i: any) => i.text || "").join("") : JSON.stringify(data);
  let parsed: any = {};
  try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); } catch {}
  return parsed;
}

export async function downloadFile(url: string) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = url.split("/").pop() || "file";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch { window.open(url, "_blank"); }
}

export function getStoragePath(url: string): string {
  const prefix = "/storage/v1/object/public/passengers-docs/";
  const idx = url.indexOf(prefix);
  if (idx === -1) return "";
  return decodeURIComponent(url.slice(idx + prefix.length));
}

export function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) { resolve(file); return; }
    const isPng = file.type === "image/png";
    const outputType = isPng ? "image/png" : "image/jpeg";
    const outputQuality = isPng ? 1 : 0.8;
    const img = new Image();
    img.onload = () => {
      const maxDim = 1400;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = height * maxDim / width; width = maxDim; }
        else { width = width * maxDim / height; height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx && !isPng) {
        ctx.fillStyle = "var(--text-inverse)";
        ctx.fillRect(0, 0, width, height);
      }
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob(b => resolve(b || file), outputType, outputQuality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export async function uploadDoc(file: File, passengerId: number, docType: string): Promise<string | null> {
  const compressed = await compressImage(file);
  const isPng = file.type === "image/png";
  const ext = file.type === "application/pdf" ? "pdf" : isPng ? "png" : "jpg";
  const contentType = file.type === "application/pdf" ? "application/pdf" : isPng ? "image/png" : "image/jpeg";
  const path = `${passengerId}/${docType}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("passengers-docs").upload(path, compressed, { upsert: true, contentType });
  if (error) { console.error("upload error", error); return null; }
  const { data } = supabase.storage.from("passengers-docs").getPublicUrl(path);
  return data?.publicUrl || null;
}

export function makeHTML(
  title: string,
  body: string,
  landscape = false,
  logoUrl = "",
  companyName = "حملة الأقصى",
  tagline = "",
  primaryColor = "#6B1F3A",
  accentColor = "#0C447C",
  noHeader = false
) {
  const initial = (companyName || "ح").trim().charAt(0);
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="logo" />`
    : `<span>${initial}</span>`;
  const now = new Date();
  const dateStr = now.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  // نقشة إسلامية (Girih) متشابكة بخطوط ذهبية أوضح (حوالي 5 نقشات في الصف)
  const patternSVG = `<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 220.51 231.81'><g transform='translate(-17.745323,243.518726) scale(0.1,-0.1)' fill='#D4A017' fill-opacity='0.24' stroke='none'><path d='M1155 2395 c-156 -62 -144 -47 -147 -171 l-3 -105 -62 85 c-34 47 -68 86 -75 86 -26 0 -271 -69 -277 -78 -161 -243 -158 -230 -85 -328 68 -92 69 -91 -44 -53 -109 36 -98 41 -202 -86 l-83 -100 6 -140 c6 -164 3 -159 126 -196 99 -29 99 -29 0 -58 -123 -37 -120 -32 -126 -196 l-6 -140 83 -100 c104 -127 93 -122 202 -86 113 38 112 39 44 -53 -73 -98 -76 -86 85 -328 5 -8 251 -78 277 -78 7 0 41 39 75 86 l62 85 3 -104 c3 -124 -8 -111 149 -172 l123 -48 123 48 c157 61 146 48 149 172 l3 104 62 -85 c34 -47 68 -86 75 -86 26 0 271 69 277 78 161 243 158 230 85 328 -68 92 -69 91 44 53 109 -36 98 -41 202 86 l83 100 -6 140 c-6 164 -3 159 -126 196 -99 29 -99 29 0 58 121 36 118 33 127 189 8 152 13 137 -86 257 -95 116 -86 112 -194 76 -113 -38 -112 -39 -44 53 72 97 73 96 -85 328 -6 9 -252 78 -277 78 -7 0 -41 -39 -75 -86 l-62 -85 -3 104 c-3 124 7 111 -145 171 -141 55 -117 55 -252 1z m216 -73 l94 -38 3 -141 3 -140 -91 -124 c-50 -68 -95 -124 -100 -124 -5 0 -50 56 -100 124 l-91 124 3 140 3 141 90 37 c50 21 90 38 91 38 0 1 43 -16 95 -37z m-442 -234 l81 -113 0 -157 c0 -117 -3 -158 -12 -158 -7 0 -77 21 -156 48 l-144 47 -72 100 c-40 55 -76 106 -80 113 -6 10 39 94 95 174 6 9 162 56 191 57 11 1 47 -41 97 -111z m895 88 c48 -14 89 -26 91 -28 27 -31 104 -165 100 -176 -3 -8 -38 -60 -79 -115 l-74 -102 -144 -47 c-79 -27 -149 -48 -156 -48 -9 0 -12 41 -12 158 l0 157 81 113 c44 61 86 112 92 112 7 0 52 -11 101 -24z m-660 -411 l64 -90 -16 -28 c-26 -45 -35 -48 -78 -34 l-39 14 -3 118 c-1 66 0 117 2 114 3 -3 34 -45 70 -94z m299 -135 c-42 -37 -87 -30 -115 17 l-16 28 66 93 67 93 3 -112 c1 -62 -1 -115 -5 -119z m-941 98 l127 -43 74 -100 c40 -55 83 -114 95 -132 l22 -32 -156 -49 -156 -50 -125 42 c-145 49 -141 44 -142 167 l-1 87 62 76 c34 42 64 76 68 76 3 0 63 -19 132 -42z m1716 -34 l62 -76 -1 -87 c-1 -123 3 -118 -142 -167 l-125 -42 -153 49 c-84 27 -153 50 -155 52 -1 1 40 61 92 132 l94 130 123 42 c67 23 127 42 133 42 6 1 38 -33 72 -75z m-1336 -90 l108 -36 0 -44 c0 -39 -3 -46 -27 -55 -56 -21 -62 -18 -134 79 -38 50 -66 92 -62 92 5 0 56 -16 115 -36z m866 27 c-17 -49 -131 -181 -151 -175 -66 20 -67 22 -67 68 l0 44 103 35 c114 39 120 41 115 28z m-478 -38 c0 -5 15 -25 33 -47 l33 -38 54 16 c29 9 55 16 57 16 2 0 3 -24 3 -54 0 -55 20 -86 57 -86 6 0 23 -4 38 -10 l25 -10 -30 -41 c-37 -52 -37 -66 0 -117 16 -23 26 -43 22 -45 -4 -3 -25 -10 -47 -17 -59 -19 -65 -27 -65 -86 0 -30 -1 -54 -3 -54 -2 0 -28 7 -57 16 l-54 16 -22 -25 c-12 -14 -29 -36 -38 -49 l-16 -22 -16 22 c-54 78 -67 81 -160 45 -11 -4 -14 6 -14 51 0 61 -13 77 -75 92 -46 11 -46 12 -15 56 38 52 38 71 0 118 -33 42 -33 42 25 60 59 19 65 27 65 86 0 61 -1 60 65 37 l49 -16 33 39 c18 21 33 42 33 47 0 4 5 7 10 7 6 0 10 -3 10 -7z m-372 -277 c25 -36 23 -44 -13 -90 -14 -18 -235 33 -235 54 0 6 188 68 210 69 8 0 25 -15 38 -33z m864 2 c59 -18 108 -35 108 -38 0 -21 -221 -72 -235 -54 -36 46 -38 54 -13 90 28 41 13 41 140 2z m-1086 -134 l145 -46 -37 -51 c-21 -29 -64 -88 -96 -132 l-59 -81 -130 -43 c-110 -36 -133 -41 -144 -30 -6 8 -35 42 -64 77 l-51 63 1 87 c0 48 4 96 8 106 8 21 243 108 269 100 7 -2 78 -24 158 -50z m1468 10 c138 -45 136 -43 136 -169 l0 -83 -62 -76 c-34 -42 -64 -76 -68 -76 -3 0 -63 19 -133 43 l-127 42 -94 130 c-52 71 -93 131 -91 133 7 8 301 100 310 97 6 -1 63 -20 129 -41z m-1176 -105 c18 -7 22 -16 22 -53 l0 -44 -107 -36 c-106 -36 -125 -38 -106 -14 6 7 36 48 67 91 61 83 57 81 124 56z m724 -77 c37 -51 65 -92 61 -92 -5 0 -57 16 -116 36 l-108 36 3 46 c3 42 6 46 38 58 48 17 45 19 122 -84z m-508 -89 l25 -36 -22 -31 c-31 -45 -108 -150 -113 -156 -3 -2 -3 49 -2 115 l3 118 35 13 c49 17 47 18 74 -23z m244 16 c21 -8 22 -13 22 -125 0 -65 -2 -115 -4 -113 -5 5 -83 112 -113 155 l-22 31 25 37 c26 38 28 39 92 15z m-438 -198 l0 -158 -81 -112 c-44 -61 -86 -111 -92 -111 -13 0 -188 48 -192 52 -12 14 -105 162 -105 168 0 4 35 56 79 116 l78 108 139 47 c193 66 174 78 174 -110z m708 112 l144 -48 74 -102 c41 -55 76 -107 79 -115 4 -11 -73 -145 -100 -176 -5 -5 -178 -52 -192 -52 -6 0 -48 51 -92 112 l-81 113 0 157 c0 117 3 158 12 158 7 0 77 -21 156 -47z m-338 -172 l91 -124 -3 -140 -3 -141 -92 -37 -93 -38 -92 38 -93 37 -3 140 -3 141 93 126 c50 70 95 126 100 125 4 -2 48 -59 98 -127z'/></g></svg>`;
  const patternURL = `data:image/svg+xml,${encodeURIComponent(patternSVG)}`;
  const headerHTML = noHeader ? "" : `<div class="doc-header">
  <div class="brand">
    <div class="logo-box">${logoHtml}</div>
    <div>
      <div class="company-name">${companyName}</div>
      ${tagline ? `<div class="tagline">${tagline}</div>` : ""}
    </div>
  </div>
  <div class="meta">
    <div>تاريخ الإصدار: ${dateStr}</div>
    <div>الساعة: ${timeStr}</div>
  </div>
</div>
<div class="doc-title-bar">${title}</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=El+Messiri:wght@600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html { background-color: #ffffff; background-image: url("${patternURL}"); background-repeat: repeat; background-size: 140px 140px; }
  body { font-family: 'Tajawal', 'Arial', sans-serif; direction: rtl; margin: 0; padding: 0; font-size: 9pt; color: #1c1c1c; background-color: #ffffff; background-image: url("${patternURL}"); background-repeat: repeat; background-size: 140px 140px; }
  .doc-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-bottom: 8px; border-bottom: 2pt solid ${primaryColor}; margin-bottom: 4px; }
  .doc-header .brand { display: flex; align-items: center; gap: 10px; }
  .doc-header .logo-box { width: 22mm; height: 22mm; border-radius: 4mm; overflow: hidden; display: flex; align-items: center; justify-content: center; background: ${primaryColor}; color: #fff; font-size: 16pt; font-weight: 700; flex-shrink: 0; }
  .doc-header .logo-box img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
  .doc-header .company-name { font-size: 13pt; font-weight: 700; color: ${primaryColor}; }
  .doc-header .tagline { font-size: 8pt; color: #888; margin-top: 2px; }
  .doc-header .meta { text-align: left; font-size: 7pt; color: #999; line-height: 1.7; }
  .doc-title-bar { background: linear-gradient(135deg, ${primaryColor}, ${accentColor}); color: #fff; text-align: center; padding: 5pt 0; border-radius: 4pt; font-size: 14pt; font-weight: 700; margin: 8pt 0 10pt; }
  .camp-header { display: flex; align-items: center; justify-content: space-between; gap: 10pt; margin-bottom: 10pt; }
  .camp-header .camp-logo { width: 30mm; height: 30mm; border-radius: 50%; border: 3pt solid ${primaryColor}; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #fff; flex-shrink: 0; }
  .camp-header .camp-logo img { width: 100%; height: 100%; object-fit: cover; }
  .camp-header .camp-logo span { font-size: 18pt; font-weight: 800; color: ${primaryColor}; }
  .camp-header .camp-title-box { flex: 1; text-align: center; }
  .camp-header .camp-title { display: inline-block; background: ${primaryColor}; color: #fff; padding: 4pt 16pt; border-radius: 5pt; font-size: 14pt; font-weight: 700; font-family: 'El Messiri', 'Tajawal', sans-serif; }
  .camp-header .camp-subtitle { font-size: 11pt; font-weight: 600; color: #a8852f; margin-top: 5pt; font-family: 'El Messiri', 'Tajawal', sans-serif; }
  .camp-table th { background: ${primaryColor}; color: #fff; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8pt; }
  th { background: ${primaryColor}; color: #fff; padding: 5pt 7pt; text-align: right; font-size: 9pt; font-weight: 600; }
  td { border: 0.5pt solid rgba(0,0,0,0.12); padding: 5pt 7pt; text-align: right; background: transparent; font-size: 9pt; white-space: nowrap; }
  tr:nth-child(even) td { background: rgba(212,160,23,0.05); }
  .section-title { font-size: 10pt; font-weight: 700; color: ${primaryColor}; margin: 8pt 0 4pt; text-align: center; padding: 4pt; background: ${primaryColor}14; border-radius: 3pt; }
  .wide-table th, .wide-table td { font-size: 8pt; padding: 4pt 6pt; }
  .flight-table th, .flight-table td { font-size: 8pt; padding: 4pt 6pt; white-space: nowrap; }
  .ltr-table th, .ltr-table td { text-align: left; }
  .page-break { page-break-after: always; }
  .page-break-before { page-break-before: always; }
  .footer { text-align: center; color: #aaa; font-size: 7pt; margin-top: 10pt; border-top: 0.5pt solid #eee; padding-top: 5pt; }
  @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; } }
</style></head><body>
${headerHTML}
${body}
<div class="footer">${companyName}${tagline ? " — " + tagline : ""} · تقرير ${title}</div>
</body></html>`;
}

// ============================================================
// دوال موحّدة لتوليد أقسام التقارير (مستخدمة في صفحة التقارير وصفحات التنظيم)
// ============================================================
export interface ReportBranding {
  logoUrl?: string;
  companyName?: string;
  tagline?: string;
  primaryColor?: string;
  accentColor?: string;
}
type NameItem = { short_ar?: string; name_ar: string };

// شعار القسم (دائرة بصورة اللوجو أو حرف اسم الشركة)
export function sectionLogoHtml(b: ReportBranding): string {
  const companyName = b.companyName || "حملة الأقصى";
  return b.logoUrl ? `<img src="${b.logoUrl}" alt="logo" />` : `<span>${companyName.trim().charAt(0)}</span>`;
}

// عرض قائمة أسماء: عمود واحد لو 20 أو أقل، وعمودين لو أكتر
export function renderNamesTable(items: NameItem[], nameLabel = "اسم الحاج", primaryColor = "#6B1F3A"): string {
  if (items.length === 0) {
    return `<table style="width:60%;margin:0 auto"><tr><th style="text-align:center;width:40px">م</th><th>${nameLabel}</th></tr><tr><td></td><td>لا يوجد مسافرون</td></tr></table>`;
  }
  if (items.length <= 20) {
    const rows = items.map((p, i) => `<tr><td style="text-align:center;width:40px">${i + 1}</td><td>${p.short_ar || p.name_ar}</td></tr>`).join("");
    return `<table style="width:60%;margin:0 auto"><tr><th style="text-align:center;width:40px">م</th><th>${nameLabel}</th></tr>${rows}</table>`;
  }
  const half = Math.ceil(items.length / 2);
  const col1 = items.slice(0, half);
  const col2 = items.slice(half);
  const maxRows = Math.max(col1.length, col2.length);
  let rows = "";
  for (let i = 0; i < maxRows; i++) {
    const p1 = col1[i], p2 = col2[i];
    rows += `<tr>
      <td style="text-align:center;width:30px">${p1 ? i + 1 : ""}</td>
      <td>${p1 ? (p1.short_ar || p1.name_ar) : ""}</td>
      <td style="text-align:center;width:30px;border-right:2px solid ${primaryColor}">${p2 ? half + i + 1 : ""}</td>
      <td>${p2 ? (p2.short_ar || p2.name_ar) : ""}</td>
    </tr>`;
  }
  return `<table>
    <tr><th style="text-align:center;width:30px">م</th><th>${nameLabel}</th><th style="text-align:center;width:30px">م</th><th>${nameLabel}</th></tr>
    ${rows}
  </table>`;
}

// قسم بشعارين (يمين/شمال) وعنوان كبير في الوسط + جدول أسماء — مستخدم لكل باص/مخيم
export function makeTwoLogoSectionHTML(title: string, subtitle: string, namesHTML: string, b: ReportBranding): string {
  const logo = sectionLogoHtml(b);
  return `<div class="camp-header">
    <div class="camp-logo">${logo}</div>
    <div class="camp-title-box">
      <div class="camp-title">${title}</div>
      ${subtitle ? `<div class="camp-subtitle">${subtitle}</div>` : ""}
    </div>
    <div class="camp-logo">${logo}</div>
  </div>${namesHTML}`;
}

// تجميع أقسام متعددة مع فاصل صفحة قبل كل قسم إلا الأول
export function joinSections(sections: string[]): string {
  return sections.map((s, idx) => `<div class="${idx > 0 ? "page-break-before" : ""}">${s}</div>`).join("");
}

// قسم رحلة طيران واحدة (هيدر معلومات الرحلة + جدول الحجاج بالعربي)
export function makeFlightSectionHTML(flight: { name: string; type?: string; airline?: string; date?: string; time?: string; from_airport?: string; to_airport?: string }, fp: (NameItem & { nat?: string; passport?: string; phone?: string; gender?: string; flight_class?: string; services?: { flight?: string } })[], b: ReportBranding): string {
  const primaryColor = b.primaryColor || "#6B1F3A";
  const rows = fp.map((p, i) => {
    const wantsFirst = p.flight_class === "درجة أولى" || p.services?.flight === "درجة أولى";
    const cls = wantsFirst ? "درجة أولى" : "اقتصادية";
    return `<tr><td style="text-align:center">${i + 1}</td><td>${p.short_ar || p.name_ar}</td><td>${p.nat || ""}</td><td>${p.passport || ""}</td><td>${p.phone || "—"}</td><td>${p.gender || ""}</td><td>${cls}</td></tr>`;
  }).join("");
  return `<div style="background:${primaryColor}10;border:1px solid ${primaryColor};border-radius:8px;padding:14px 18px;margin-bottom:16px;direction:rtl">
    <div style="font-size:20px;font-weight:700;color:${primaryColor};margin-bottom:10px">${flight.name}${flight.type ? ` — ${flight.type}` : ""}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:13px">
      <div><span style="color:#888">الخط:</span> ${flight.airline || "—"}</div>
      <div><span style="color:#888">التاريخ:</span> ${flight.date || "—"}</div>
      <div><span style="color:#888">الوقت:</span> ${flight.time || "—"}</div>
      <div><span style="color:#888">من:</span> ${flight.from_airport || "—"}</div>
      <div><span style="color:#888">إلى:</span> ${flight.to_airport || "—"}</div>
      <div><span style="color:#888">عدد الحجاج:</span> ${fp.length}</div>
    </div>
  </div>
  <table class="flight-table"><tr><th style="text-align:center;width:30px">م</th><th>اسم الحاج / الحاجة</th><th>الجنسية</th><th>رقم الجواز</th><th>التليفون</th><th>الجنس</th><th>الدرجة</th></tr>${rows}</table>`;
}

export function printInPage(html: string) {
  const existing = document.getElementById("__print_frame__");
  if (existing) existing.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "__print_frame__";
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }, 600);
}

export function downloadPDF(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===== تثبيت صف العنوان (Freeze Header Row) =====
export function freezeHeaderRow(ws: import("xlsx").WorkSheet, rows = 1) {
  (ws as any)["!views"] = [{ state: "frozen", xSplit: 0, ySplit: rows, topLeftCell: `A${rows + 1}`, activePane: "bottomLeft" }];
}

// ===== تنسيق صف عنوان رئيسي (دمج + خلفية ملوّنة) =====
export function styleTitleRow(ws: import("xlsx").WorkSheet, rowIndex: number, colCount: number, primaryColor: string) {
  const rgb = primaryColor.replace("#", "");
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"]!.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: colCount - 1 } });
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c });
    if (!ws[addr]) ws[addr] = { t: "s", v: "" };
    (ws[addr] as any).s = { fill: { fgColor: { rgb } }, font: { color: { rgb: "FFFFFF" }, bold: true, sz: 13 }, alignment: { horizontal: "center", vertical: "center" } };
  }
}

// ===== تنسيق صف رؤوس الأعمدة (خلفية ملوّنة + خط أبيض) =====
export function styleHeaderRow(ws: import("xlsx").WorkSheet, rowIndex: number, colCount: number, primaryColor: string) {
  const rgb = primaryColor.replace("#", "");
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c });
    if (!ws[addr]) continue;
    (ws[addr] as any).s = { fill: { fgColor: { rgb } }, font: { color: { rgb: "FFFFFF" }, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
  }
}

// ===== اسم شيت صالح (حد 31 حرف وبدون رموز ممنوعة) =====
export function safeSheetName(name: string): string {
  return (name || "ورقة").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "ورقة";
}

// ===== إضافة شيت ملخص في أول الملف =====
export function addSummarySheet(
  wb: import("xlsx").WorkBook,
  XLSXLib: typeof import("xlsx"),
  reportTitle: string,
  companyName: string,
  stats: (string | number)[][],
  sheetName = "ملخص"
) {
  const now = new Date();
  const aoa: (string | number)[][] = [
    [companyName],
    [reportTitle],
    [`تاريخ الإصدار: ${now.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}`],
    [],
    ["البيان", "القيمة"],
    ...stats,
  ];
  const ws = XLSXLib.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 30 }, { wch: 16 }];
  XLSXLib.utils.book_append_sheet(wb, ws, sheetName);
  // نقل شيت الملخص لأول الملف
  wb.SheetNames.unshift(wb.SheetNames.pop() as string);
}

export const ALL_PERMISSIONS = [
  { key: "add_passenger", label: "إضافة حجاج" },
  { key: "edit_passenger", label: "تعديل حجاج" },
  { key: "delete_passenger", label: "حذف حجاج" },
  { key: "view_passengers", label: "عرض الحجاج" },
  { key: "manage_buses", label: "إدارة الباصات" },
  { key: "manage_camps", label: "إدارة المخيمات" },
  { key: "manage_hotel", label: "إدارة الفندق" },
  { key: "view_reports", label: "عرض التقارير" },
  { key: "export_reports", label: "تصدير التقارير" },
  { key: "print_reports", label: "طباعة التقارير" },
  { key: "manage_users", label: "إدارة المستخدمين" },
  { key: "view_archive", label: "عرض الأرشيف" },
  { key: "manage_flights", label: "إدارة الطيران" },
  { key: "manage_payments", label: "إدارة الحسابات المالية" },
  { key: "manage_admins", label: "إدارة الإداريين" },
];

export const ROOM_TYPES = ["ثنائية", "ثلاثية", "رباعية", "سويت"] as const;
export const ROOM_COLORS: Record<string, [string, string]> = { "ثنائية": ["var(--male-bg)", "var(--info)"], "ثلاثية": ["var(--warning-bg)", "var(--warning)"], "رباعية": ["var(--success-bg)", "var(--primary-dark)"], "سويت": ["var(--info-bg)", "var(--info)"] };

// ============================================================
// أيقونات ملوّنة موحّدة (باصات/مخيمات/غرف/رحلات) — صفحات التنظيم وصفحة التقارير
// ============================================================
export const ICON_COLOR_CYCLE = ["#7D1F3C", "#0C447C", "#2A9D8F", "#E8951A", "#8B3A6B", "#5C7C2E", "#B5651D", "#3F51B5"];
export const VIP_ICON_COLOR = "#B5651D";
export const ROOM_ICON_COLORS: Record<string, string> = { "ثنائية": "#0C447C", "ثلاثية": "#E8951A", "رباعية": "#2A9D8F", "سويت": "#7D1F3C", "فردية": "#5C7C2E", "فارغة": "#999999" };
export const FLIGHT_ICON_COLORS: Record<string, string> = { "ذهاب": "#0C447C", "إياب": "#8B3A6B" };

export const NAV = [
  { section: "الرئيسية", items: [{ id: "dash", label: "الرئيسية", perm: "" }] },
  { section: "التنظيم", items: [{ id: "passengers", label: "الحجاج", perm: "view_passengers" }, { id: "buses", label: "الباصات", perm: "manage_buses" }, { id: "flights", label: "الطيران", perm: "manage_flights" }, { id: "mina", label: "مخيمات منى", perm: "manage_camps" }, { id: "arafa", label: "مخيمات عرفة", perm: "manage_camps" }, { id: "hotel", label: "الفندق", perm: "manage_hotel" }] },
  { section: "التقارير", items: [{ id: "reports", label: "التقارير", perm: "view_reports" }] },
  { section: "الأرشيف", items: [{ id: "archive", label: "الأرشيف", perm: "view_archive" }] },
  { section: "الإعدادات", items: [{ id: "users", label: "الإعدادات", perm: "manage_users" }, { id: "finance", label: "الحسابات", perm: "manage_payments" }, { id: "admins", label: "الإداريون", perm: "manage_admins" }] },
];

export const inp = { fontSize: 12, background: "var(--bg-input)", border: "0.5px solid var(--border)", borderRadius: "var(--radius-md)", padding: "7px 10px", width: "100%", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" as const, color: "var(--text)" };
export const btnP = (extra?: any) => ({ background: "var(--primary)", color: "var(--text-inverse)", border: "none", padding: "7px 14px", borderRadius: "var(--radius-md)", fontSize: 12, cursor: "pointer", fontWeight: 500, fontFamily: "var(--font-body)", transition: "var(--transition)", ...extra });
export const btnS = (extra?: any) => ({ background: "transparent", border: "0.5px solid var(--border)", padding: "7px 12px", borderRadius: "var(--radius-md)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)", fontFamily: "var(--font-body)", transition: "var(--transition)", ...extra });
