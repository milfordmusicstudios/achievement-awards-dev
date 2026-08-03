create or replace function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_invite record;
  v_roles text[];
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'no_auth');
  end if;

  if nullif(trim(coalesce(p_token, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_token');
  end if;

  select
    i.token,
    i.studio_id,
    i.invited_email,
    lower(coalesce(i.role_hint, 'parent')) as role_hint,
    lower(coalesce(i.status, '')) as invite_status,
    i.expires_at
  into v_invite
  from public.invites i
  where i.token = p_token
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'invite_not_found');
  end if;

  if v_invite.invited_email is not null and lower(v_invite.invited_email) <> v_email then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  if not exists (select 1 from public.studios s where s.id = v_invite.studio_id) then
    return jsonb_build_object('ok', false, 'error', 'studio_not_found');
  end if;

  v_roles := array[
    case
      when v_invite.role_hint in ('admin', 'teacher', 'student', 'parent') then v_invite.role_hint
      when v_invite.role_hint in ('guardian', 'parent/guardian') then 'parent'
      else 'parent'
    end
  ]::text[];

  if v_invite.invite_status <> 'pending' then
    if exists (
      select 1
      from public.studio_members sm
      where sm.studio_id = v_invite.studio_id
        and sm.user_id = v_uid
    ) then
      return jsonb_build_object(
        'ok', true,
        'studio_id', v_invite.studio_id,
        'role_hint', v_invite.role_hint,
        'roles', v_roles,
        'already_member', true
      );
    end if;

    return jsonb_build_object('ok', false, 'error', 'invite_' || coalesce(v_invite.invite_status, 'not_pending'));
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'invite_expired');
  end if;

  update public.studio_members sm
     set roles = (
       select array(
         select distinct role
         from unnest(coalesce(sm.roles, array[]::text[]) || v_roles) as role
         where role is not null and role <> ''
         order by role
       )
     )
   where sm.studio_id = v_invite.studio_id
     and sm.user_id = v_uid;

  if not found then
    insert into public.studio_members (studio_id, user_id, roles)
    values (v_invite.studio_id, v_uid, v_roles);
  end if;

  update public.invites
     set status = 'used'
   where token = p_token
     and status = 'pending';

  return jsonb_build_object(
    'ok', true,
    'studio_id', v_invite.studio_id,
    'role_hint', v_invite.role_hint,
    'roles', v_roles
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'error', 'accept_invite_exception',
      'message', sqlerrm
    );
end;
$$;

grant execute on function public.accept_invite(text) to authenticated;
