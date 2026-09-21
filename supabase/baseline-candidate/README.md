# مرشَّحُ خطّ الأساس V1 — حالةٌ: **لم يُبنَ بعد (محجوبٌ بيئياً)**

> ⚠️ **هذا المجلّد ليس مساراً فعّالاً للترحيل.** لا يقرؤه الـCLI،
> ولا يُطبَّق منه شيء. وحين يحين التحوّل (نقطة ٥) يُولَّد ملفُّ
> خطّ الأساس بطابعٍ زمنيٍّ **من الـCLI** ويوضع في
> `supabase/migrations/`. ولا يُخترَع ذلك الطابعُ هنا.

## ماذا في هذا المجلّد

| الملفّ | المحتوى |
|---|---|
| `fingerprint/01-live-fingerprint.md` | البصمةُ المرجعية للقاعدة الحيّة — أعدادٌ وصلاحياتٌ وسياساتٌ وتخزينٌ وامتدادات |
| `tools/fingerprint.sql` | مِسبارُ المقارنة — يُشغَّل على الطرفين فيُخرج نصّاً حتميّاً يقبل `diff` |
| `tools/fingerprint-storage.sql` | مِسبارُ التخزين، منفصلٌ لأن مخطَّط `storage` لا يوجد على بوستجرس عاديّ |
| `EXCLUSIONS.md` | ما لا يدخل خطَّ الأساس ولماذا |
| `CHECKPOINT-5-PLAN.md` | خطّةُ التحوّل — **اقتراحٌ لا تنفيذ** |

## لماذا لم يُبنَ المرشَّح — ثلاثةُ عوائق بيئيّة مُثبَتة

هذه العوائقُ **بيئيّةٌ لا معمارية**. لا شيء في معمارية هذا النظام
يمنع بناءَ خطّ الأساس؛ الصندوقُ الذي يعمل فيه العميلُ هو المانع.

### العائق ١ — لا وصولَ شبكيّاً إلى Supabase

كلُّ مضيفات المشروع محجوبةٌ على وكيل الصندوق:

```
https://db.zkucwcnclbfvukhdqhgc.supabase.co  -> CONNECT tunnel failed, 403
https://zkucwcnclbfvukhdqhgc.supabase.co     -> CONNECT tunnel failed, 403
https://aws-0-eu-central-1.pooler.supabase.com -> CONNECT tunnel failed, 403
```

فـ`supabase link` و`db pull` و`db dump` و`db diff --linked`
**متعذّرةٌ كلُّها**. ولا يبقى إلى القاعدة إلا قناةُ MCP للقراءة.

وعليه: **المقارنةُ من المستوى الأول (`db diff`) لم تُجرَ، ولا
يمكن إجراؤها هنا.** ولا يُدَّعى خلافُ ذلك.

### العائق ٢ — لا Docker

لا مقبسَ Docker في الصندوق، فـ`supabase db reset` — الآليةُ
القانونيّة لبناء بيئةٍ محلّيّة — لا تعمل.

### العائق ٣ — بوستجرس ١٦ محلّياً مقابل ١٧ حيّاً ⚠️ **الحاسم**

المتاحُ محلّياً **16.13**، والحيُّ **17.6**. ولا يمكن تركيب ١٧:
مستودعُ PGDG محجوبٌ هو الآخر (`403` من الوكيل على
`postgresql.org`).

وهذا ليس فارقَ إصدارٍ تجميليّاً. القاعدةُ الحيّة تمنح امتياز
**`MAINTAIN`**، وهو **مستحدَثٌ في بوستجرس ١٧**. والدليلُ تجريبيّ
لا استنتاجيّ — جُرِّب على العنقود المحلّي:

```
postgres=# grant maintain on table t to authenticated;
ERROR:  unrecognized privilege type "maintain"
```

وهو حاضرٌ في الصلاحيات الافتراضية الحيّة (`arwdDxtm` — الحرف `m`)
وفي منح `user_profiles` وكلِّ جداول `service_role`. فبناءُ خطّ
الأساس على ١٦ **لا يستطيع** إعادةَ إنتاج الحالة الحيّة، ولو بُني
لَكان «برهانُ التكافؤ» كاذباً بالضرورة.

## البيئةُ المطلوبة لإتمام نقطة ٤

1. وصولٌ شبكيٌّ إلى `*.supabase.co` (للـ`link` و`db dump` للقراءة).
2. Docker، لـ`supabase db reset`.
3. **بوستجرس ١٧** محلّياً — عبر `db.major_version = 17` المضبوط
   سلفاً في `supabase/config.toml`، وهو ما يوفّره `supabase start`.

والثلاثةُ يوفّرها جهازُ مطوّرٍ عاديّ أو عاملُ CI بامتياز Docker.

## الإجراءُ حين تتوفّر البيئة

```bash
# ١) التقاطُ المخطَّط — قراءةٌ فقط، بلا بيانات
npm run supabase -- link --project-ref <REF>      # السرُّ في البيئة لا في git
npm run supabase -- db dump --linked -f supabase/baseline-candidate/v1_baseline.sql
npm run supabase -- db dump --linked --role-only -f supabase/baseline-candidate/roles.sql

# ٢) البصمةُ المرجعية من الحيّ
psql "$REMOTE_RO_URL" -f supabase/baseline-candidate/tools/fingerprint.sql > /tmp/live.txt
psql "$REMOTE_RO_URL" -f supabase/baseline-candidate/tools/fingerprint-storage.sql >> /tmp/live.txt

# ٣) بناءٌ من الصفر — المرّةُ الأولى
npm run supabase -- start
psql "$LOCAL_URL" -f supabase/baseline-candidate/v1_baseline.sql
psql "$LOCAL_URL" -f supabase/seed.sql
psql "$LOCAL_URL" -f supabase/baseline-candidate/tools/fingerprint.sql > /tmp/fresh1.txt
psql "$LOCAL_URL" -f supabase/baseline-candidate/tools/fingerprint-storage.sql >> /tmp/fresh1.txt

# ٤) المقارنة — المستويان معاً
diff -u /tmp/live.txt /tmp/fresh1.txt          # المستوى ٢: الأمن
npm run supabase -- db diff --linked           # المستوى ١: الشكل

# ٥) الحتميّة — بناءٌ ثانٍ من الصفر
npm run supabase -- stop --no-backup && npm run supabase -- start
# أعِد ٣، ثم:
diff -u /tmp/fresh1.txt /tmp/fresh2.txt        # يجب أن يكون فارغاً
```

⚠️ و**مفتاحُ المشروع وكلمةُ القاعدة يبقيان في البيئة**: `link`
يكتب `supabase/.temp/` وهو متجاهَلٌ في git (تحقَّقنا منه في نقطة ٣
بـ`git check-ignore`). ولا يدخل سرٌّ هذا المستودع.

## ما أُنجز فعلاً هنا

رغم العوائق، التُقطت **البصمةُ المرجعيّةُ كاملةً** من الحيّ
بالقراءة فحسب، وهي المدخلُ الذي يقارَن به أيُّ خطِّ أساسٍ لاحق،
وبُني مِسبارُ المقارنة وجُرِّب على بوستجرس فعليّ.
