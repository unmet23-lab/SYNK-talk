with objects(v) as (
  select format('table|%s|rls=%s', c.relname, c.relrowsecurity)
    from pg_class c
   where c.relnamespace='engine'::regnamespace and c.relkind in ('r','p')
  union all
  select format('column|%s|%s|%s|%s|%s',
                table_name, ordinal_position, column_name, udt_name,
                coalesce(column_default, '<null>'))
    from information_schema.columns
   where table_schema='engine'
  union all
  select format('constraint|%s|%s', c.conname, pg_get_constraintdef(c.oid, true))
    from pg_constraint c
   where c.connamespace='engine'::regnamespace
  union all
  select format('index|%s|%s', indexname, indexdef)
    from pg_indexes
   where schemaname='engine'
  union all
  select format('policy|%s|%s|%s|%s|%s|%s',
                tablename, policyname, cmd, roles::text,
                coalesce(qual, '<null>'), coalesce(with_check, '<null>'))
    from pg_policies
   where schemaname='engine'
  union all
  select format('trigger|%s|%s', g.tgname, pg_get_triggerdef(g.oid, true))
    from pg_trigger g
    join pg_class r on r.oid=g.tgrelid
   where r.relnamespace='engine'::regnamespace and not g.tgisinternal
  union all
  select format('function|%s|%s', p.proname, pg_get_functiondef(p.oid))
    from pg_proc p
   where p.pronamespace='engine'::regnamespace
  union all
  select format('enum|%s|%s|%s', t.typname, e.enumsortorder, e.enumlabel)
    from pg_enum e
    join pg_type t on t.oid=e.enumtypid
   where t.typnamespace='engine'::regnamespace
)
select md5(string_agg(v, E'\n' order by v)) from objects;
