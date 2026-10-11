-- ═══════════════════════════════════════════════════════════════
-- MOD-001 — بصماتُ ما لا يحقّ للترحيلات أن تمسّه (قراءةٌ محضة)
-- ═══════════════════════════════════════════════════════════════
-- يُشغَّل قبل الدفع وبعده، والمخرجان يجب أن يتطابقا حرفاً بحرف.
-- أعمدةُ MOD-001 الجديدة مُستثناةٌ وحدها (`requested_hotel_id`, `hotel_id`).
-- لا يطبع بياناتٍ — بصماتٌ وأعدادٌ فقط.
--
--   psql "$URL" -X -At -v ON_ERROR_STOP=1 \
--        -c "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY" \
--        -f supabase/verification/mod001/release_fingerprint.sql > fp.txt

\set ON_ERROR_STOP on
\pset footer off

select 'passengers' , count(*), md5(coalesce(string_agg((to_jsonb(x) - 'requested_hotel_id')::text, '|' order by x.id), '')) from public.passengers x
union all
select 'rooms'      , count(*), md5(coalesce(string_agg((to_jsonb(x) - 'hotel_id')::text, '|' order by x.id), '')) from public.rooms x
union all
select 'payments'   , count(*), md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) from public.payments x
union all
select 'receipts'   , count(*), md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) from public.payment_receipts x
union all
select 'charges'    , count(*), md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) from public.custom_charges x
union all
select 'pricing'    , count(*), md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) from public.pricing_settings x
union all
select 'snapshots'  , count(*), md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.season_id, x.key), '')) from public.season_pricing_snapshot x
union all
select 'seasons'    , count(*), md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) from public.seasons x
union all
select 'groups'     , count(*), md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by x.id), '')) from public.financial_groups x
union all
select 'users'      , count(*), md5(coalesce(string_agg(x.id::text || ':' || x.permissions::text || ':' || x.is_active::text, '|' order by x.id), '')) from public.user_profiles x;
