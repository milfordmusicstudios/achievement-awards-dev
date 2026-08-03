-- Minimal secure family-link materialization for parent/student invite onboarding.
-- The RPC only materializes a relationship that is already proven by the student's
-- existing public.users.parent_uuid value. It does not invent or overwrite that parentage.

create or replace function public.link_parent_student(
  p_student_id uuid,
  p_studio_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid := auth.uid();
  v_student record;
  v_link_exists boolean := false;
begin
  if v_parent_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_student_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_student_id');
  end if;

  if p_studio_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_studio_id');
  end if;

  -- Parent must also be a studio member in the requested studio.
  -- This is an additional guardrail and is not the proof of the parent/student relationship.
  if not exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = p_studio_id
      and sm.user_id = v_parent_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'parent_not_in_studio');
  end if;

  select
    u.id,
    u.studio_id,
    u.active,
    coalesce(u.roles, '{}'::text[]) as roles,
    u.parent_uuid
  into v_student
  from public.users u
  where u.id = p_student_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'student_not_found');
  end if;

  if v_student.studio_id is distinct from p_studio_id then
    return jsonb_build_object('ok', false, 'error', 'student_studio_mismatch');
  end if;

  if coalesce(v_student.active, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'student_inactive');
  end if;

  if not ('student' = any (v_student.roles)) then
    return jsonb_build_object('ok', false, 'error', 'student_role_missing');
  end if;

  if v_student.parent_uuid is null then
    return jsonb_build_object('ok', false, 'error', 'student_parent_uuid_missing');
  end if;

  if v_student.parent_uuid is distinct from v_parent_id then
    return jsonb_build_object('ok', false, 'error', 'student_parent_uuid_mismatch');
  end if;

  select exists (
    select 1
    from public.parent_student_links psl
    where psl.studio_id = p_studio_id
      and psl.parent_id = v_parent_id
      and psl.student_id = p_student_id
  )
  into v_link_exists;

  insert into public.parent_student_links (
    studio_id,
    parent_id,
    student_id,
    created_by
  )
  values (
    p_studio_id,
    v_parent_id,
    p_student_id,
    v_parent_id
  )
  on conflict (studio_id, parent_id, student_id)
  do update set
    created_by = excluded.created_by
  where public.parent_student_links.created_by is null;

  return jsonb_build_object(
    'ok', true,
    'parent_id', v_parent_id,
    'student_id', p_student_id,
    'studio_id', p_studio_id,
    'created_by', v_parent_id,
    'already_exists', v_link_exists
  );
end;
$$;

revoke all on function public.link_parent_student(uuid, uuid) from public;
grant execute on function public.link_parent_student(uuid, uuid) to authenticated;

-- Ensure the relationship tuple is unique at the database level.
-- This preserves the idempotent ON CONFLICT behavior.
do $$
declare
  v_key_cols int2vector := (
    select array_to_string(
      array[
        (select attnum
         from pg_attribute
         where attrelid = 'public.parent_student_links'::regclass
           and attname = 'studio_id'),
        (select attnum
         from pg_attribute
         where attrelid = 'public.parent_student_links'::regclass
           and attname = 'parent_id'),
        (select attnum
         from pg_attribute
         where attrelid = 'public.parent_student_links'::regclass
           and attname = 'student_id')
      ],
      ' '
    )::int2vector
  );
begin
  if not exists (
    select 1
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'parent_student_links'
      and i.indisunique
      and i.indisvalid
      and i.indexprs is null
      and i.indpred is null
      and i.indkey = v_key_cols
  ) then
    create unique index parent_student_links_studio_parent_student_unique
      on public.parent_student_links (studio_id, parent_id, student_id);
  end if;
end $$;

-- Backfill only rows whose relationship is already proven by public.users.parent_uuid.
-- This does not assign relationships; it only materializes existing, already-authorized ones.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'parent_student_links'
      and column_name = 'created_by'
  ) then
    insert into public.parent_student_links (
      studio_id,
      parent_id,
      student_id,
      created_by
    )
    select
      u.studio_id,
      u.parent_uuid,
      u.id,
      u.parent_uuid
    from public.users u
    where u.active = true
      and u.parent_uuid is not null
      and 'student' = any (coalesce(u.roles, '{}'::text[]))
      and not exists (
        select 1
        from public.parent_student_links psl
        where psl.studio_id = u.studio_id
          and psl.parent_id = u.parent_uuid
          and psl.student_id = u.id
      )
    on conflict (studio_id, parent_id, student_id)
    do update set
      created_by = excluded.created_by
    where public.parent_student_links.created_by is null;
  end if;
end $$;

-- Verification queries to run manually after applying the migration:
-- 1. Valid parent/student link:
--    select public.link_parent_student('<<student_id>>', '<<studio_id>>');
-- 2. Duplicate retry:
--    select public.link_parent_student('<<student_id>>', '<<studio_id>>');
-- 3. Wrong studio:
--    select public.link_parent_student('<<student_id>>', '<<other_studio_id>>');
-- 4. Inactive student:
--    update public.users set active = false where id = '<<student_id>>';
-- 5. Unauthenticated caller:
--    -- should return not_authenticated when executed without auth.uid().
-- 6. Unauthorized parent:
--    -- student.parent_uuid is another parent_uuid; function should reject.
-- 7. Existing parent_uuid mismatch:
--    update public.users set parent_uuid = '<<other_parent_id>>' where id = '<<student_id>>';
