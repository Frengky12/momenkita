-- Undangan co-host (PRD §2.2): pemilik event membuat link sekali pakai, co-host menerimanya setelah login.
-- Seperti link staf, token mentah hanya ada di respons pembuatan; database menyimpan hash sha256-nya.
create table public.cohost_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  token_hash text not null unique,
  label text not null default '' check (length(label) <= 40),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index cohost_invites_event_idx on public.cohost_invites (event_id);
create index cohost_invites_created_by_idx on public.cohost_invites (created_by);
create index cohost_invites_accepted_by_idx on public.cohost_invites (accepted_by);

alter table public.cohost_invites enable row level security;
revoke all on public.cohost_invites from anon, authenticated;
grant select (id, event_id, label, created_by, created_at, expires_at, accepted_by, accepted_at, revoked_at)
  on public.cohost_invites to authenticated;
create policy cohost_invites_select on public.cohost_invites
  for select to authenticated
  using (public.is_event_manager(event_id) or (select public.is_admin()));

-- Co-host hanya bertambah lewat accept_cohost_invite. Sebelumnya setiap pengelola event bisa menambah profil apa pun.
-- Menghapus: pemilik event (mengeluarkan co-host) atau co-host itu sendiri (keluar dari event).
revoke insert on public.event_cohosts from authenticated;
drop policy event_cohosts_insert on public.event_cohosts;
drop policy event_cohosts_delete on public.event_cohosts;
create policy event_cohosts_delete on public.event_cohosts
  for delete to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (select 1 from public.events e where e.id = event_id and e.owner_id = (select auth.uid()))
  );

create function public.create_cohost_invite(p_event_id uuid, p_label text default '')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := public.random_token(32);
  v_invite public.cohost_invites%rowtype;
begin
  if not public.is_registered_user()
    or not exists (select 1 from public.events where id = p_event_id and owner_id = auth.uid()) then
    raise exception 'akses ditolak' using errcode = '42501';
  end if;
  if (select count(*) from public.cohost_invites
      where event_id = p_event_id and accepted_at is null and revoked_at is null and expires_at > now()) >= 5 then
    raise exception 'maksimal 5 undangan co-host yang masih aktif' using errcode = 'P0001';
  end if;

  insert into public.cohost_invites (event_id, token_hash, label, created_by)
  values (p_event_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), left(trim(coalesce(p_label, '')), 40), auth.uid())
  returning * into v_invite;
  return jsonb_build_object('id', v_invite.id, 'token', v_token, 'expires_at', v_invite.expires_at);
end;
$$;

create function public.revoke_cohost_invite(p_invite_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.cohost_invites i
  set revoked_at = now()
  where i.id = p_invite_id
    and i.accepted_at is null
    and i.revoked_at is null
    and exists (select 1 from public.events e where e.id = i.event_id and e.owner_id = auth.uid());
  if not found then
    raise exception 'undangan tidak ditemukan atau sudah tidak aktif' using errcode = 'P0002';
  end if;
end;
$$;

-- Dipanggil halaman terima undangan. Token yang tidak dikenal tidak membocorkan apa pun.
create function public.cohost_invite_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invite public.cohost_invites%rowtype;
  v_event public.events%rowtype;
  v_owner public.profiles%rowtype;
begin
  if not public.is_registered_user() then
    raise exception 'akses ditolak' using errcode = '42501';
  end if;
  select * into v_invite from public.cohost_invites
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_event from public.events where id = v_invite.event_id;
  select * into v_owner from public.profiles where id = v_event.owner_id;

  return jsonb_build_object(
    'status', case
      when v_event.owner_id = auth.uid() then 'owner'
      when exists (select 1 from public.event_cohosts where event_id = v_event.id and profile_id = auth.uid()) then 'member'
      when v_invite.revoked_at is not null then 'revoked'
      when v_invite.accepted_at is not null then 'used'
      when v_invite.expires_at <= now() then 'expired'
      else 'valid'
    end,
    'event_id', v_event.id,
    'event_title', v_event.title,
    'owner_name', v_owner.full_name,
    'owner_email', v_owner.email
  );
end;
$$;

-- Pemilik atau co-host yang membuka link lagi langsung diarahkan ke event tanpa memakai undangannya.
create function public.accept_cohost_invite(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invite public.cohost_invites%rowtype;
begin
  if not public.is_registered_user() then
    raise exception 'akses ditolak' using errcode = '42501';
  end if;
  select * into v_invite from public.cohost_invites
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;
  if not found then
    raise exception 'undangan tidak ditemukan' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.events where id = v_invite.event_id and owner_id = auth.uid())
    or exists (select 1 from public.event_cohosts where event_id = v_invite.event_id and profile_id = auth.uid()) then
    return v_invite.event_id;
  end if;
  if v_invite.revoked_at is not null or v_invite.accepted_at is not null or v_invite.expires_at <= now() then
    raise exception 'undangan sudah tidak berlaku' using errcode = 'P0001';
  end if;

  insert into public.event_cohosts (event_id, profile_id) values (v_invite.event_id, auth.uid());
  update public.cohost_invites set accepted_by = auth.uid(), accepted_at = now() where id = v_invite.id;
  return v_invite.event_id;
end;
$$;

revoke execute on function public.create_cohost_invite(uuid, text) from public, anon, authenticated;
revoke execute on function public.revoke_cohost_invite(uuid) from public, anon, authenticated;
revoke execute on function public.cohost_invite_preview(text) from public, anon, authenticated;
revoke execute on function public.accept_cohost_invite(text) from public, anon, authenticated;
grant execute on function public.create_cohost_invite(uuid, text) to authenticated;
grant execute on function public.revoke_cohost_invite(uuid) to authenticated;
grant execute on function public.cohost_invite_preview(text) to authenticated;
grant execute on function public.accept_cohost_invite(text) to authenticated;
