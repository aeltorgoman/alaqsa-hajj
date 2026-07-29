/* ══════════════════════════════════════════════════════════════
   ملف تعريف التطبيق لبوابة الحاج — يُبنى وقت التشغيل
   لا توجد أيقونات ثابتة في المشروع: الأيقونة تُشتق من شعار
   الحملة المحفوظ في إعدادات النظام، فتتبعه تلقائياً عند تغييره.
   ══════════════════════════════════════════════════════════════ */

const PORTAL_PATH = "/hajj";
const BADGE_PATH = "/badge-72.png";

let currentObjectUrl: string | null = null;

/* ─── رسم الشعار داخل مربّع بخلفية لون الحملة ─── */
async function renderIcon(
  logoUrl: string,
  size: number,
  background: string,
  maskable: boolean
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);

        ctx.fillStyle = background;
        ctx.fillRect(0, 0, size, size);

        /* الأيقونة القابلة للقص تحتاج هامشاً أوسع حتى لا يقتطع النظام الشعار */
        const margin = maskable ? size * 0.22 : size * 0.14;
        const box = size - margin * 2;
        const scale = Math.min(box / img.width, box / img.height);
        const w = img.width * scale;
        const h = img.height * scale;

        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        /* الصورة من نطاق لا يسمح بالقراءة، فيتلوّث اللوح */
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = logoUrl;
  });
}

/* ─── بناء ملف التعريف وربطه بالصفحة ─── */
export async function setupPortalManifest(opts: {
  name: string;
  logoUrl: string | null;
  themeColor: string;
}): Promise<void> {
  if (typeof document === "undefined") return;

  const name = opts.name || "حملة الأقصى";
  const theme = opts.themeColor || "#7D1F3C";

  type Icon = { src: string; sizes: string; type: string; purpose?: string };
  const icons: Icon[] = [];
  let appleIcon: string | null = null;

  if (opts.logoUrl) {
    const [i192, i512, maskable] = await Promise.all([
      renderIcon(opts.logoUrl, 192, theme, false),
      renderIcon(opts.logoUrl, 512, theme, false),
      renderIcon(opts.logoUrl, 512, theme, true),
    ]);

    if (i192) icons.push({ src: i192, sizes: "192x192", type: "image/png" });
    if (i512) icons.push({ src: i512, sizes: "512x512", type: "image/png" });
    if (maskable)
      icons.push({ src: maskable, sizes: "512x512", type: "image/png", purpose: "maskable" });

    appleIcon = i192;

    /* تعذّرت المعالجة، فنستخدم الشعار كما هو */
    if (icons.length === 0) {
      icons.push({ src: opts.logoUrl, sizes: "any", type: "image/png" });
      appleIcon = opts.logoUrl;
    }
  }

  if (icons.length === 0) {
    icons.push({ src: BADGE_PATH, sizes: "72x72", type: "image/png" });
    appleIcon = BADGE_PATH;
  }

  const manifest = {
    name: name,
    short_name: name.length > 12 ? name.slice(0, 12) : name,
    description: "بوابة الحاج — متابعة بيانات رحلتك وتنبيهات الحملة",
    lang: "ar",
    dir: "rtl",
    start_url: PORTAL_PATH,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f2e7",
    theme_color: theme,
    icons: icons,
  };

  const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(blob);

  setLink("manifest", "manifest", currentObjectUrl);
  if (appleIcon) setLink("apple-touch-icon", "apple-touch-icon", appleIcon);

  setMeta("theme-color", theme);
  setMeta("apple-mobile-web-app-capable", "yes");
  setMeta("apple-mobile-web-app-status-bar-style", "black-translucent");
  setMeta("apple-mobile-web-app-title", manifest.short_name);
}

/* ─── إزالة ملف التعريف عند مغادرة البوابة ─── */
export function teardownPortalManifest(): void {
  if (typeof document === "undefined") return;
  document.querySelector('link[data-portal="manifest"]')?.remove();
  document.querySelector('link[data-portal="apple-touch-icon"]')?.remove();
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

/* ─── أدوات ─── */
function setLink(key: string, rel: string, href: string): void {
  let el = document.querySelector<HTMLLinkElement>(`link[data-portal="${key}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    el.setAttribute("data-portal", key);
    document.head.appendChild(el);
  }
  el.href = href;
}

function setMeta(name: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}
