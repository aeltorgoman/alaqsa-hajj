// ════════════════════════════════════════════════════════════
// عائلة التوزيع البصريّة — الباص ومخيّما منى وعرفة
// ════════════════════════════════════════════════════════════
// `BusesPage` و`CampsPage` كانتا ملفّاً واحداً نُسخ ثم افترق: نفس
// حالة السحب، نفس المودال ٩٦٠×٩٠vh، نفس صفّ المسافر، نفس المنتقي،
// نفس ثلاثيّة التحميل/الخطأ/الفراغ — بفروقٍ عرضيّة لا معنى لها
// (مربّع الاختيار يميناً هنا ويساراً هناك، والبحث يشمل `short_ar`
// في الباص ولا يشمله في المخيّم).
//
// ما في هذا الملف **عرضٌ وآليّة فقط**. لا يعرف باصاً من مخيّم، ولا
// جنساً ولا VIP ولا سعةً مسموحة: يأخذ أرقاماً ونصوصاً ويرسم. كل
// قاعدة عملٍ تبقى مكتوبةً في صفحتها، ظاهرةً لمن يراجع.
//
// ولهذا لا يوجد في هذا الملف `if (type === "bus")` ولا ما يشبهه:
// ما يختلف بين الصفحات يدخل **فتحةً** (slot) يملؤها المنادي.
import React, { useEffect, useRef } from "react";

/* المقاييس الموحَّدة — الرقم في موضعٍ واحد بدل أن يتفرّق ٢٢٠ هنا
   و٢٦٠ هناك */
export const ALLOC_GRID = "repeat(auto-fill, minmax(240px, 1fr))";
export const ALLOC_GAP = 12;

