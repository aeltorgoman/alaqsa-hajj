/* ═══ رسمُ الأيقونة ═══
   مكوّنٌ واحدٌ لا غير؛ ومساراتُها في `portal.icons.ts`. */
import { ICONS } from "./portal.icons";
export { ICONS };

export function Icon({ d, size = 18, color = "currentColor", sw = 2 }: { d: string; size?: number; color?: string; sw?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: d }} />;
}
