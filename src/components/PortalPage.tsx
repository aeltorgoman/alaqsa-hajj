import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { AlertModal, useAlert, useConfirm, ConfirmModal } from "./AlertModal";
import { DeliveryReportModal } from "./DeliveryReportModal";
import type { User } from "../types";
import { btnP, btnS, inp } from "../utils";
import { createWriteHelpers } from "../utils/write";
import { useSeason } from "../season/useSeason";
import { companyService } from "../company/companyService";

/* ═══════════════════════════════════════════════════════════════
   صفحة "بوابة الحاج" الإدارية
   التبويب الأول: التنبيهات (فورية ومجدولة، بأولويات وصلاحية واستهداف)
   التبويب الثاني: إعدادات البوابة (إداري الحملة + مفاتيح التشغيل)
   ═══════════════════════════════════════════════════════════════ */

type Announcement = { id: number; title: string | null; body: string; priority: string; show_at: string; expires_at: string | null; created_by: string | null; created_at: string; target_type?: string | null; target_ids?: number[] | null; push_sent_at?: string | null };

type Target = { id: number; name: string };

const TARGET_KINDS = [
  { key: "all", label: "جميع الحجاج" },
  { key: "bus", label: "حسب الباص" },
  { key: "camp_mina", label: "مخيم منى" },
  { key: "camp_arafa", label: "مخيم عرفة" },
];

const PRIORITIES = [
  { key: "عاجل", color: "var(--primary)", txt: "var(--text-inverse)" },
  { key: "مهم", color: "var(--accent)", txt: "#3d0f1f" },
  { key: "عام", color: "var(--bg-hover)", txt: "var(--text-main)" },
];

