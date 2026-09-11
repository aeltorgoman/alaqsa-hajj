// ============================================================
// كتلُ بناءِ المطبوعات — الأسماءُ والأقسامُ وقسمُ الرحلة
// ============================================================
/* منقولةٌ بحرفها من `utils/index.ts`: معايرةُ حجم الخطّ بعدد الصفوف
   مُختبَرةٌ بمحاكاة A4 فعليّة، ولا تُعاد. */
import type { PrintBranding } from "./print.brand";
import { escapeCompanyHtml, normalizeCompanyAssetUrl, normalizeCompanyColor } from "./print.brand";

// ============================================================

/* اشتقاق هوية الطباعة من إعدادات الحملة — كان مكرراً حرفياً في
   BusesPage وCampsPage وFlightsPage وخمس مرات داخل ReportsPage */
export type NameItem = { short_ar?: string; name_ar: string };

// شعار القسم (دائرة بصورة اللوجو أو حرف اسم الشركة)
export function sectionLogoHtml(b: PrintBranding): string {
  const companyName = escapeCompanyHtml(b.companyName);
  const logoUrl = normalizeCompanyAssetUrl(b.logoUrl);
  return logoUrl ? `<img src="${logoUrl}" alt="logo" />` : `<span>${companyName.trim().charAt(0)}</span>`;
}

// عرض قائمة أسماء: عمود واحد لو 20 أو أقل، وعمودين لو أكتر
export function renderNamesTable(items: NameItem[], nameLabel = "اسم الحاج", primaryColor = "#6B1F3A"): string {
  primaryColor = normalizeCompanyColor(primaryColor, "#1D9E75");
  if (items.length === 0) {
    return `<table style="width:100%;margin:0 auto"><tr><th style="text-align:center;width:36px;font-size:12pt;padding:7pt">م</th><th style="font-size:12pt;padding:7pt">${nameLabel}</th></tr><tr><td style="font-size:12pt;padding:7pt"></td><td style="font-size:12pt;padding:7pt">لا يوجد مسافرون</td></tr></table>`;
  }

  // جدول معايرة حقيقي (عدد صفوف -> أقصى حجم خط آمن) تم اختباره بمحاكاة طباعة A4 فعلية
  // مطابقة 100% لبنية الجدول الفعلية، بقيم محافظة (أقل قيمة آمنة في كل نطاق) لضمان عدم الفيضان مطلقاً
  const FONT_CALIBRATION: [number, number][] = [[6, 17], [11, 17], [14, 14.5], [18, 11.5], [22, 11.5], [24, 10.5], [31, 10]];
  const calcSizes = (rowCount: number) => {
    let fontSize = FONT_CALIBRATION[FONT_CALIBRATION.length - 1][1];
    if (rowCount <= FONT_CALIBRATION[0][0]) {
      fontSize = FONT_CALIBRATION[0][1];
    } else if (rowCount >= FONT_CALIBRATION[FONT_CALIBRATION.length - 1][0]) {
      fontSize = FONT_CALIBRATION[FONT_CALIBRATION.length - 1][1];
    } else {
      for (let i = 0; i < FONT_CALIBRATION.length - 1; i++) {
        const [r1, f1] = FONT_CALIBRATION[i];
        const [r2, f2] = FONT_CALIBRATION[i + 1];
        if (rowCount >= r1 && rowCount <= r2) {
          const ratio = (rowCount - r1) / (r2 - r1);
          fontSize = Math.round((f1 + (f2 - f1) * ratio) * 2) / 2;
          break;
        }
      }
    }
    const padding = Math.round(fontSize * 0.55 * 10) / 10;
    return { fontSize, padding };
  };

  if (items.length <= 20) {
    const { fontSize, padding } = calcSizes(items.length + 1); // +1 لصف الهيدر
    const numSize = Math.max(10, fontSize - 1);
    const rows = items.map((p, i) => `<tr><td style="text-align:center;width:38px;font-size:${numSize}pt;padding:${padding}pt 6pt">${i + 1}</td><td style="font-size:${fontSize}pt;padding:${padding}pt 6pt;font-weight:600">${p.short_ar || p.name_ar}</td></tr>`).join("");
    return `<table style="width:100%;margin:0 auto"><tr><th style="text-align:center;width:38px;font-size:${numSize}pt;padding:${padding}pt 6pt">م</th><th style="font-size:${numSize}pt;padding:${padding}pt 6pt">${nameLabel}</th></tr>${rows}</table>`;
  }

  const half = Math.ceil(items.length / 2);
  const col1 = items.slice(0, half);
  const col2 = items.slice(half);
  const maxRows = Math.max(col1.length, col2.length);
  const { fontSize, padding } = calcSizes(maxRows + 1); // +1 لصف الهيدر
  const numSize = Math.max(10, fontSize - 1);

  let rows = "";
  for (let i = 0; i < maxRows; i++) {
    const p1 = col1[i], p2 = col2[i];
    rows += `<tr>
      <td style="text-align:center;width:32px;font-size:${numSize}pt;padding:${padding}pt 4pt">${p1 ? i + 1 : ""}</td>
      <td style="font-size:${fontSize}pt;padding:${padding}pt 5pt;font-weight:600">${p1 ? (p1.short_ar || p1.name_ar) : ""}</td>
      <td style="text-align:center;width:32px;font-size:${numSize}pt;padding:${padding}pt 4pt;border-right:2px solid ${primaryColor}">${p2 ? half + i + 1 : ""}</td>
      <td style="font-size:${fontSize}pt;padding:${padding}pt 5pt;font-weight:600">${p2 ? (p2.short_ar || p2.name_ar) : ""}</td>
    </tr>`;
  }
  return `<table style="width:100%">
    <tr><th style="text-align:center;width:32px;font-size:${numSize}pt;padding:${padding}pt 4pt">م</th><th style="font-size:${numSize}pt;padding:${padding}pt 4pt">${nameLabel}</th><th style="text-align:center;width:32px;font-size:${numSize}pt;padding:${padding}pt 4pt">م</th><th style="font-size:${numSize}pt;padding:${padding}pt 4pt">${nameLabel}</th></tr>
    ${rows}
  </table>`;
}

