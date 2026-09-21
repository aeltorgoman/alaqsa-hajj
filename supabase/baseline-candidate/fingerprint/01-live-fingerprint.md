# البصمة المرجعية للقاعدة الحيّة — ٢١ سبتمبر ٢٠٢٦

الالتقاط **للقراءة فقط** عبر استعلامات `pg_catalog` على مشروع
الاختبار/العرض `zkucwcnclbfvukhdqhgc`. لا كتابةَ ولا DDL ولا DML.

إصدار الخادم: **PostgreSQL 17.6** (`postgres_engine = 17`).

## ١) الأعداد — أُعيد قياسُها ولم تُؤخَذ عن الذاكرة

| الكائن | العدد | مطابقٌ للرقم السابق؟ |
|---|---|---|
| جداول `public` | **22** | ✅ |
| عروض `public` | **1** | ✅ |
| عروض مُجسَّدة | 0 | — |
| متتاليات | **15** | (جديد — لم يكن مذكوراً) |
| دوالّ `public` | **42** | ✅ (بعد نقطة ٢) |
| محفّزات المستخدم | **29** | ✅ |
| فهارس | **54** | ✅ |
| سياسات `public` | **59** | ✅ |
| أعمدة | **227** | ✅ |
| قيود | **66** | ✅ |
| جداول بـRLS مفعّلة | **22 من 22** | (جديد) |
| حاويات تخزين | **2** | ✅ |
| سياسات تخزين | **8** | ✅ |
| امتدادات | **5** | (جديد) |

مجموعُ أعمدة الجداول الاثنين والعشرين = 220، ومع أعمدة العرض
السبعة = **227** — فالعددُ متّسقٌ داخلياً لا منقولاً.

## ٢) الدوالّ — الوضعُ الأمنيّ كاملاً

**٤٢ دالّة. ولا واحدةَ منها تمنح `EXECUTE` لـ`PUBLIC`** — فُحص
بدلالات الـACL (`aclexplode`, grantee = 0) لا بمطابقة نصّه.
**وكلُّها بمسار بحثٍ مثبَّت**: ٤١ على `public, pg_temp`، وواحدة —
`room_type_capacity` — على `""` (نتيجةُ نقطة ٢).

| الوضع | العدد |
|---|---|
| `SECURITY DEFINER` | 35 |
| `SECURITY INVOKER` | 7 |
| بلا مسار بحثٍ مثبَّت | **0** |
| بـ`PUBLIC EXECUTE` | **0** |

الدوالّ الستُّ التي يبلغها `anon`: `create_pilgrim_session` ·
`get_pilgrim_portal_by_session` · `get_portal_announcements` ·
`mark_pilgrim_notification_read` · `register_pilgrim_push` ·
`revoke_pilgrim_session` · `unregister_pilgrim_push` — سبعٌ، وكلُّها
مسجّلةٌ في جرد الوصول المجهول بـ`supabase/README.md`.

⚠️ **ملاحظةُ مراجعة:** دالّتا محفّزٍ منتفختان بلا تناسب —
`reject_invalid_flight_booking` (60,695 بايت) و
`flights_guard_occupants` (20,608 بايت) — أي **62٪** من حجم تعريفات
الدوالّ كلِّها (129,896 بايت). يُرجَّح أنها كتلُ تعليقٍ ضخمة. لا
يمسّها هذا العمل، وتُذكر لمراجعةٍ لاحقة.

## ٣) RLS والسياسات

**RLS مفعّلةٌ على الجداول الاثنين والعشرين كلِّها**، ولا جدولَ
بـ`FORCE ROW LEVEL SECURITY`. و٥٩ سياسةً كلُّها `PERMISSIVE`.

أربعةُ جداول بـ**صفر سياسات** وRLS مفعّلة — أي مغلقةٌ تماماً أمام
أدوار التطبيق، ويبلغها `service_role` وحده:
`audit_suppression` · `edge_rate_limits` ·
`pilgrim_push_subscriptions` · `pilgrim_sessions`.
وهذا **مقصودٌ ومطابقٌ للمعمارية** (الثابت أ١٢)، وهو ما يرفعه
المدقّقُ تنبيهاً إخبارياً `rls_enabled_no_policy`.

سياسةٌ واحدةٌ لدور `anon`: `company_assets_public_read`.

## ٤) الصلاحيات الافتراضية — الفخّ الموثَّق

```
role=postgres schema=public objtype=r acl={postgres=arwdDxtm/postgres,
                                           authenticated=arwdDxtm/postgres,
                                           service_role=arwdDxtm/postgres}
role=postgres schema=public objtype=f acl={... authenticated=X ... service_role=X ...}
role=postgres schema=public objtype=S acl={... authenticated=rwU ... service_role=rwU ...}
```

⚠️ هذه هي `ALTER DEFAULT PRIVILEGES` التي تمنح كلَّ علاقةٍ جديدة
في `public` صلاحياتها تلقائياً. **يجب أن يعيد خطُّ الأساس إنتاجها**،
وإلا اختلفت بيئةٌ جديدةٌ عن الإنتاج في أخطر موضع.

⚠️ و`m` في `arwdDxtm` هي **MAINTAIN** — امتيازٌ استُحدث في
**PostgreSQL 17**. وهو ما يجعل إعادةَ الإنتاج على 16 مستحيلةً
حرفيّاً (انظر `README.md` · العوائق).

وصلاحياتٌ افتراضيةٌ أخرى يملكها `supabase_admin` على `auth` و
`graphql` و`realtime` و`extensions` و`public` — **منصّيّةٌ لا
يملكها هذا التطبيق**، ولا تدخل خطَّ الأساس.

## ٥) التخزين

| الحاوية | عامّة | الحدّ | الأنواع |
|---|---|---|---|
| `company-assets` | **true** | 5 MiB | jpeg, png, webp, svg+xml, x-icon |
| `passengers-docs` | **false** | 5 MiB | jpeg, png, webp, pdf |

ثماني سياساتٍ على `storage.objects`: واحدةٌ لـ`public`
(«Anyone reads company assets») وسبعٌ لـ`authenticated`.

## ٦) الامتدادات

| الامتداد | المخطَّط | الإصدار |
|---|---|---|
| `pgcrypto` | `extensions` | 1.3 |
| `uuid-ossp` | `extensions` | 1.1 |
| `pg_stat_statements` | `extensions` | 1.11 |
| `plpgsql` | `pg_catalog` | 1.0 |
| `supabase_vault` | `vault` | 0.3.1 |

الأولان يملكهما التطبيق (`pgcrypto` شرطٌ لدوالّ الهوية). والثلاثةُ
الأخيرة منصّيّةٌ أو مدمجة.