const DURATIONS = [
  { key: "1h", label: "ساعة واحدة", ms: 3600000 },
  { key: "6h", label: "6 ساعات", ms: 6 * 3600000 },
  { key: "24h", label: "يوم كامل", ms: 24 * 3600000 },
  { key: "custom", label: "وقت محدد", ms: 0 },
  { key: "none", label: "بدون انتهاء", ms: -1 },
];

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PortalPage({ currentUser }: { currentUser: User }) {
  const [tab, setTab] = useState<"alerts" | "settings">("alerts");
  const { alert: alertState, showAlert } = useAlert();
  const { confirmState, confirmAction, handleConfirm, handleCancel } = useConfirm();
  const { writeOk } = createWriteHelpers(showAlert);
  /* activeSeason لا viewedSeason — انظر التعليق فوق قوائم الاستهداف */
  const { activeSeason } = useSeason();

  /* ─── التنبيهات ─── */
  const [items, setItems] = useState<Announcement[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("عام");
  const [targetKind, setTargetKind] = useState("all");
  const [targetIds, setTargetIds] = useState<number[]>([]);
  const [buses, setBuses] = useState<Target[]>([]);
  const [minaCamps, setMinaCamps] = useState<Target[]>([]);
  const [arafaCamps, setArafaCamps] = useState<Target[]>([]);
  const [audienceIds, setAudienceIds] = useState<number[]>([]);
  const [enabledIds, setEnabledIds] = useState<Set<number>>(new Set());
  const [audienceError, setAudienceError] = useState(false);
  const [enabledError, setEnabledError] = useState(false);
  const [reportFor, setReportFor] = useState<Announcement | null>(null);
  const [when, setWhen] = useState<"now" | "scheduled">("now");
  const [showAt, setShowAt] = useState(() => toLocalInput(new Date(Date.now() + 3600000)));
  const [duration, setDuration] = useState("24h");
  const [expiresAt, setExpiresAt] = useState(() => toLocalInput(new Date(Date.now() + 2 * 3600000)));
  const [sending, setSending] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());

  /* م٧ — تنبيهات الموسم النشط وحده، و`activeSeason` لا `viewedSeason`
     للسبب الموثَّق فوق قوائم الاستهداف: هذا التبويب أداة تشغيل
     للبوابة لا شاشة أرشيف، والبوابة تخدم النشط وحده (§٦ من #42).
     والقاعدة تفرض المطابقة نفسها: `active_season_id()` في دالّتي
     البوابة، ومحفّز ث٣ يرفض الكتابة على موسم مقفل. */
  const load = async () => {
    const { data, error } = await supabase.from("announcements").select("*").eq("season_id", activeSeason.id).order("show_at", { ascending: false });
    /* الفشل يُبلَّغ عنه بدل قائمة فارغة تبدو «لا توجد تنبيهات». وload
       تعمل كل 30 ثانية، فآخر قائمة صحيحة تبقى معروضة عند فشل تحديث
       عابر بدل أن تُمحى الشاشة. */
    if (error || !data) {
      console.error("تعذر تحميل التنبيهات", error);
      setItemsError(true);
    } else {
      setItems(data as Announcement[]);
      setNowMs(Date.now());
      setItemsError(false);
    }
    setItemsLoading(false);
  };

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    const t = setInterval(load, 30000);
    return () => { clearTimeout(t0); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeason.id]);

  /* ─── قوائم الاستهداف ─── */
  /* ⚠️ استثناء معماريّ مقصود: هذا الموضع يقرأ activeSeason لا
     viewedSeason — وهو المكان الوحيد في التطبيق الذي يفعل ذلك.
     لا تُصحّحه إلى viewedSeason.

     السبب أن هذا التبويب أداة تشغيل لبوابة الحاج لا شاشة أرشيف،
     و§٦ من #42 يقرّر أن البوابة تخدم الموسم النشط وحده. ودالة
     announcement_audience في القاعدة تفلتر بالموسم النشط بالفعل،
     فاستهداف باص من موسم مقفل كان سيُنتج جمهوراً فارغاً دائماً —
     واجهة تعد بإرسال لا يقع. */
  useEffect(() => {
    (async () => {
      const [{ data: bs }, { data: cs }] = await Promise.all([
        supabase.from("buses").select("id,name").eq("season_id", activeSeason.id).order("id"),
        supabase.from("camps").select("id,name,page_type").eq("season_id", activeSeason.id).order("id"),
      ]);
      if (bs) setBuses(bs as Target[]);
      if (cs) {
        const all = cs as { id: number; name: string; page_type: string | null }[];
        setMinaCamps(all.filter(c => c.page_type === "منى").map(c => ({ id: c.id, name: c.name })));
        setArafaCamps(all.filter(c => c.page_type === "عرفة").map(c => ({ id: c.id, name: c.name })));
      }
    })();
  }, [activeSeason.id]);

  /* ─── المفعّلون للإشعارات ───
     لا تعتمد على الاستهداف إطلاقاً، فتُجلب مرة واحدة بدل استعلام
     كامل مع كل نقرة على أزرار الاستهداف. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("push_enabled_passengers");
      if (cancelled) return;
      if (error) { console.error("تعذر تحميل قائمة المفعّلين للإشعارات", error); setEnabledError(true); return; }
      setEnabledIds(new Set((data || []).map(r => r.passenger_id)));
      setEnabledError(false);
    })();
    return () => { cancelled = true; };
  }, []);

  /* ─── جمهور التنبيه حسب الاستهداف ───
     علامة الإلغاء تمنع استجابة قديمة من دهس أحدث منها عند تبديل
     الاستهداف بسرعة — والعدد المعروض هو ما يبني عليه المستخدم قرار
     الإرسال. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("announcement_audience", {
        p_target_type: targetKind,
        p_target_ids: targetIds,
      });
      if (cancelled) return;
      if (error) { console.error("تعذر حساب عدد المستهدفين", error); setAudienceIds([]); setAudienceError(true); return; }
      setAudienceIds((data || []).map(r => r.passenger_id));
      setAudienceError(false);
    })();
    return () => { cancelled = true; };
  }, [targetKind, targetIds]);

  /* العددان مشتقّان من مصدر واحد، فلا يتفارقان ولا يحتاج أحدهما
     إعادة جلب الآخر */
  const audienceCount = audienceIds.length;
  const enabledCount = audienceIds.filter(id => enabledIds.has(id)).length;

  const targetOptions = targetKind === "bus" ? buses
    : targetKind === "camp_mina" ? minaCamps
    : targetKind === "camp_arafa" ? arafaCamps
    : [];

  function toggleTarget(id: number) {
    setTargetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function send() {
    if (!body.trim()) { showAlert("warning", "يرجى كتابة نص التنبيه."); return; }
    if (targetKind !== "all" && targetIds.length === 0) { showAlert("warning", "يرجى اختيار جهة واحدة على الأقل، أو تحديد جميع الحجاج."); return; }
    const show = when === "now" ? new Date() : new Date(showAt);
    let expires: Date | null = null;
    const dur = DURATIONS.find(d => d.key === duration)!;
    if (dur.key === "custom") expires = new Date(expiresAt);
    else if (dur.ms > 0) expires = new Date(show.getTime() + dur.ms);
    if (expires && expires <= show) { showAlert("warning", "وقت الانتهاء يجب أن يكون بعد وقت الظهور."); return; }
    setSending(true);
    const { data: created, error } = await supabase.from("announcements").insert({
      title: title.trim() || null,
      body: body.trim(), priority,
      /* «الآن» تعني ساعة القاعدة لا ساعة المتصفّح.
         العمود افتراضه `now()`، فإسقاطه يجعل الخادم يختم الوقت.
         وإرسال ساعة الجهاز كان يضع `show_at` في المستقبل كلّما
         تقدّمت ساعة الموظّف — فيصل الدفع إلى الحاجّ فوراً، وتُرشِّح
         البوابة الإعلانَ بـ`show_at <= now()` فلا يجده في قائمته
         حتى يمرّ الفارق. أمّا الموعد المجدوَل فيبقى كما اختاره
         الموظّف: هو وقتٌ مقصود لا لحظة إرسال. */
      ...(when === "now" ? {} : { show_at: show.toISOString() }),
      expires_at: expires ? expires.toISOString() : null,
      created_by: currentUser.name,
      target_type: targetKind,
      target_ids: targetKind === "all" ? [] : targetIds,
    }).select("id").single();
    if (error || !created) {
      setSending(false);
      showAlert("error", "تعذر إرسال التنبيه، يرجى المحاولة مرة أخرى.");
      return;
    }

    /* التنبيه محفوظ الآن ولن يضيع، ودفعه إلى الأجهزة طبقة إضافية فوقه */
    let pushNote = "";
    if (when === "now") {
      try {
        const { data: res, error: fnErr } = await supabase.functions.invoke("send-pilgrim-push", {
          body: { announcement_id: created.id },
        });
        if (fnErr || (res as { error?: unknown })?.error) {
          pushNote = " تعذّر دفع التنبيه إلى الأجهزة، لكنه سيظهر للحجاج عند فتح البوابة.";
        } else {
          const r = res as { sent: number; disabled: number };
          pushNote = ` وصل إلى ${r.sent} من الأجهزة المفعّلة.`;
          if (r.disabled > 0) pushNote += ` و${r.disabled} من الحجاج غير مفعّلين، وسيرونه عند فتح البوابة.`;
        }
      } catch {
        pushNote = " تعذّر دفع التنبيه إلى الأجهزة، لكنه سيظهر للحجاج عند فتح البوابة.";
      }
    }

    setSending(false);
    showAlert("success", (when === "now" ? "تم إرسال التنبيه." : "تمت جدولة التنبيه بنجاح.") + pushNote);
    setTitle(""); setBody(""); setPriority("عام"); setWhen("now"); setDuration("24h");
    setTargetKind("all"); setTargetIds([]);
    load();
  }

  async function endNow(a: Announcement) {
    const ok = await confirmAction("سيختفي هذا التنبيه من بوابة الحاج فوراً. هل أنت متأكد؟", { title: "إنهاء التنبيه", confirmLabel: "إنهاء" });
    if (!ok) return;
    if (!await writeOk(supabase.from("announcements").update({ expires_at: new Date().toISOString() }).eq("id", a.id), "تعذر إنهاء التنبيه")) return;
    load();
  }

  async function removeItem(a: Announcement) {
    const ok = await confirmAction("سيتم حذف التنبيه نهائياً. هل أنت متأكد؟", { title: "حذف التنبيه", confirmLabel: "حذف" });
    if (!ok) return;
    if (!await writeOk(supabase.from("announcements").delete().eq("id", a.id), "تعذر حذف التنبيه")) return;
    load();
  }

  const live = items.filter(a => new Date(a.show_at).getTime() <= nowMs && (!a.expires_at || new Date(a.expires_at).getTime() > nowMs));
  const scheduled = items.filter(a => new Date(a.show_at).getTime() > nowMs);
  const ended = items.filter(a => a.expires_at && new Date(a.expires_at).getTime() <= nowMs);

  /* ─── الإعدادات ─── */
  const [cfgId, setCfgId] = useState<number | null>(null);
  const [adminName, setAdminName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminWa, setAdminWa] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [hotelName, setHotelName] = useState("");
  const [hotelAddress, setHotelAddress] = useState("");
  const [hotelUrl, setHotelUrl] = useState("");
  const [minaAddress, setMinaAddress] = useState("");
  const [minaUrl, setMinaUrl] = useState("");
  const [arafaAddress, setArafaAddress] = useState("");
  const [arafaUrl, setArafaUrl] = useState("");
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [portalSettings, setPortalSettings] = useState<Record<string, boolean>>({});
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [helpMessage, setHelpMessage] = useState("");
  const [savingCfg, setSavingCfg] = useState(false);
  const [cfgLoading, setCfgLoading] = useState(true);
  const [cfgError, setCfgError] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await companyService.loadConfig();
      /* بدون هذا كان الفشل ينتهي بحقول فارغة وزر حفظ معطَّل بلا تفسير */
      if (error || !data) {
        console.error("تعذر تحميل إعدادات البوابة", error);
        setCfgError(true);
      } else {
        setCfgError(false);
        setCfgId(data.id);
        setAdminName(data.admin_name || "");
        setAdminPhone(data.admin_phone || "");
        setAdminWa(data.admin_whatsapp || "");
        setCountry(data.country || "");
        setCity(data.city || "");
        setHotelName(data.hotel_name || "");
        setHotelAddress(data.hotel_address || "");
        setHotelUrl(data.hotel_url || "");
        setMinaAddress(data.camp_mina_address || "");
        setMinaUrl(data.camp_mina_url || "");
        setArafaAddress(data.camp_arafa_address || "");
        setArafaUrl(data.camp_arafa_url || "");
        setFeatures((data.features as Record<string, boolean>) || {});
        setPortalSettings((data.portal_settings as Record<string, boolean>) || {});
        setWelcomeMessage(data.portal_welcome_message || "");
        setHelpMessage(data.portal_help_message || "");
      }
      setCfgLoading(false);
    })();
  }, []);

  async function saveSettings() {
    if (cfgId == null) return;
    setSavingCfg(true);
    const { error } = await companyService.updateConfig({
      admin_name: adminName.trim() || null,
      admin_phone: adminPhone.trim() || null,
      admin_whatsapp: adminWa.trim() || null,
      country: country.trim() || null,
      city: city.trim() || null,
      hotel_name: hotelName.trim() || null,
      hotel_address: hotelAddress.trim() || null,
      hotel_url: hotelUrl.trim() || null,
      camp_mina_address: minaAddress.trim() || null,
      camp_mina_url: minaUrl.trim() || null,
      camp_arafa_address: arafaAddress.trim() || null,
      camp_arafa_url: arafaUrl.trim() || null,
      features,
      portal_settings: portalSettings,
      portal_welcome_message: welcomeMessage.trim() || null,
      portal_help_message: helpMessage.trim() || null,
    });
    setSavingCfg(false);
    if (error) showAlert("error", "تعذر حفظ الإعدادات، يرجى المحاولة مرة أخرى.");
    else showAlert("success", "تم حفظ إعدادات البوابة بنجاح.");
  }

  const portalUrl = `${window.location.origin}/hajj`;

  const TOGGLES = [
    { key: "flights", label: "معلومات الرحلات", desc: "إظهار بيانات رحلة الذهاب والعودة" },
    { key: "rooms", label: "معلومات الغرفة", desc: "إظهار رقم الغرفة والدور والنوع" },
    { key: "buses", label: "معلومات الباص", desc: "إظهار بيانات باص الحاج" },
    { key: "documents", label: "المستندات", desc: "عرض تصريح الحج وتذكرة الطيران" },
    { key: "pdf_downloads", label: "تنزيل الملفات", desc: "إظهار زر تنزيل المستند المفتوح" },
    { key: "notifications", label: "التنبيهات", desc: "إظهار تبويب التنبيهات وخيارات التفعيل" },
    { key: "roommates", label: "رفقاء الغرفة", desc: "إظهار أسماء زملاء الغرفة" },
    { key: "lost_card", label: "بطاقة أنا تائه", desc: "إظهار بطاقة تعريف الطوارئ" },
  ];

  const annCard = (a: Announcement, kind: "live" | "scheduled" | "ended") => {
    const pr = PRIORITIES.find(p => p.key === a.priority) || PRIORITIES[2];
    return (
      <div key={a.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRight: `3px solid ${kind === "ended" ? "var(--border)" : pr.color}`, borderRadius: "var(--radius-md)", padding: "12px 14px", marginBottom: 9, opacity: kind === "ended" ? 0.55 : 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9.5, background: pr.color, color: pr.txt, padding: "2px 10px", borderRadius: 99, fontWeight: 800 }}>{a.priority}</span>
          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
            {kind === "scheduled" ? "سيظهر: " : "ظهر: "}{new Date(a.show_at).toLocaleString("ar-EG", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}
            {a.expires_at ? ` — ينتهي: ${new Date(a.expires_at).toLocaleString("ar-EG", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}` : " — بدون انتهاء"}
          </span>
          {a.created_by && <span style={{ fontSize: 10, color: "var(--text-muted)", marginInlineStart: "auto" }}>{a.created_by}</span>}
        </div>
        {a.title && <div style={{ fontSize: 13, color: "var(--text-main)", fontWeight: 800, marginTop: 7 }}>{a.title}</div>}
        <div style={{ fontSize: 13, color: "var(--text-main)", fontWeight: 600, marginTop: a.title ? 3 : 7, lineHeight: 1.9 }}>{a.body}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
          {kind !== "ended" && kind === "live" && <button onClick={() => endNow(a)} style={{ ...btnS(), fontSize: 11, padding: "5px 14px" }}>إنهاء الآن</button>}
          {kind !== "ended" && <button onClick={() => removeItem(a)} style={{ ...btnS(), fontSize: 11, padding: "5px 14px", color: "var(--primary)" }}>حذف</button>}
          {a.push_sent_at && <button onClick={() => setReportFor(a)} style={{ ...btnS(), fontSize: 11, padding: "5px 14px" }}>تقرير الوصول</button>}
        </div>
      </div>
    );
  };

  const secTitle = (t: string, count: number, dot?: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "18px 2px 10px" }}>
      {dot && <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />}
      <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-main)" }}>{t}</span>
      <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 700 }}>({count})</span>
    </div>
  );

  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      {reportFor && (
        <DeliveryReportModal
          announcementId={reportFor.id}
          announcementBody={reportFor.title || reportFor.body}
          onClose={() => setReportFor(null)}
        />
      )}

      {/* رأس الصفحة */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text-main)" }}>بوابة الحاج</div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>إدارة التنبيهات وإعدادات البوابة التي يراها الحجاج</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", direction: "ltr" }}>{portalUrl}</span>
          <button onClick={() => { navigator.clipboard?.writeText(portalUrl); showAlert("success", "تم نسخ رابط البوابة، يمكنك مشاركته مع الحجاج."); }} style={{ ...btnP(), fontSize: 11.5, padding: "7px 16px" }}>نسخ الرابط</button>
        </div>
      </div>

      {/* التبويبات */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {[{ id: "alerts", label: "التنبيهات" }, { id: "settings", label: "إعدادات البوابة" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
            style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, padding: "8px 16px 10px", color: tab === t.id ? "var(--primary)" : "var(--text-muted)", borderBottom: tab === t.id ? "2.5px solid var(--primary)" : "2.5px solid transparent" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "alerts" && <>
        {/* صندوق الإرسال */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 8 }}>
          {/* الاستهداف */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>المستهدفون</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TARGET_KINDS.map(k => (
                <button key={k.key} onClick={() => { setTargetKind(k.key); setTargetIds([]); }}
                  style={{ border: targetKind === k.key ? "2px solid var(--primary)" : "1px solid var(--border)", background: targetKind === k.key ? "var(--primary)" : "var(--bg-card)", color: targetKind === k.key ? "var(--text-inverse)" : "var(--text-main)", borderRadius: 99, fontSize: 11.5, fontWeight: 800, padding: "5px 15px", cursor: "pointer", fontFamily: "inherit" }}>
                  {k.label}
                </button>
              ))}
            </div>
            {targetOptions.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
                {targetOptions.map(o => {
                  const on = targetIds.includes(o.id);
                  return (
                    <button key={o.id} onClick={() => toggleTarget(o.id)}
                      style={{ border: on ? "1.5px solid var(--primary)" : "1px solid var(--border)", background: on ? "var(--bg-hover)" : "var(--bg-card)", color: on ? "var(--primary)" : "var(--text-muted)", borderRadius: "var(--radius-md)", fontSize: 11.5, fontWeight: on ? 800 : 600, padding: "5px 13px", cursor: "pointer", fontFamily: "inherit" }}>
                      {on ? "✓ " : ""}{o.name}
                    </button>
                  );
                })}
              </div>
            )}
            {/* عند فشل حساب الجمهور لا يُعرض رقم إطلاقاً — «0» قد تكون نتيجة
                صحيحة، فعرضها هنا يوهم بأن الحساب تمّ. السطر يختفي من نفسه
                عند أول نجاح لاحق، بلا نافذة منبثقة ولا تكرار مع كل نقرة. */}
            {audienceError ? (
              <div style={{ fontSize: 11.5, color: "var(--danger)", fontWeight: 700, marginTop: 9, lineHeight: 1.8 }}>
                تعذر حساب عدد المستهدفين. يرجى المحاولة مرة أخرى.
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 9, lineHeight: 1.8 }}>
                سيصل التنبيه إلى <b style={{ color: "var(--text-main)" }}>{audienceCount}</b> من الحجاج،
                {enabledError ? (
                  <span style={{ color: "var(--danger)", fontWeight: 700 }}> وتعذر حساب عدد المفعّلين للإشعارات. يرجى المحاولة مرة أخرى.</span>
                ) : <>
                  {" "}منهم <b style={{ color: "var(--primary)" }}>{enabledCount}</b> مفعّلون للإشعارات على أجهزتهم.
                  {audienceCount > enabledCount && " والبقية سيرون التنبيه عند فتح البوابة."}
                </>}
              </div>
            )}
          </div>

          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="عنوان التنبيه (يظهر على شاشة جوال الحاج)"
            style={{ ...inp, width: "100%", boxSizing: "border-box", marginBottom: 8 }} />

          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="اكتب نص التنبيه الذي سيظهر للحجاج..." rows={3}
            style={{ ...inp, width: "100%", resize: "vertical", lineHeight: 1.9, boxSizing: "border-box" }} />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 12 }}>
            {/* الأولوية */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>الأولوية</div>
              <div style={{ display: "flex", gap: 6 }}>
                {PRIORITIES.map(p => (
                  <button key={p.key} onClick={() => setPriority(p.key)}
                    style={{ border: priority === p.key ? `2px solid ${p.color}` : "1px solid var(--border)", background: priority === p.key ? p.color : "var(--bg-card)", color: priority === p.key ? p.txt : "var(--text-main)", borderRadius: 99, fontSize: 11.5, fontWeight: 800, padding: "5px 15px", cursor: "pointer", fontFamily: "inherit" }}>
                    {p.key}
                  </button>
                ))}
              </div>
            </div>
            {/* وقت الظهور */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>وقت الظهور</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {[{ id: "now", l: "الآن" }, { id: "scheduled", l: "مجدول" }].map(o => (
                  <button key={o.id} onClick={() => setWhen(o.id as typeof when)}
                    style={{ border: when === o.id ? "2px solid var(--primary)" : "1px solid var(--border)", background: when === o.id ? "var(--primary)" : "var(--bg-card)", color: when === o.id ? "var(--text-inverse)" : "var(--text-main)", borderRadius: 99, fontSize: 11.5, fontWeight: 800, padding: "5px 15px", cursor: "pointer", fontFamily: "inherit" }}>
                    {o.l}
                  </button>
                ))}
                {when === "scheduled" && <input type="datetime-local" value={showAt} onChange={e => setShowAt(e.target.value)} style={{ ...inp, padding: "6px 10px", fontSize: 12 }} />}
              </div>
            </div>
            {/* الانتهاء */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>ينتهي بعد</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <select value={duration} onChange={e => setDuration(e.target.value)} style={{ ...inp, padding: "6px 10px", fontSize: 12 }}>
                  {DURATIONS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
                {duration === "custom" && <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={{ ...inp, padding: "6px 10px", fontSize: 12 }} />}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={send} disabled={sending} style={{ ...btnP(), opacity: sending ? .6 : 1, padding: "9px 26px" }}>
              {sending ? "جارٍ الإرسال..." : when === "now" ? "إرسال التنبيه" : "جدولة التنبيه"}
            </button>
          </div>
        </div>

        {/* القوائم */}
        {itemsLoading ? (
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "18px 2px" }}>جاري تحميل التنبيهات...</div>
        ) : itemsError && items.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--danger)", fontWeight: 700, padding: "18px 2px" }}>
            تعذر تحميل التنبيهات — يرجى التحقق من الاتصال وتحديث الصفحة
          </div>
        ) : <>
        {/* فشل تحديث عابر: آخر قائمة صحيحة تبقى معروضة، ويُنبَّه أنها قد لا تكون محدَّثة */}
        {itemsError && (
          <div style={{ fontSize: 11, color: "var(--danger)", fontWeight: 700, padding: "8px 2px 0" }}>
            تعذر تحديث القائمة — المعروض أدناه آخر بيانات وصلت
          </div>
        )}
        {secTitle("ظاهر الآن للحجاج", live.length, "var(--primary)")}
        {live.length === 0 && <div style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "4px 2px" }}>لا توجد تنبيهات ظاهرة حالياً.</div>}
        {live.map(a => annCard(a, "live"))}

        {secTitle("مجدول", scheduled.length, "var(--accent)")}
        {scheduled.length === 0 && <div style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "4px 2px" }}>لا توجد تنبيهات مجدولة.</div>}
        {scheduled.map(a => annCard(a, "scheduled"))}

        {ended.length > 0 && <>
          {secTitle("منتهي", ended.length)}
          {ended.slice(0, 10).map(a => annCard(a, "ended"))}
        </>}
        </>}
      </>}

      {tab === "settings" && (cfgLoading ? (
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", padding: "18px 2px" }}>جاري تحميل الإعدادات...</div>
      ) : cfgError ? (
        <div style={{ fontSize: 12, color: "var(--danger)", fontWeight: 700, padding: "18px 2px" }}>
          تعذر تحميل إعدادات البوابة — يرجى التحقق من الاتصال وتحديث الصفحة
        </div>
      ) : <>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 14, maxWidth: 640 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text-main)", marginBottom: 4 }}>إداري الحملة</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>يظهر اسمه وأرقامه لجميع الحجاج في البوابة وفي بطاقة الطوارئ</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>الاسم</div><input value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="أ. خالد العمري" style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>رقم الاتصال</div><input value={adminPhone} onChange={e => setAdminPhone(e.target.value)} placeholder="+974..." style={{ ...inp, width: "100%", boxSizing: "border-box", direction: "ltr", textAlign: "left" }} /></div>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>رقم الواتساب</div><input value={adminWa} onChange={e => setAdminWa(e.target.value)} placeholder="+974..." style={{ ...inp, width: "100%", boxSizing: "border-box", direction: "ltr", textAlign: "left" }} /></div>
          </div>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 14, maxWidth: 640 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text-main)", marginBottom: 4 }}>بيانات الحملة والأماكن</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>تظهر في البوابة وبطاقة الطوارئ، وتُستخدم في أي مطبوعات مستقبلية</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>الدولة</div><input value={country} onChange={e => setCountry(e.target.value)} placeholder="قطر" style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>المدينة</div><input value={city} onChange={e => setCity(e.target.value)} placeholder="الدوحة" style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>اسم الفندق</div><input value={hotelName} onChange={e => setHotelName(e.target.value)} placeholder="أبراج الصفوة" style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
            <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>عنوان الفندق</div><input value={hotelAddress} onChange={e => setHotelAddress(e.target.value)} placeholder="شارع أجياد، أمام الحرم المكي" style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
            <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>رابط الفندق على الخريطة</div><input value={hotelUrl} onChange={e => setHotelUrl(e.target.value)} placeholder="https://maps.google.com/..." style={{ ...inp, width: "100%", boxSizing: "border-box", direction: "ltr" }} /></div>
            <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>عنوان مخيم منى</div><input value={minaAddress} onChange={e => setMinaAddress(e.target.value)} placeholder="شارع الملك فهد، مخيمات مؤسسة حجاج الدول العربية" style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
            <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>رابط مخيم منى على الخريطة</div><input value={minaUrl} onChange={e => setMinaUrl(e.target.value)} placeholder="https://maps.google.com/..." style={{ ...inp, width: "100%", boxSizing: "border-box", direction: "ltr" }} /></div>
            <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>عنوان مخيم عرفات</div><input value={arafaAddress} onChange={e => setArafaAddress(e.target.value)} placeholder="طريق نمرة، القطعة رقم..." style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
            <div style={{ gridColumn: "1 / -1" }}><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>رابط مخيم عرفات على الخريطة</div><input value={arafaUrl} onChange={e => setArafaUrl(e.target.value)} placeholder="https://maps.google.com/..." style={{ ...inp, width: "100%", boxSizing: "border-box", direction: "ltr" }} /></div>
          </div>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: 16, marginBottom: 14, maxWidth: 640 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text-main)", marginBottom: 12 }}>ما يراه الحاج في البوابة</div>
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>رسالة الترحيب</div><textarea value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box", minHeight: 64 }} /></div>
            <div><div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", marginBottom: 5 }}>رسالة المساعدة</div><textarea value={helpMessage} onChange={e => setHelpMessage(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box", minHeight: 64 }} /></div>
          </div>
          {TOGGLES.map((t, i) => {
            const on = portalSettings[t.key] !== false;
            return (
              <div key={t.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 2px", borderBottom: i < TOGGLES.length - 1 ? "1px dashed var(--border)" : "none" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-main)" }}>{t.label}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>{t.desc}</div>
                </div>
                <div onClick={() => setPortalSettings(f => ({ ...f, [t.key]: !(f[t.key] !== false) }))}
                  style={{ width: 42, height: 23, borderRadius: 99, background: on ? "var(--primary)" : "var(--border)", position: "relative", cursor: "pointer", transition: "background .2s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: 2.5, insetInlineStart: on ? 21 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "inset-inline-start .2s", boxShadow: "0 1px 4px rgba(0,0,0,.2)" }} />
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={saveSettings} disabled={savingCfg || cfgId == null} style={{ ...btnP(), padding: "10px 30px", opacity: savingCfg ? .6 : 1 }}>
          {savingCfg ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
        </button>
      </>)}
    </div>
  );
}

export { PortalPage };
