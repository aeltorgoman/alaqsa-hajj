-- ════════════════════════════════════════════════════════════
-- توليدُ ما لا يلتقطه `db dump --schema public`
-- ════════════════════════════════════════════════════════════
-- ⚠️ سكربتٌ **للقراءة فقط**: `select` فحسب. يقرأ الحالةَ الحيّة
-- ويُخرج نصَّ SQL يُعيد إنشاءها. ولا يُعاد بناءُ شيءٍ من الذاكرة.
--
-- يغطّي ثلاثةً يملكها التطبيقُ ويسقطها نطاقُ `public` وحده:
--   ١) حاويتَي التخزين  ٢) سياساتِ `storage.objects`
--   ٣) الصلاحياتِ الافتراضية التي يملكها `postgres` على `public`
--
-- وصلاحياتُ `supabase_admin` الافتراضية **مستبعَدةٌ** عمداً:
-- بنيةُ منصّةٍ لا يملكها هذا التطبيق (EXCLUSIONS.md).

\pset tuples_only on
\pset format unaligned

select '-- ═══ storage buckets (application-owned) ═══';

select format(
  'insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L, %s, %s) on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;',
  id, name, public,
  coalesce(file_size_limit::text, 'null'),
  case when allowed_mime_types is null then 'null'
       else quote_literal(allowed_mime_types::text) || '::text[]' end)
from storage.buckets order by id;

select '-- ═══ storage.objects policies (application security) ═══';

select format(
  'create policy %I on storage.objects for %s to %s%s%s;',
  policyname,
  cmd,
  array_to_string(roles, ', '),
  case when qual       is null then '' else ' using (' || qual || ')' end,
  case when with_check is null then '' else ' with check (' || with_check || ')' end)
from pg_policies where schemaname = 'storage' and tablename = 'objects'
order by policyname;

select '-- ═══ default privileges owned by postgres on public ═══';
select '-- ⚠️ includes MAINTAIN (m), which requires PostgreSQL 17.';

select format(
  'alter default privileges for role %I in schema %I grant %s on %s to %I;',
  pg_get_userbyid(d.defaclrole),
  n.nspname,
  x.privs,
  case d.defaclobjtype when 'r' then 'tables'
                       when 'f' then 'functions'
                       when 'S' then 'sequences'
                       when 'T' then 'types'
                       else d.defaclobjtype::text end,
  x.grantee_name)
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral (
  select coalesce(nullif(pg_get_userbyid(a.grantee), ''), 'public') as grantee_name,
         string_agg(a.privilege_type, ', ' order by a.privilege_type) as privs
    from aclexplode(d.defaclacl) a
   group by 1
) x
where pg_get_userbyid(d.defaclrole) = 'postgres'
  and n.nspname = 'public'
  and x.grantee_name in ('anon', 'authenticated', 'service_role')
order by 1;
