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

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve((e.target?.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function scanDocument(file: File, mode: "passport" | "idcard" | "hajj_permit"): Promise<any> {
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
  accentColor = "#0C447C"
) {
  const initial = (companyName || "ح").trim().charAt(0);
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="logo" />`
    : `<span>${initial}</span>`;
  const now = new Date();
  const dateStr = now.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title}</title>
<style>
  @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Tajawal', 'Arial', sans-serif; direction: rtl; margin: 0; padding: 0; font-size: 10px; color: #1c1c1c; }
  .doc-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-bottom: 10px; border-bottom: 3px solid ${primaryColor}; margin-bottom: 4px; }
  .doc-header .brand { display: flex; align-items: center; gap: 10px; }
  .doc-header .logo-box { width: 52px; height: 52px; border-radius: 12px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: ${primaryColor}; color: #fff; font-size: 22px; font-weight: 700; flex-shrink: 0; }
  .doc-header .logo-box img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
  .doc-header .company-name { font-size: 14px; font-weight: 700; color: ${primaryColor}; }
  .doc-header .tagline { font-size: 9px; color: #888; margin-top: 2px; }
  .doc-header .meta { text-align: left; font-size: 9px; color: #999; line-height: 1.6; }
  .doc-title-bar { background: linear-gradient(135deg, ${primaryColor}, ${accentColor}); color: #fff; text-align: center; padding: 9px 0; border-radius: 8px; font-size: 16px; font-weight: 700; margin: 12px 0 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: ${primaryColor}; color: #fff; padding: 7px 10px; text-align: right; font-size: 10px; font-weight: 600; }
  td { border: 0.5px solid #e4e4e4; padding: 6px 10px; text-align: right; }
  tr:nth-child(even) td { background: #f7f7fa; }
  .section-title { font-size: 13px; font-weight: 700; color: ${primaryColor}; margin: 14px 0 6px; text-align: center; padding: 6px; background: ${primaryColor}14; border-radius: 6px; }
  .page-break { page-break-after: always; }
  .footer { text-align: center; color: #aaa; font-size: 8px; margin-top: 18px; border-top: 0.5px solid #eee; padding-top: 6px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="doc-header">
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
<div class="doc-title-bar">${title}</div>
${body}
<div class="footer">${companyName}${tagline ? " — " + tagline : ""} · تقرير ${title}</div>
</body></html>`;
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
];

export const ROOM_TYPES = ["ثنائية", "ثلاثية", "رباعية", "سويت"] as const;
export const ROOM_COLORS: Record<string, [string, string]> = { "ثنائية": ["var(--male-bg)", "var(--info)"], "ثلاثية": ["var(--warning-bg)", "var(--warning)"], "رباعية": ["var(--success-bg)", "var(--primary-dark)"], "سويت": ["var(--info-bg)", "var(--info)"] };

export const NAV = [
  { section: "الرئيسية", items: [{ id: "dash", label: "الرئيسية", perm: "" }] },
  { section: "التنظيم", items: [{ id: "passengers", label: "الحجاج", perm: "view_passengers" }, { id: "buses", label: "الباصات", perm: "manage_buses" }, { id: "flights", label: "الطيران", perm: "manage_flights" }, { id: "mina", label: "مخيمات منى", perm: "manage_camps" }, { id: "arafa", label: "مخيمات عرفة", perm: "manage_camps" }, { id: "hotel", label: "الفندق", perm: "manage_hotel" }] },
  { section: "التقارير", items: [{ id: "reports", label: "التقارير", perm: "view_reports" }] },
  { section: "الأرشيف", items: [{ id: "archive", label: "الأرشيف", perm: "view_archive" }] },
  { section: "الإعدادات", items: [{ id: "users", label: "المستخدمين", perm: "manage_users" }] },
];

export const inp = { fontSize: 12, background: "var(--bg-input)", border: "0.5px solid var(--border)", borderRadius: "var(--radius-md)", padding: "7px 10px", width: "100%", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" as const, color: "var(--text)" };
export const btnP = (extra?: any) => ({ background: "var(--primary)", color: "var(--text-inverse)", border: "none", padding: "7px 14px", borderRadius: "var(--radius-md)", fontSize: 12, cursor: "pointer", fontWeight: 500, fontFamily: "var(--font-body)", transition: "var(--transition)", ...extra });
export const btnS = (extra?: any) => ({ background: "transparent", border: "0.5px solid var(--border)", padding: "7px 12px", borderRadius: "var(--radius-md)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)", fontFamily: "var(--font-body)", transition: "var(--transition)", ...extra });
