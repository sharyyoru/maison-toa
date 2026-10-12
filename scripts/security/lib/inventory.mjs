/**
 * Read-only inventory queries. These reproduce the checks behind Supabase's
 * Security Advisor (the open-source `splinter` lints) so the findings are
 * diffable and reproducible outside the dashboard.
 *
 * Every query here is SELECT-only and is executed via the read-only endpoint.
 */

export const QUERIES = {
  /** Every public table and whether RLS is enabled/forced. */
  tables: `
    select c.relname                                as table_name,
           c.relkind                                as kind,
           c.relrowsecurity                         as rls_enabled,
           c.relforcerowsecurity                    as rls_forced,
           pg_catalog.pg_get_userbyid(c.relowner)   as owner,
           coalesce(s.n_live_tup, 0)                as approx_rows
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      left join pg_catalog.pg_stat_user_tables s on s.relid = c.oid
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
     order by c.relrowsecurity asc, c.relname asc;`,

  /**
   * Views and their reloptions. A view is effectively SECURITY DEFINER (the
   * advisor's `security_definer_view` lint) when security_invoker is not set
   * to true, because it then runs with the view owner's privileges.
   */
  views: `
    select c.relname                              as view_name,
           pg_catalog.pg_get_userbyid(c.relowner) as owner,
           coalesce(c.reloptions, '{}')           as reloptions
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('v', 'm')
     order by c.relname;`,

  /** Existing RLS policies, so Phase 2 can be written against reality. */
  policies: `
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_catalog.pg_policies
     where schemaname = 'public'
     order by tablename, policyname;`,

  /**
   * What anon / authenticated can actually do, independent of RLS.
   *
   * Read from pg_class.relacl via aclexplode, NOT from
   * information_schema.role_table_grants: the information_schema views only
   * show grants visible to the *current* role, and these queries run as
   * supabase_read_only_user, which is a member of none of them. That view
   * silently returns zero rows and makes a fully-open database look locked
   * down. grantee = 0 means PUBLIC, for which pg_get_userbyid() would error.
   */
  grants: `
    select c.relname as table_name,
           case when a.grantee = 0 then 'PUBLIC'
                else pg_catalog.pg_get_userbyid(a.grantee) end as grantee,
           string_agg(distinct a.privilege_type, ',' order by a.privilege_type) as privileges
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(
        coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm')
       and (a.grantee = 0 or pg_catalog.pg_get_userbyid(a.grantee) in ('anon', 'authenticated'))
     group by 1, 2
     order by 1, 2;`,

  /** Storage buckets; `public = true` means unauthenticated object reads. */
  buckets: `
    select id, name, public, file_size_limit, allowed_mime_types, created_at
      from storage.buckets
     order by public desc, id;`,

  /** Policies on storage.objects (patient-document scoping lives here). */
  storagePolicies: `
    select policyname, roles, cmd, qual, with_check
      from pg_catalog.pg_policies
     where schemaname = 'storage' and tablename = 'objects'
     order by policyname;`,

  /**
   * Functions: prosecdef = SECURITY DEFINER, and proconfig tells us whether
   * search_path is pinned (the `function_search_path_mutable` warning).
   */
  functions: `
    select n.nspname                               as schema_name,
           p.proname                               as function_name,
           pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
           p.prosecdef                             as security_definer,
           coalesce(p.proconfig, '{}')             as config,
           pg_catalog.pg_get_userbyid(p.proowner)  as owner
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'extensions')
     order by p.prosecdef desc, n.nspname, p.proname;`,

  /** Extensions installed into public (the `extension_in_public` warning). */
  extensions: `
    select e.extname, n.nspname as schema_name, e.extversion
      from pg_catalog.pg_extension e
      join pg_catalog.pg_namespace n on n.oid = e.extnamespace
     order by n.nspname, e.extname;`,

  /** Leftover migration scratch tables. */
  tmpTables: `
    select c.relname                 as table_name,
           coalesce(s.n_live_tup, 0) as approx_rows,
           c.relrowsecurity          as rls_enabled
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      left join pg_catalog.pg_stat_user_tables s on s.relid = c.oid
     where n.nspname = 'public'
       and c.relkind = 'r'
       and (c.relname like 'tmp%' or c.relname like 'temp%' or c.relname like '%_tmp'
            or c.relname like '%_backup' or c.relname like '%_old' or c.relname like 'bak_%'
            or c.relname like '%_copy' or c.relname like '%_stage' or c.relname like '%_staging')
     order by c.relname;`,

  /** Columns of scratch tables, to judge which data categories are exposed. */
  tmpColumns: `
    select table_name, ordinal_position, column_name, data_type
      from information_schema.columns
     where table_schema = 'public'
       and table_name in (
         select c.relname from pg_catalog.pg_class c
           join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r'
            and (c.relname like 'tmp%' or c.relname like 'temp%' or c.relname like '%_tmp'
                 or c.relname like '%_backup' or c.relname like '%_old' or c.relname like 'bak_%'
                 or c.relname like '%_copy' or c.relname like '%_stage' or c.relname like '%_staging')
       )
     order by table_name, ordinal_position;`,

  /** Candidate tenant-scoping columns, to infer the multi-clinic model. */
  tenantColumns: `
    select table_name, column_name, data_type
      from information_schema.columns
     where table_schema = 'public'
       and column_name in ('clinic_id', 'organization_id', 'org_id', 'tenant_id',
                           'provider_id', 'owner_id', 'user_id', 'created_by', 'demo')
     order by column_name, table_name;`,

  /** Applied migration versions, for the exposure-window timeline. */
  migrations: `
    select version, name
      from supabase_migrations.schema_migrations
     order by version;`,
};

/** A view is "security definer" unless security_invoker=true is set. */
export function viewIsSecurityDefiner(view) {
  const opts = view.reloptions ?? [];
  const list = Array.isArray(opts) ? opts : String(opts).replace(/^\{|\}$/g, '').split(',');
  return !list.some((o) => /^\s*security_invoker\s*=\s*(true|on)\s*$/i.test(String(o)));
}

/** A function's search_path is mutable unless proconfig pins it. */
export function functionSearchPathMutable(fn) {
  const cfg = fn.config ?? [];
  const list = Array.isArray(cfg) ? cfg : String(cfg).replace(/^\{|\}$/g, '').split(',');
  return !list.some((c) => /^\s*search_path\s*=/i.test(String(c)));
}

/** Columns whose names suggest special-category (health/ID) personal data. */
const SENSITIVE = /ssn|avs|ahv|social|insur|diagnos|icd|note|medical|health|birth|dob|iban|phone|email|address|passport|patient/i;

export function sensitiveColumns(columns) {
  return columns.filter((c) => SENSITIVE.test(c.column_name)).map((c) => c.column_name);
}