// قسم بشعارين (يمين/شمال) وعنوان كبير في الوسط + جدول أسماء — مستخدم لكل باص/مخيم
export function makeTwoLogoSectionHTML(title: string, subtitle: string, namesHTML: string, b: PrintBranding): string {
  const logo = sectionLogoHtml(b);
  const safeTitle = escapeCompanyHtml(title);
  const safeSubtitle = escapeCompanyHtml(subtitle);
  return `<div class="camp-header">
    <div class="camp-logo">${logo}</div>
    <div class="camp-title-box">
      <div class="camp-title">${safeTitle}</div>
      ${safeSubtitle ? `<div class="camp-subtitle">${safeSubtitle}</div>` : ""}
    </div>
    <div class="camp-logo">${logo}</div>
  </div>${namesHTML}`;
}

// تجميع أقسام متعددة مع فاصل صفحة قبل كل قسم إلا الأول
export function joinSections(sections: string[]): string {
  return sections.map((s, idx) => `<div class="${idx > 0 ? "page-break-before" : ""}">${s}</div>`).join("");
}

// قسم رحلة طيران واحدة (هيدر معلومات الرحلة + جدول الحجاج بالعربي)
export function makeFlightSectionHTML(flight: { name: string; type?: string; airline?: string; date?: string; time?: string; from_airport?: string; to_airport?: string }, fp: (NameItem & { nat?: string; passport?: string; phone?: string; gender?: string; flight_class?: string; services?: { flight?: string } })[], b: PrintBranding): string {
  const primaryColor = normalizeCompanyColor(b.primaryColor, "#1D9E75");
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
