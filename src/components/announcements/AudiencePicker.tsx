/* ═══ جمهورُ التنبيه — Phase 1 ═══
   منتقي فئاتٍ مركّبة يبني `announcements.audience` كما تقبله القاعدة
   (`_announcement_audience_check`): الكلّ، وأنواعُ الركّاب المشمولة، والباصات،
   ومخيّمات منى وعرفة (والخيامُ الخاصّة منها)، والفنادق، والرحلات، والحجّاجُ بأعيانهم.
   الجمهورُ = اتّحادُ المختار بلا تكرار، ويُجمَّد عند النشر في القاعدة لا هنا.

   ⚠️ الموسمُ النشط لا المعروض — كقوائم الاستهداف السابقة في PortalPage: البوابةُ تخدم
   الموسمَ النشط وحده، والقاعدةُ ترفض معرّفاً من موسمٍ آخر. */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase";
import { inp } from "../../utils";
import { CATS, PASSENGER_TYPES, type Audience, type IdKey, type Opt, type Pilgrim } from "./audience";

type Props = {
  seasonId: number;
  value: Audience;
  onChange: (a: Audience) => void;
  /** يعيد أسماءَ الخيارات للأب (وصفُ البطاقات) */
  onNames?: (names: Record<string, Record<number, string>>) => void;
};

