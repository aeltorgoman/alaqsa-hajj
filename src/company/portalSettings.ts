/* ═══ إعداداتُ بوابة الحاج — الثمانية ═══
   المرجعُ هو القاعدة (`_portal_settings_effective`): هي التي تحفظ
   (`update_portal_settings` يُسقط ما سوى هذه المفاتيح ويرفض النوعَ الخاطئ)
   وهي التي تحجب الحسّاس (المستندات، والصورة، وأسماء رفقاء الغرفة).
   وهذه نسختُها في الواجهة للعرض وحده، بالافتراضات نفسِها:
   المنطقيّةُ ظاهرةٌ ما لم تكن `false`، والصورةُ مخفيّةٌ ما لم تُختَر. */

export type PhotoVisibility = "all" | "men" | "women" | "none";

export type PortalSettings = {
  flights: boolean;
  rooms: boolean;
  buses: boolean;
  documents: boolean;
  roommates: boolean;
  lost_card: boolean;
  arafat_countdown: boolean;
  photo_visibility: PhotoVisibility;
};

export type PortalFlagKey = Exclude<keyof PortalSettings, "photo_visibility">;

export const PORTAL_FLAG_KEYS: readonly PortalFlagKey[] = [
  "flights", "rooms", "buses", "documents", "roommates", "lost_card", "arafat_countdown",
];

export const PHOTO_VISIBILITY_VALUES: readonly PhotoVisibility[] = ["all", "men", "women", "none"];

export function effectivePortalSettings(raw: unknown): PortalSettings {
  const s = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const flag = (k: PortalFlagKey) => s[k] !== false;
  const photo = PHOTO_VISIBILITY_VALUES.includes(s.photo_visibility as PhotoVisibility)
    ? (s.photo_visibility as PhotoVisibility) : "none";
  return {
    flights: flag("flights"), rooms: flag("rooms"), buses: flag("buses"), documents: flag("documents"),
    roommates: flag("roommates"), lost_card: flag("lost_card"), arafat_countdown: flag("arafat_countdown"),
    photo_visibility: photo,
  };
}
