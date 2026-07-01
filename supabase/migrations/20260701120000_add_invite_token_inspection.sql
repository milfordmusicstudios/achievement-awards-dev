create or replace function public.inspect_invite_token(p_token text)
returns table (
  valid boolean,
  status text,
  error text,
  studio_id uuid,
  studio_name text,
  studio_slug text,
  invited_email text,
  role_hint text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
begin
  if nullif(trim(coalesce(p_token, '')), '') is null then
    return query select
      false,
      'missing_token'::text,
      'Missing invite token'::text,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz;
    return;
  end if;

  select
    i.studio_id,
    s.name as studio_name,
    s.slug as studio_slug,
    i.invited_email,
    i.role_hint,
    i.expires_at,
    lower(coalesce(i.status, '')) as invite_status
  into v_invite
  from public.invites i
  left join public.studios s on s.id = i.studio_id
  where i.token = p_token
  limit 1;

  if not found then
    return query select
      false,
      'not_found'::text,
      'Invite token was not found'::text,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::text,
      null::timestamptz;
    return;
  end if;

  if v_invite.invite_status = 'revoked' then
    return query select false, 'revoked'::text, 'Invite has been revoked'::text,
      v_invite.studio_id, v_invite.studio_name, v_invite.studio_slug,
      v_invite.invited_email, v_invite.role_hint, v_invite.expires_at;
    return;
  end if;

  if v_invite.invite_status in ('used', 'accepted') then
    return query select false, 'used'::text, 'Invite has already been used'::text,
      v_invite.studio_id, v_invite.studio_name, v_invite.studio_slug,
      v_invite.invited_email, v_invite.role_hint, v_invite.expires_at;
    return;
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    return query select false, 'expired'::text, 'Invite has expired'::text,
      v_invite.studio_id, v_invite.studio_name, v_invite.studio_slug,
      v_invite.invited_email, v_invite.role_hint, v_invite.expires_at;
    return;
  end if;

  if v_invite.invite_status <> 'pending' then
    return query select false, v_invite.invite_status, 'Invite is not pending'::text,
      v_invite.studio_id, v_invite.studio_name, v_invite.studio_slug,
      v_invite.invited_email, v_invite.role_hint, v_invite.expires_at;
    return;
  end if;

  return query select true, 'pending'::text, null::text,
    v_invite.studio_id, v_invite.studio_name, v_invite.studio_slug,
    v_invite.invited_email, v_invite.role_hint, v_invite.expires_at;
end;
$$;

grant execute on function public.inspect_invite_token(text) to anon, authenticated;