export function AudiencePicker({ seasonId, value, onChange, onNames }: Props) {
  const [opts, setOpts] = useState<Record<string, Opt[]>>({});
  const [pilgrims, setPilgrims] = useState<Pilgrim[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState<IdKey | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const [b, c, h, f, p] = await Promise.all([
        supabase.from("buses").select("id,name").eq("season_id", seasonId).order("id"),
        supabase.from("camps").select("id,name,page_type,type,gender").eq("season_id", seasonId).order("sort_order", { nullsFirst: false }).order("id"),
        supabase.from("hotels").select("id,name").eq("season_id", seasonId).order("id"),
        supabase.from("flights").select("id,name,type,date").eq("season_id", seasonId).order("date").order("id"),
        supabase.from("passengers").select("id,name_ar,short_ar,passenger_type,passport,national_id").eq("season_id", seasonId).order("id"),
      ]);
      if (!alive) return;
      if (b.error || c.error || h.error || f.error || p.error) { setLoadError(true); return; }
      const camps = (c.data || []) as { id: number; name: string; page_type: string; type: string | null; gender: string | null }[];
      /* الخيمةُ الخاصّة مخيّمٌ بنوع «خاص» في منى أو عرفة: تُعرض في مجموعتها تحت فئتها. والجنسُ في
         الاسم (كما في التقارير): مخيّما رجالٍ ونساءٍ باسمٍ واحد لا يلتبسان؛ والخاصُّ بلا جنسٍ يبقى باسمه */
      const sex = (g: string | null) => (g === "ذكر" ? "رجال" : g === "أنثى" ? "نساء" : null);
      const campOpt = (page: string) => camps.filter(x => x.page_type === page)
        .map(x => {
          const g = sex(x.gender);
          return { id: x.id, name: g ? `${x.name} (${g})` : x.name, group: x.type === "خاص" ? "الخيام الخاصة" : "المخيمات" };
        });
      const next: Record<string, Opt[]> = {
        bus: (b.data || []).map(x => ({ id: x.id, name: x.name || `باص ${x.id}` })),
        camp_mina: campOpt("منى"),
        camp_arafa: campOpt("عرفة"),
        hotel: (h.data || []).map(x => ({ id: x.id, name: x.name })),
        flight: (f.data || []).map(x => ({ id: x.id, name: `${x.name} · ${x.type}${x.date ? ` · ${x.date}` : ""}`, group: x.type === "ذهاب" ? "الذهاب" : "العودة" })),
      };
      setOpts(next);
      setPilgrims((p.data || []).map(x => ({ id: x.id, name: x.name_ar || x.short_ar || `#${x.id}`, type: x.passenger_type || "حاج", doc: x.passport || x.national_id || "" })));
      setLoadError(false);
      if (onNames) {
        const names: Record<string, Record<number, string>> = {};
        for (const [k, list] of Object.entries(next)) names[k] = Object.fromEntries(list.map(o => [o.id, o.name]));
        onNames(names);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  const types = value.types && value.types.length ? value.types : ["حاج"];
  const toggleId = (k: IdKey, id: number) => {
    const cur = value[k] || [];
    onChange({ ...value, [k]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
  };
  const toggleType = (t: string) => {
    const next = types.includes(t) ? types.filter(x => x !== t) : [...types, t];
    onChange({ ...value, types: next.length ? next : ["حاج"] });
  };
  const pilgrimMatches = useMemo(() => {
    const s = q.trim();
    if (s.length < 2) return [];
    return pilgrims.filter(p => p.name.includes(s) || p.doc.includes(s)).slice(0, 20);
  }, [q, pilgrims]);
  const pilgrimName = (id: number) => pilgrims.find(p => p.id === id)?.name || `#${id}`;

  const chip = (on: boolean) => ({
    border: on ? "1.5px solid var(--primary)" : "1px solid var(--border)", background: on ? "var(--bg-hover)" : "var(--bg-card)",
    color: on ? "var(--primary)" : "var(--text-muted)", borderRadius: "var(--radius-md)", fontSize: 11.5, fontWeight: on ? 800 : 600,
    padding: "5px 12px", cursor: "pointer", fontFamily: "inherit",
  });
  const pill = (on: boolean) => ({
    border: on ? "2px solid var(--primary)" : "1px solid var(--border)", background: on ? "var(--primary)" : "var(--bg-card)",
    color: on ? "var(--text-inverse)" : "var(--text-main)", borderRadius: 99, fontSize: 11.5, fontWeight: 800, padding: "5px 14px",
    cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <div>
      {loadError && <div style={{ fontSize: 11.5, color: "var(--danger)", fontWeight: 700, marginBottom: 8 }}>تعذر تحميل قوائم الاستهداف. يرجى تحديث الصفحة.</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" onClick={() => onChange({ ...value, all: !value.all })} style={pill(!!value.all)}>
          {value.all ? "✓ " : ""}جميع الحجاج
        </button>
        {CATS.map(c => {
          const n = (value[c.key] || []).length;
          return (
            <button type="button" key={c.key} onClick={() => setOpen(open === c.key ? null : c.key)} style={pill(open === c.key || n > 0)}>
              {c.label}{n ? ` (${n})` : ""}
            </button>
          );
        })}
        <button type="button" onClick={() => setOpen(open === "pilgrim" ? null : "pilgrim")} style={pill(open === "pilgrim" || (value.pilgrim || []).length > 0)}>
          حجاج محددون{(value.pilgrim || []).length ? ` (${(value.pilgrim || []).length})` : ""}
        </button>
      </div>

      {open && open !== "pilgrim" && (
        <div style={{ marginTop: 9 }}>
          {(opts[open] || []).length === 0 && <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>لا توجد عناصر في الموسم النشط.</div>}
          {Array.from(new Set((opts[open] || []).map(o => o.group || ""))).map(g => (
            <div key={g} style={{ marginBottom: 6 }}>
              {g && <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 700, margin: "2px 2px 5px" }}>{g}</div>}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(opts[open] || []).filter(o => (o.group || "") === g).map(o => {
                  const on = (value[open] || []).includes(o.id);
                  return <button type="button" key={o.id} onClick={() => toggleId(open, o.id)} style={chip(on)}>{on ? "✓ " : ""}{o.name}</button>;
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {open === "pilgrim" && (
        <div style={{ marginTop: 9 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث بالاسم أو رقم الجواز/الهوية (حرفان على الأقل)"
            style={{ ...inp, maxWidth: 380 }} />
          {pilgrimMatches.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
              {pilgrimMatches.map(p => {
                const on = (value.pilgrim || []).includes(p.id);
                return <button type="button" key={p.id} onClick={() => toggleId("pilgrim", p.id)} style={chip(on)}>
                  {on ? "✓ " : ""}{p.name}{p.type !== "حاج" ? ` · ${p.type}` : ""}
                </button>;
              })}
            </div>
          )}
          {(value.pilgrim || []).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {(value.pilgrim || []).map(id => (
                <button type="button" key={id} onClick={() => toggleId("pilgrim", id)} style={chip(true)} title="إزالة">✕ {pilgrimName(id)}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* «الكلّ» والفئاتُ للحجّاج وحدهم، إلا ما يُختار صراحةً هنا. والمختارُ بالاسم يُشمَل أيّاً كان نوعُه. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 10 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>يشمل:</span>
        {PASSENGER_TYPES.map(t => (
          <label key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--text-main)", cursor: "pointer" }}>
            <input type="checkbox" checked={types.includes(t)} onChange={() => toggleType(t)} />
            {t === "حاج" ? "الحجاج" : t}
          </label>
        ))}
      </div>
    </div>
  );
}