// ═══════════════════════════════════════════════════════════
// شريط السعة — يقول الحقيقة، والتجاوز يُرى لا يُقصّ
// ═══════════════════════════════════════════════════════════
// كان شريط المخيّم مثبَّتاً على `width: "100%"` لأنه بلا سعة، فيقول
// «ممتلئ» عن مخيّمٍ فيه نازلٌ واحد. وشريط الباص يقصّ التجاوز بـ
// `Math.min(100, …)` فيبدو ٦٠/٥٠ كأنه ٥٠/٥٠.
// `onDark` لأن الشريط يظهر في موضعين: على ورق الكارت، وعلى ترويسة
// المودال الملوّنة بـ`--primary` نفسه — وهناك يكون تعبئةً بلون
// أرضيّته، أي غير مرئيّ. فيقلب على `--text-inverse`.
export function CapacityBar({ occ, cap, height = 8, onDark }: { occ: number; cap: number | null; height?: number; onDark?: boolean }) {
  const over = cap != null && occ > cap;
  const pct = cap && cap > 0 ? Math.min(100, Math.round((occ / cap) * 100)) : 0;
  return (
    <div style={{
      height, borderRadius: 99, overflow: "hidden",
      background: onDark ? "color-mix(in srgb, var(--ink) 30%, transparent)" : "color-mix(in srgb, var(--ink) 12%, transparent)",
    }}>
      <div style={{
        height: "100%", borderRadius: 99, width: `${cap == null ? 0 : pct}%`,
        background: over ? "var(--danger)" : onDark ? "var(--text-inverse)" : "var(--primary)",
        transition: "width .3s",
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// كارت الحاوية
// ═══════════════════════════════════════════════════════════
export function AllocationCard({
  title, badge, icon, occ, cap, capacityNote, noteNeedsAction, emptyHint, subtitle, selected, onClick, reorder,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;      // VIP · خاص · ما يميّز الحاوية
  icon: React.ReactNode;        // أيقونة النطاق — الفرق الأول الذي تراه العين
  occ: number;
  cap: number | null;           // null = السعة غير محدّدة
  capacityNote: React.ReactNode; // «٨ مقاعد متبقية» — النصّ من نطاقه
  /* حالٌ تحتاج فعلَ الموظّف لا مجرّد خبر — «السعة غير محدّدة»
     مثلاً. تُقرأ تحذيراً لا هامشاً رمادياً. */
  noteNeedsAction?: boolean;
  emptyHint: React.ReactNode;   // «＋ إضافة مسافر»
  subtitle?: React.ReactNode;   // رجال/نساء مثلاً
  selected: boolean;
  onClick: () => void;
  /* سحبُ البطاقة نفسها لترتيب الحاويات — اختياريّ، ولا علاقة له
     بسحب المسافرين داخل المودال. غيابه يعني بطاقةً غير مرتَّبة. */
  reorder?: {
    onDragStart: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    dragging: boolean;
    dragOver: boolean;
  };
}) {
  const over = cap != null && occ > cap;
  return (
    <div onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      draggable={!!reorder} onDragStart={reorder?.onDragStart} onDragOver={reorder?.onDragOver} onDragEnd={reorder?.onDragEnd}
      style={{
        background: "var(--paper)", borderRadius: 12, cursor: "pointer", overflow: "hidden",
        border: reorder?.dragOver ? "2.5px dashed var(--primary)"
          : selected ? "2.5px solid var(--primary)" : "1px solid var(--line)",
        boxShadow: selected ? "0 4px 16px color-mix(in srgb, var(--primary) 28%, transparent)" : "0 1px 4px rgba(0,0,0,.06)",
        opacity: reorder?.dragging ? .45 : 1,
        transform: selected ? "translateY(-2px)" : "none", transition: "all .18s",
      }}
      onMouseEnter={e => { if (!selected) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 18px color-mix(in srgb, var(--primary) 20%, transparent)"; } }}
      onMouseLeave={e => { if (!selected) { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,.06)"; } }}>

      {/* لافتةٌ على لون السمة لا على لونٍ مثبَّت للصفحة */}
      <div style={{ background: "linear-gradient(150deg, var(--primary), var(--primary-dark, var(--primary)))", color: "var(--text-inverse)", padding: "10px 12px 8px", position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", insetInlineStart: -8, bottom: -12, opacity: .12, pointerEvents: "none", transform: "scale(3.2)", transformOrigin: "bottom left" }}>{icon}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, position: "relative", zIndex: 1 }}>
          {/* المقبض — لغةُ السحب نفسها المستعملة في صفوف المسافرين،
              فيُقرأ «هذه تُسحب» بلا سطرِ تعليماتٍ يسكن الصفحة */}
          {reorder && (
            <span aria-hidden title="اسحب لإعادة الترتيب" style={{ cursor: "grab", opacity: .55, flexShrink: 0, display: "flex" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1" fill="currentColor" /><circle cx="15" cy="5" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="19" r="1" fill="currentColor" /><circle cx="15" cy="19" r="1" fill="currentColor" /></svg>
            </span>
          )}
          <div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.15, fontFamily: "var(--font-heading)", minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          {badge}
        </div>
        {subtitle && <div style={{ fontSize: 10.5, fontWeight: 700, opacity: .85, marginTop: 3, position: "relative", zIndex: 1 }}>{subtitle}</div>}
      </div>

      <div style={{ padding: "10px 12px" }}>
        {occ === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 0 10px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)", padding: "4px 12px", borderRadius: 8, border: "1px dashed color-mix(in srgb, var(--primary) 45%, transparent)", background: "color-mix(in srgb, var(--primary) 6%, transparent)" }}>
              {emptyHint}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }} dir="ltr">
            <span style={{ fontSize: 30, fontWeight: 900, color: over ? "var(--danger)" : "var(--primary)", lineHeight: 1, fontFamily: "var(--font-heading)" }}>{occ}</span>
            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>/ {cap ?? "—"}</span>
          </div>
        )}
        <CapacityBar occ={occ} cap={cap} />
        <div style={{ fontSize: 10, fontWeight: 800, marginTop: 5, color: over ? "var(--danger)" : noteNeedsAction ? "var(--warning)" : "var(--muted)" }}>{capacityNote}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ثلاثيّة التحميل / الخطأ / الفراغ
// ═══════════════════════════════════════════════════════════
export function AllocationStates({ loading, error, empty, icon, errorText, emptyText }: {
  loading: boolean; error: boolean; empty: boolean;
  icon: React.ReactNode; errorText: string; emptyText: string;
}) {
  if (loading) return <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)", fontSize: 12 }}>جاري التحميل...</div>;
  if (error) return <div role="alert" style={{ textAlign: "center", padding: "2.5rem", color: "var(--danger)", fontWeight: 700, fontSize: 13 }}>{errorText}</div>;
  if (empty) return (
    <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)", fontSize: 12 }}>
      <div aria-hidden style={{ display: "flex", justifyContent: "center", opacity: .5, marginBottom: 8, transform: "scale(2)" }}>{icon}</div>
      {emptyText}
    </div>
  );
  return null;
}

// ═══════════════════════════════════════════════════════════
// شريط البحث — هندسةٌ واحدة للصفحة وللمنتقي
// ═══════════════════════════════════════════════════════════
export function AllocationSearch({ value, onChange, placeholder, compact, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder: string; compact?: boolean; autoFocus?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: compact ? 9 : 10, padding: compact ? "6px 10px" : "7px 14px" }}>
      <svg aria-hidden width={compact ? 12 : 14} height={compact ? 12 : 14} viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus}
        style={{ border: "none", background: "transparent", fontSize: compact ? 12 : 13, flex: 1, outline: "none", color: "var(--ink)", fontFamily: "var(--font-body)" }} />
      {value && <button onClick={() => onChange("")} aria-label="مسح البحث" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 15, lineHeight: 1 }}>✕</button>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// صفّ المسافر المُسنَد
// ═══════════════════════════════════════════════════════════
export type RowDrag = {
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  dragging: boolean;
  dragOver: boolean;
};

export function AssignedRow({ index, name, badges, notice, actions, drag }: {
  index: number;
  name: string;
  badges?: React.ReactNode;
  notice?: React.ReactNode;   // «ليس VIP» وأمثالها — من نطاقها
  actions: React.ReactNode;   // نقل · إزالة
  drag?: RowDrag;
}) {
  return (
    <div draggable={!!drag} onDragStart={drag?.onDragStart} onDragOver={drag?.onDragOver} onDragEnd={drag?.onDragEnd}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
        borderBottom: "1px solid var(--line)", cursor: drag ? "grab" : "default",
        opacity: drag?.dragging ? .5 : 1,
        background: drag?.dragging ? "color-mix(in srgb, var(--primary) 8%, transparent)"
          : drag?.dragOver ? "color-mix(in srgb, var(--primary) 4%, transparent)" : "transparent",
      }}>
      {drag && (
        <span aria-hidden style={{ color: "var(--muted)", flexShrink: 0 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1" fill="currentColor" /><circle cx="15" cy="5" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="19" r="1" fill="currentColor" /><circle cx="15" cy="19" r="1" fill="currentColor" /></svg>
        </span>
      )}
      <span style={{ fontSize: 10, color: "var(--muted)", width: 16, textAlign: "center", flexShrink: 0 }} dir="ltr">{index}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
          {name}{badges}
        </div>
      </div>
      {notice}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>{actions}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// منتقي غير الموزَّعين
// ═══════════════════════════════════════════════════════════
// الأهليّة **ليست** هنا: المنادي يمرّر قائمةً رشّحها بقواعده هو
// (الجنس، الموسم، ما إلى ذلك). المنتقي يعرض ويحدّد ويسلّم.
export type PickerItem = { id: number; name: string; badges?: React.ReactNode; notice?: React.ReactNode };

export function PassengerPicker({
  title, search, onSearch, items, selected, onToggle, onToggleAll,
  emptyText, countText, footer, drag, disabled,
}: {
  title: React.ReactNode;
  search: string;
  onSearch: (v: string) => void;
  items: PickerItem[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  emptyText: string;
  countText: string;
  footer?: React.ReactNode;      // زرّ الإضافة الجماعيّة — نصّه وقواعده من نطاقه
  drag?: { onDragStart: (id: number) => void; onDragEnd: () => void; draggingId: number | null };
  disabled?: boolean;
}) {
  const allOn = items.length > 0 && selected.size === items.length;
  return (
    <>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
          {selected.size > 0 ? `${selected.size} محدد` : title}
        </span>
        {items.length > 0 && !disabled && (
          <button onClick={onToggleAll}
            style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "color-mix(in srgb, var(--primary) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)", color: "var(--primary)", cursor: "pointer", fontFamily: "var(--font-body)", flexShrink: 0 }}>
            {allOn ? "إلغاء تحديد الكل" : "تحديد الكل"}
          </button>
        )}
      </div>

      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <AllocationSearch value={search} onChange={onSearch} placeholder="ابحث عن مسافر..." compact />
      </div>

      <div style={{ display: "flex", alignItems: "center", padding: "5px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{countText}</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--muted)", fontSize: 11 }}>{emptyText}</div>
        ) : items.map(p => {
          const on = selected.has(p.id);
          return (
            <div key={p.id} role="checkbox" aria-checked={on} tabIndex={disabled ? -1 : 0}
              draggable={!!drag && !disabled}
              onDragStart={() => drag?.onDragStart(p.id)} onDragEnd={drag?.onDragEnd}
              onClick={() => !disabled && onToggle(p.id)}
              onKeyDown={e => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onToggle(p.id); } }}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                borderBottom: "1px solid var(--line)", cursor: disabled ? "default" : drag ? "grab" : "pointer",
                background: on ? "color-mix(in srgb, var(--primary) 12%, transparent)"
                  : drag?.draggingId === p.id ? "color-mix(in srgb, var(--primary) 5%, transparent)" : "transparent",
              }}>
              {/* مربّع الاختيار يتصدّر الصفّ في الصفحتين — كان يميناً
                  هنا ويساراً هناك بلا سبب */}
              <div aria-hidden style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${on ? "var(--primary)" : "var(--line)"}`, background: on ? "var(--primary)" : "transparent" }}>
                {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-inverse)" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                  {p.badges}
                </div>
                {p.notice}
              </div>
            </div>
          );
        })}
      </div>
      {footer && <div style={{ padding: "10px 12px", borderTop: "1px solid var(--line)", flexShrink: 0, background: "var(--paper)" }}>{footer}</div>}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// الاقتراحات الذكيّة — العرض وحده
// ═══════════════════════════════════════════════════════════
// الترتيب والأسباب يحسبهما النطاق: إشارات الباص ليست إشارات منى،
// ووزنُها ليس وزنَها. هنا الشريط فقط — مضغوطاً كما كان، فالقائمة
// هي المهمّة والاقتراح معونة.
export type SuggestionTone = "kin" | "room" | "other";
export type SuggestionItem = { id: number; name: string; reason: React.ReactNode; tone: SuggestionTone };

const TONE_BG: Record<SuggestionTone, string> = {
  kin:   "color-mix(in srgb, var(--success) 12%, var(--paper))",
  room:  "color-mix(in srgb, var(--info) 12%, var(--paper))",
  other: "color-mix(in srgb, var(--warning) 12%, var(--paper))",
};
const TONE_LINE: Record<SuggestionTone, string> = {
  kin:   "color-mix(in srgb, var(--success) 45%, transparent)",
  room:  "color-mix(in srgb, var(--info) 45%, transparent)",
  other: "color-mix(in srgb, var(--warning) 45%, transparent)",
};

export function SuggestionStrip({ items, onAccept, onDismiss, blockedReason }: {
  items: SuggestionItem[];
  onAccept: (id: number) => void;
  onDismiss: (id: number) => void;
  /* نصٌّ إن تعذّر القبول — حاويةٌ مكتملة أو موسمٌ للعرض. وجودُه
     يعطّل «＋» ويشرح السبب بدل أن يَعِد بما لا يقع. */
  blockedReason?: string;
}) {
  if (!items.length) return null;
  return (
    <div style={{ flexShrink: 0, borderTop: "2px solid var(--line)", background: "var(--bg-2)", padding: "8px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: "var(--info)", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
        <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4" /></svg>
        اقتراحات ذكية
        <span style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700 }}>({items.length})</span>
        {blockedReason && <span style={{ fontSize: 9, color: "var(--danger)", fontWeight: 800 }}>· {blockedReason}</span>}
      </div>
      <div style={{ maxHeight: 114, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map(s => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${TONE_LINE[s.tone]}`, background: TONE_BG[s.tone] }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11.5, fontWeight: 900, color: "var(--ink)" }}>{s.name}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--muted)" }}>· {s.reason}</span>
            </div>
            <button onClick={() => onAccept(s.id)} disabled={!!blockedReason}
              title={blockedReason || "إضافة"} aria-label={`إضافة ${s.name}`}
              style={{ width: 26, height: 26, borderRadius: 8, border: "none", background: blockedReason ? "var(--line)" : "var(--success)", color: blockedReason ? "var(--muted)" : "var(--text-inverse)", display: "flex", alignItems: "center", justifyContent: "center", cursor: blockedReason ? "not-allowed" : "pointer", flexShrink: 0, opacity: blockedReason ? .6 : 1 }}>
              <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
            <button onClick={() => onDismiss(s.id)} aria-label={`تجاهل اقتراح ${s.name}`}
              style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "var(--bg-input)", cursor: "pointer", color: "var(--muted)", fontSize: 11, flexShrink: 0 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// مودال التوزيع — واحدٌ للباص والمخيّمين
// ═══════════════════════════════════════════════════════════
// عرضٌ ثابتٌ ٩٦٠px كان يفيض أفقياً تحت ١٠٠٠px. والعرض هنا مرن،
// والعمودان ينهاران إلى عمودٍ واحد على الشاشات الضيّقة — فلا
// يُفقَد المنتقي ولا الاقتراحات ولا زرّ الترتيب.
//
// ولا نعتمد لوحةَ الفندق الجانبيّة (٢٧٢px): الغرفة تسع أربعة،
// والباص يسع خمسين — قائمةٌ بهذا الطول في عمودٍ بهذا الضيق، إلى
// جانب منتقٍ، غيرُ قابلةٍ للاستعمال.
export function AllocationDialog({
  onClose, icon, title, badges, meta, actions, roster, picker, labelledBy = "alloc-dialog-title",
}: {
  onClose: () => void;
  icon: React.ReactNode;
  title: React.ReactNode;
  badges?: React.ReactNode;
  meta: React.ReactNode;        // السعة والمتبقّي والشريط
  actions: React.ReactNode;     // طباعة · حذف · ما تخصّه الصفحة
  roster: React.ReactNode;      // القائمة + الاقتراحات
  picker: React.ReactNode;
  labelledBy?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    /* البؤرة تدخل المودال فلا تبقى خلف الحجاب */
    cardRef.current?.focus();
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <style>{`
        .alloc-dlg { width: min(1040px, 96vw); height: min(88vh, 900px); }
        .alloc-body { display: flex; flex: 1; min-height: 0; }
        .alloc-roster { flex: 1; display: flex; flex-direction: column; min-height: 0; border-inline-start: 1px solid var(--line); }
        .alloc-picker { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; background: var(--bg-2); }
        @media (max-width: 860px) {
          .alloc-dlg { width: 100%; height: 94vh; }
          .alloc-body { flex-direction: column; }
          .alloc-roster { border-inline-start: none; flex: 1 1 55%; }
          .alloc-picker { width: auto; flex: 1 1 45%; border-top: 2px solid var(--line); }
        }
      `}</style>
      <div ref={cardRef} className="alloc-dlg" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{ background: "var(--paper)", borderRadius: 20, display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.35)", overflow: "hidden", outline: "none" }}>

        {/* ══ الترويسة — على لون السمة، والأسطح الشفيفة على
             `--text-inverse` فتنقلب معه في الداكنة ══ */}
        <div style={{ background: "linear-gradient(150deg, var(--primary), var(--primary-dark, var(--primary)))", color: "var(--text-inverse)", padding: "12px 16px", flexShrink: 0, position: "relative", overflow: "hidden" }}>
          <div aria-hidden style={{ position: "absolute", insetInlineStart: -10, bottom: -18, opacity: .12, pointerEvents: "none", transform: "scale(4)", transformOrigin: "bottom left" }}>{icon}</div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, position: "relative", zIndex: 1 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div id={labelledBy} style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.2, fontFamily: "var(--font-heading)" }}>{title}</div>
                {badges}
              </div>
              <div style={{ marginTop: 7 }}>{meta}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {actions}
              <button onClick={onClose} aria-label="إغلاق"
                style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid color-mix(in srgb, var(--text-inverse) 30%, transparent)", background: "color-mix(in srgb, var(--text-inverse) 12%, transparent)", cursor: "pointer", color: "var(--text-inverse)", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
          </div>
        </div>

        <div className="alloc-body">
          <div className="alloc-roster">{roster}</div>
          <div className="alloc-picker">{picker}</div>
        </div>
      </div>
    </div>
  );
}

/* زرّ أيقونةٍ في ترويسة المودال — شكلٌ واحد لطباعةٍ وحذفٍ وترتيب */
export function DialogAction({ onClick, label, danger, disabled, children }: {
  onClick: () => void; label: string; danger?: boolean; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={label} aria-label={label} disabled={disabled}
      style={{
        width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        border: "1px solid color-mix(in srgb, var(--text-inverse) 30%, transparent)",
        background: "color-mix(in srgb, var(--text-inverse) 12%, transparent)",
        color: danger ? "var(--danger)" : "var(--text-inverse)",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .4 : 1,
      }}>{children}</button>
  );
}

/* ترويسة القائمة: العنوان + العدّاد + التركيبة */
export function RosterHeader({ count, breakdown }: { count: React.ReactNode; breakdown?: React.ReactNode }) {
  return (
    <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>المسافرون المضافون</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)", background: "color-mix(in srgb, var(--primary) 12%, transparent)", padding: "2px 8px", borderRadius: 99 }}>{count}</span>
      {breakdown && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", marginInlineStart: "auto" }}>{breakdown}</span>}
    </div>
  );
}
