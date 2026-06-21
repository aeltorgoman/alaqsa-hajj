import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import type { Passenger } from "../types";
import { makeShort, scanDocument, uploadDoc, btnP, btnS, inp } from "../utils";

function ScanPage({ passengers, setPassengers, setPage }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void; setPage: (p: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [showFields, setShowFields] = useState(false);
  const [saved, setSaved] = useState(false);
  const [locked, setLocked] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [idCardPreview, setIdCardPreview] = useState<string | null>(null);
  const [idScanLoading, setIdScanLoading] = useState(false);
  const [idExpiry, setIdExpiry] = useState("");
  const [form, setForm] = useState({ name_en: "", name_ar: "", short_en: "", short_ar: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", gender: "", phone: "" });
  const [services, setServices] = useState({ bus: "عادي", flight: "عادي", hotel_type: "ثنائية", hotel_view: "غير مطلة", camp_mina: "عادي", camp_arafa: "عادي" });
  const [docs, setDocs] = useState<{ photo: File | null; contract: File | null }>({ photo: null, contract: null });

  const setField = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));
  const setService = (key: string, val: string) => setServices(prev => ({ ...prev, [key]: val }));

  const handleFile = (file: File) => {
    setPassportFile(file);
    setPreviewImg(URL.createObjectURL(file));
    setLoading(true); setProgress(0); setShowFields(false); setSaved(false);
    const msgs = ["جاري تحليل الجواز...", "استخراج البيانات...", "التحقق..."];
    let p = 0;
    const iv = setInterval(() => { p = Math.min(p + Math.random() * 20, 85); setProgress(p); setStatusMsg(msgs[Math.min(Math.floor(p / 30), 2)]); }, 400);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      try {
        const response = await fetch("https://zkucwcnclbfvukhdqhgc.supabase.co/functions/v1/Scan-passport", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mediaType: file.type, mode: "passport" })
        });
        const data = await response.json();
        clearInterval(iv); setProgress(100); setStatusMsg("تم الاستخراج بنجاح!");
        setTimeout(() => {
          setLoading(false);
          const text = data.content ? data.content.map((i: any) => i.text || "").join("") : JSON.stringify(data);
          let parsed: any = {};
          try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); } catch {}
          const name_en = parsed.name_en || "";
          const name_ar = parsed.name_ar || "";
          setForm(prev => ({
            ...prev,
            name_en: name_en || prev.name_en,
            name_ar: name_ar || prev.name_ar,
            short_en: makeShort(name_en || prev.name_en),
            short_ar: makeShort(name_ar || prev.name_ar),
            passport: parsed.passport || prev.passport,
            nat: parsed.nationality || prev.nat,
            dob: parsed.dob || prev.dob,
            expiry: parsed.expiry || prev.expiry,
            gender: parsed.gender || prev.gender
          }));
          setShowFields(true);
        }, 500);
      } catch (err) {
        clearInterval(iv);
        setLoading(false);
        setShowFields(true);
        setStatusMsg("❌ فشل في قراءة الجواز");
        alert("حدث خطأ أثناء تحليل الجواز، يرجى المحاولة مرة أخرى أو إدخال البيانات يدوياً.");
        console.error("Scan error:", err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleIdCard = async (file: File) => {
    setIdCardFile(file);
    setIdCardPreview(URL.createObjectURL(file));
    setIdScanLoading(true);
    try {
      const parsed = await scanDocument(file, "idcard");
      if (parsed.national_id) setForm(prev => ({ ...prev, national_id: parsed.national_id }));
      if (parsed.id_expiry) setIdExpiry(parsed.id_expiry);
    } catch (err) {
      alert("فشل في قراءة البطاقة الشخصية، يرجى إدخال البيانات يدوياً.");
      console.error("ID scan error:", err);
    }
    setIdScanLoading(false);
  };

  const handleSave = async () => {
    const dupPassport = form.passport && passengers.some(p => p.passport && p.passport === form.passport);
    const dupNational = form.national_id && passengers.some(p => p.national_id && p.national_id === form.national_id);
    if (dupPassport) { alert("⚠️ رقم الجواز ده مسجل بالفعل!"); return; }
    if (dupNational) { alert("⚠️ رقم البطاقة ده مسجل بالفعل!"); return; }
    setUploading(true);
    const short_en = makeShort(form.name_en);
    const short_ar = makeShort(form.name_ar);
    const { data, error } = await supabase.from("passengers").insert([{
      name_ar: form.name_ar, name_en: form.name_en,
      short_ar, short_en,
      passport: form.passport, national_id: form.national_id,
      nat: form.nat, dob: form.dob, expiry: form.expiry,
      gender: form.gender, phone: form.phone,
      id_expiry: idExpiry,
      bus: services.bus, flight: services.flight,
      hotel_type: services.hotel_type, hotel_view: services.hotel_view, camp_mina: services.camp_mina,
      camp_arafa: services.camp_arafa
    }]).select();
    if (error) {
      console.error("Save error:", error);
      alert(`❌ فشل في حفظ بيانات الحاج: ${error.message || "يرجى المحاولة مرة أخرى"}`);
      setUploading(false);
      return;
    }
    if (data && data[0]) {
      const pid = data[0].id;
      const urls: Record<string, string | null> = {};
      try {
        if (passportFile) urls.passport_url = await uploadDoc(passportFile, pid, "passport_doc");
        if (idCardFile) urls.national_id_url = await uploadDoc(idCardFile, pid, "idcard");
        if (docs.photo) urls.photo_url = await uploadDoc(docs.photo, pid, "photo");
        if (docs.contract) urls.contract_url = await uploadDoc(docs.contract, pid, "contract");
        if (Object.keys(urls).length > 0) await supabase.from("passengers").update(urls).eq("id", pid);
      } catch (uploadErr) {
        console.error("Upload error:", uploadErr);
        alert("⚠️ تم حفظ البيانات بنجاح لكن فشل رفع بعض الملفات.");
      }
      setPassengers([...passengers, { id: pid, ...form, short_ar, short_en, services, rel: "", linked: -1, id_expiry: idExpiry, ...urls } as Passenger]);
      setSaved(true); setLocked(true); setTimeout(() => setPage("dash"), 1500);
    }
    setUploading(false);
  };

  const reset = () => {
    setForm({ name_en: "", name_ar: "", short_en: "", short_ar: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", gender: "", phone: "" });
    setServices({ bus: "عادي", flight: "عادي", hotel_type: "ثنائية", hotel_view: "غير مطلة", camp_mina: "عادي", camp_arafa: "عادي" });
    setPreviewImg(null); setPassportFile(null); setShowFields(false); setSaved(false); setLocked(false);
    setIdCardFile(null); setIdCardPreview(null); setIdExpiry(""); setDocs({ photo: null, contract: null });
  };

  useEffect(() => {
    const pending = (window as any).__hajj_pending_scan_file__;
    if (pending) {
      (window as any).__hajj_pending_scan_file__ = null;
      handleFile(pending);
    }
  }, []);

  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%", position: "relative" }}>
      {saved && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "var(--em7)", color: "var(--g3)", padding: "12px 24px", borderRadius: 12, fontSize: 13, fontWeight: 500, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", gap: 8 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> تم حفظ الحاج بنجاح!</div>}
      <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>جواز السفر</div>
        {!previewImg ? (
          <div onClick={() => document.getElementById("pu")?.click()} style={{ border: "1.5px dashed #ddd", borderRadius: 10, padding: "24px", textAlign: "center", cursor: "pointer", background: "var(--bg-2)" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg></div>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3 }}>ارفع صورة جواز السفر</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>الذكاء الاصطناعي يستخرج البيانات تلقائياً</div>
            <input id="pu" type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <img src={previewImg} style={{ width: 140, height: 100, objectFit: "cover", borderRadius: 8, border: "0.5px solid #e5e5e5" }} />
            <div style={{ flex: 1 }}>
              {loading ? (<><div style={{ background: "var(--bg-2)", borderRadius: 99, height: 4, overflow: "hidden", marginBottom: 6 }}><div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg,var(--em7),var(--em6))", borderRadius: 99, transition: "width 0.3s" }} /></div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>{statusMsg}</div></>) : <div style={{ fontSize: 11, color: "var(--em7)", fontWeight: 500 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> {statusMsg}</div>}
              <button onClick={reset} style={{ marginTop: 8, ...btnS({ fontSize: 10, padding: "3px 10px" }) }}>تغيير</button>
            </div>
          </div>
        )}
      </div>

      {showFields && (<>
        <div style={{ display: "grid", gridTemplateColumns: previewImg ? "1fr 1fr" : "1fr", gap: 12, marginBottom: 12, alignItems: "start" }}>
          {/* البيانات */}
          <div style={{ border: "0.5px solid #5DCAA5", borderRadius: 12, padding: "12px 14px", background: "var(--bg-card)" }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>البيانات <span style={{ fontSize: 10, background: "var(--success-bg)", color: "var(--primary-dark)", padding: "1px 7px", borderRadius: 99 }}>مستخرجة</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {([["الاسم بالإنجليزي", "name_en", "1/-1"], ["الاسم بالعربي", "name_ar", "1/-1"], ["المختصر إنجليزي", "short_en", ""], ["المختصر عربي", "short_ar", ""], ["رقم الجواز", "passport", ""], ["الجنسية", "nat", ""], ["التليفون", "phone", ""], ["تاريخ الميلاد", "dob", ""], ["انتهاء الجواز", "expiry", ""]] as [string,string,string][]).map(([l, k, col]) => (
                <div key={k} style={{ gridColumn: col || "auto" }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>{l}</div>
                  <input disabled={locked} style={{ ...inp, borderColor: "var(--em7)", background: locked ? "var(--bg-2)" : "rgba(125,31,60,.05)", color: locked ? "var(--text-muted)" : "rgba(0,0,0,0.7)" }} value={(form as any)[k]} onChange={e => setField(k, e.target.value)} />
                </div>
              ))}
              <div><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>الجنس</div>
                <select disabled={locked} style={{ ...inp, borderColor: "var(--em7)", background: locked ? "var(--bg-2)" : "rgba(125,31,60,.05)" }} value={form.gender} onChange={e => setField("gender", e.target.value)}>
                  <option value="">—</option><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option>
                </select>
              </div>
            </div>
          </div>

          {/* صورة الجواز للمراجعة */}
          {previewImg && (
            <div style={{ border: "0.5px solid #5DCAA5", borderRadius: 12, overflow: "hidden", position: "sticky", top: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, padding: "8px 12px", background: "var(--success-bg)", color: "var(--primary-dark)" }}>
                📋 صورة الجواز — للمراجعة
              </div>
              <img src={previewImg} style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: 340 }} />
            </div>
          )}
        </div>

        <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>البطاقة الشخصية <span style={{ fontSize: 10, color: "var(--text-muted)" }}>(اختياري)</span></div>
          {!idCardPreview ? (
            <div onClick={() => !locked && document.getElementById("id-card-upload")?.click()} style={{ border: "1.5px dashed #ddd", borderRadius: 8, padding: "14px", textAlign: "center", cursor: locked ? "not-allowed" : "pointer", background: "var(--bg-2)", opacity: locked ? 0.6 : 1 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>ارفع البطاقة لاستخراج الرقم والصلاحية تلقائياً</div>
              <input id="id-card-upload" type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleIdCard(e.target.files[0])} />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
              <img src={idCardPreview} style={{ width: 100, height: 65, objectFit: "cover", borderRadius: 6, border: "0.5px solid #e5e5e5" }} />
              <div style={{ flex: 1 }}>
                {idScanLoading ? <div style={{ fontSize: 11, color: "var(--text-muted)" }}>جاري قراءة البطاقة...</div> : <div style={{ fontSize: 11, color: "var(--em7)", fontWeight: 500 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> تم استخراج البيانات</div>}
                <button onClick={() => { setIdCardFile(null); setIdCardPreview(null); setIdExpiry(""); setForm(prev => ({ ...prev, national_id: "" })); }} style={{ marginTop: 6, ...btnS({ fontSize: 10, padding: "2px 8px" }) }}>تغيير</button>
              </div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>رقم البطاقة</div>
              <input disabled={locked} style={{ ...inp }} value={form.national_id} onChange={e => setField("national_id", e.target.value)} placeholder="يتعبى تلقائياً من البطاقة" />
            </div>
            <div><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>انتهاء البطاقة</div>
              <input disabled={locked} style={{ ...inp }} value={idExpiry} onChange={e => setIdExpiry(e.target.value)} placeholder="DD/MM/YYYY" />
            </div>
          </div>
        </div>

        <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>الخدمات المطلوبة</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {([["الباص", "bus", ["عادي", "VIP"]], ["الطيران", "flight", ["عادي", "درجة أولى", "بدون"]], ["نوع الغرفة", "hotel_type", ["فردية", "ثنائية", "ثلاثية", "رباعية"]], ["إطلالة الغرفة", "hotel_view", ["مطلة", "غير مطلة"]], ["مخيم منى", "camp_mina", ["عادي", "خاص"]], ["مخيم عرفة", "camp_arafa", ["عادي", "خاص"]]] as [string,string,string[]][]).map(([l, k, opts]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{l}</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {opts.map(o => <div key={o} onClick={() => setService(k, o)} style={{ flex: 1, padding: "5px 4px", borderRadius: 8, border: `1.5px solid ${(services as any)[k] === o ? "var(--em7)" : "var(--border)"}`, background: (services as any)[k] === o ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", fontSize: 10, color: (services as any)[k] === o ? "var(--em7)" : "var(--text-muted)", textAlign: "center", fontWeight: (services as any)[k] === o ? 500 : 400 }}>{o}</div>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>مستندات إضافية <span style={{ fontSize: 10, color: "var(--text-muted)" }}>(اختياري)</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {([["صورة شخصية", "photo", "image/*"], ["عقد الانتفاق", "contract", "image/*,application/pdf"]] as [string, "photo"|"contract", string][]).map(([label, key, accept]) => (
              <div key={key}>
                <input id={`doc-${key}`} type="file" accept={accept} disabled={locked} style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) setDocs(prev => ({ ...prev, [key]: f })); }} />
                <div onClick={() => !locked && document.getElementById(`doc-${key}`)?.click()} style={{ border: `1.5px dashed ${docs[key] ? "var(--em7)" : "var(--border)"}`, borderRadius: 8, padding: "12px 6px", textAlign: "center", cursor: locked ? "not-allowed" : "pointer", background: docs[key] ? "rgba(125,31,60,.05)" : "var(--bg-2)", opacity: locked ? 0.6 : 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: docs[key] ? "var(--primary-dark)" : "var(--text-muted)" }}>{label}</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 3 }}>{docs[key] ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> تم الاختيار</> : "اضغط للرفع"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {locked ? (<>
            <button onClick={() => setLocked(false)} style={{ ...btnP({ background: "var(--male-bg)", color: "var(--info)" }), flex: 1 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> تعديل</button>
            <button onClick={reset} style={{ ...btnP(), flex: 1 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> حاج جديد</button>
          </>) : (<>
            <button onClick={handleSave} disabled={uploading} style={{ ...btnP(), flex: 1, opacity: uploading ? 0.6 : 1 }}>{uploading ? "جاري الحفظ..." : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> حفظ الحاج</>}</button>
            <button onClick={reset} style={btnS()}>مسح</button>
          </>)}
        </div>
      </>)}
    </div>
  );
}

export { ScanPage };
