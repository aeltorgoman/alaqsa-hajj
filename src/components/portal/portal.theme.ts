/* ═══ نظامُ ألوان البوابة وسُلّمُ نصّها ═══
   نُقل كما هو في المرحلة الثانية، وأُضيفت `buildTheme` وحدَها: هي
   تجمع الاشتقاقاتِ التي كانت داخل المكوّن (اللونان المقروءان
   والمشتقّات) في موضعٍ واحد يستهلكه كلُّ مكوّنٍ فرعيّ بخاصيّةٍ
   واحدة — فلا تُمرَّر ثمانيةُ ألوانٍ إلى كلّ بطاقة. والحسابُ هو هو
   بحرفه، ورتبتُه محفوظة. */
import type { PortalConfig } from "./portal.types";

const STAR_PATTERN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='84' height='84' viewBox='0 0 84 84'%3E%3Cg fill='none' stroke='%23F0C84A' stroke-width='1'%3E%3Cpath d='M42 10l8 16 17 3.5-11.5 13.5 2.5 18-16-8-16 8 2.5-18L17 29.5 34 26z'/%3E%3C/g%3E%3C/svg%3E")`;

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/* ═══ سُلّمُ النصّ — أربعُ درجاتٍ لا لونٌ لكلّ موضع ═══
   الأولى أساسٌ، والثانية أهدأُ وتُقرأ، والثالثة حاشيةٌ تبقى مقروءة،
   والرابعة معطَّلةٌ تُرى معطَّلةً ولا تُقرأ بعناء. والقياسُ لا الذوق:
   كلُّ درجةٍ تتجاوز ٤٫٥:١ على الورقيّ والأبيض (والقيمُ الكبيرةُ ٣:١). */
const INK = "#241318";          // أساسيّ — عناوينُ وقيم · ١٧٫٨:١ على الأبيض
const BODY = "#3E2B34";         // ثانويّ — نصُّ الفقرات · ١٣٫٢:١
const LABEL = "#6B5560";        // ثالثيّ — تسمياتٌ وحواشٍ · ٦٫٨:١
const MUTED = "#8A7480";        // معطَّل/خامل — يُرى خاملاً ويبقى مقروءاً · ٤٫٠:١ (كبيرٌ فقط)
const LINE = "#E8D5C4";
const IVORY = "#F8F2E4";

/* ═══ لونُ الهويّة لا يضمن القراءة — فيُضمَن اشتقاقاً ═══
   لونُ التمييز `color_accent` **إعدادُ شركةٍ حُرّ**، وافتراضُه في
   الشيفرة `#085041` أخضرُ غامق. وهو يلوّن نصّاً فوق ترويسةٍ مارونيّة
   غامقة: «حياك الله يا حاج» وسطرَ العدّاد ووحداتِه واسمَ الموسم.
   فإن كان الإعدادُ غامقاً صار النصُّ غامقاً على غامق — وقد قِيس:
   **١٫٠٥:١** عند المارون مع الافتراض، أي نصٌّ لا يُرى أصلاً.

   ولا يُعالَج هذا بلونٍ ثابتٍ نختاره (فيضيع لونُ الحملة)، ولا
   بتغميقِ كلّ شيء. بل تُرفَع إضاءةُ لون الهويّة نفسِه — بصبغته
   وتشبّعه كما هما — حتى يبلغ عتبةَ القراءة على تلك الخلفيّة
   بالذات. فالهويّةُ محفوظةٌ والقراءةُ مضمونة، مهما أُعِدّ اللون. */
const srgb = (h: string): [number, number, number] => {
  const v = h.replace("#", "");
  const f = v.length === 3 ? [...v].map(c => c + c).join("") : v;
  return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16)) as [number, number, number];
};
const relLum = (rgb: [number, number, number]) => {
  const c = rgb.map(x => { const n = x / 255; return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => {
  const la = relLum(srgb(a)), lb = relLum(srgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/** يمزج اللون نحو الأبيض أو الأسود بنسبة t — الصبغةُ تبقى، الإضاءةُ تتغيّر. */
const mix = (h: string, towards: string, t: number) => {
  const a = srgb(h), b = srgb(towards);
  return "#" + a.map((c, i) => Math.round(c + (b[i] - c) * t).toString(16).padStart(2, "0")).join("");
};
/** أقربُ نسخةٍ من اللون تبلغ العتبة على هذه الخلفيّة — أو أقصى ما أمكن. */
function readableOn(color: string, bg: string, target = 4.5): string {
  /* لونٌ غيرُ سداسيّ يُترَك كما هو: الإعدادُ ليس تحت سيطرتنا، ولا
     نحسب على نصٍّ لا نفهمه. */
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return color;
  if (contrast(color, bg) >= target) return color;
  /* يُجرَّب الاتّجاهان معاً ويُؤخَذ الأقرب بلوغاً: خلفيّةٌ متوسّطة
     الإضاءة قد يخدمها التغميقُ خيراً من التفتيح، والعكس. واختيارُ
     الاتّجاه بإضاءة الخلفيّة وحدها يخطئ في المنتصف. */
  let best = color, bestRatio = contrast(color, bg);
  for (const towards of ["#ffffff", "#000000"] as const) {
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const c = mix(color, towards, t);
      const r = contrast(c, bg);
      if (r > bestRatio) { best = c; bestRatio = r; }
      if (r >= target) return c;
    }
  }
  return best;
}

export { INK, BODY, LABEL, MUTED, LINE, IVORY, STAR_PATTERN, MONTHS_AR, mix, readableOn, contrast };

/** خطوطُ البوابة — كانت ثلاثةَ ثوابتَ محلّيّةً داخل المكوّن. */
export const FONT = "'IBM Plex Sans Arabic','Cairo',sans-serif";
export const FONT_D = "'Cairo',sans-serif";
export const FONT_T = "'El Messiri','Cairo',sans-serif";

export type PortalTheme = {
  brand: string; brandDeep: string;
  gold: string; goldBright: string; goldDark: string; goldTint: string;
  font: string; fontD: string; fontT: string;
};

/* ⚠️ نفسُ اشتقاقات `PilgrimPortal` سطراً بسطر، **ورتبتُها محفوظة**:
   `goldTint` يعتمد على `gold`، و`goldDark` يعتمد على `goldTint`.
   فتبديلُ السطرين يغيّر لوناً على الشاشة. */
export function buildTheme(cfg: PortalConfig | null | undefined): PortalTheme {
  const brand = cfg?.color_primary || "#1D9E75";
  const gold = cfg?.color_accent || "#085041";
  const darken = (hex: string, factor: number) => {
    const value = hex.replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
    return `#${[0, 2, 4].map(i => Math.round(parseInt(value.slice(i, i + 2), 16) * factor).toString(16).padStart(2, "0")).join("")}`;
  };
  const brandDeep = darken(brand, 0.55);
  const goldBright = readableOn(gold, brand, 4.5);
  const goldTint = mix(gold, IVORY, 1 - 0x1f / 255);
  const goldDark = readableOn(darken(gold, 0.7), goldTint, 4.5);
  return { brand, brandDeep, gold, goldBright, goldDark, goldTint, font: FONT, fontD: FONT_D, fontT: FONT_T };
}
