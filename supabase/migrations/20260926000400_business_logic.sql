-- Trigger invarian, broadcast Realtime, dan RPC.
-- RPC staff_* dipakai konsol moderasi, layar panggung, dan scanner; pengelola event juga boleh memanggilnya.

create function public.random_token(p_length integer)
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', get_byte(b, i) % 36 + 1, 1), '' order by i)
  from extensions.gen_random_bytes(p_length) as b, generate_series(0, p_length - 1) as i;
$$;

-- Pembuat organisasi otomatis menjadi owner.
create function public.add_org_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.org_members (organization_id, profile_id, role)
    values (new.id, auth.uid(), 'owner');
  end if;
  return null;
end;
$$;

create trigger organizations_add_owner
  after insert on public.organizations
  for each row execute function public.add_org_owner();

-- Sufiks acak mencegah enumerasi link personal (PRD §5.1).
create function public.set_invitation_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
begin
  if coalesce(new.personal_slug, '') = '' then
    v_base := left(trim(both '-' from regexp_replace(lower(new.guest_name), '[^a-z0-9]+', '-', 'g')), 40);
    new.personal_slug := coalesce(nullif(trim(both '-' from v_base), ''), 'tamu') || '-' || public.random_token(6);
  end if;
  return new;
end;
$$;

create trigger invitations_set_slug
  before insert on public.invitations
  for each row execute function public.set_invitation_slug();

-- Status awal foto ditentukan mode moderasi event, bukan oleh pemanggil.
create function public.prepare_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_session public.guest_sessions%rowtype;
begin
  select * into v_event from public.events where id = new.event_id;
  if v_event.status is distinct from 'active' or coalesce(v_event.package, '') not in ('complete', 'luxury') then
    raise exception 'event tidak menerima foto' using errcode = 'P0001';
  end if;

  select * into v_session from public.guest_sessions where id = new.guest_session_id;
  if v_session.is_blocked then
    raise exception 'sesi tamu diblokir' using errcode = 'P0001';
  end if;

  new.uploader_name := v_session.display_name;
  new.is_pinned := false;
  new.moderated_by_profile_id := null;
  new.moderated_by_staff_link_id := null;
  new.moderated_at := null;
  if v_event.package <> 'luxury' then
    new.key_original := null;
  end if;

  case v_event.moderation_mode
    when 'curated' then
      new.status := 'pending';
      new.visible_after := null;
    when 'delayed' then
      new.status := 'approved';
      new.visible_after := now() + interval '15 seconds';
    else
      new.status := 'approved';
      new.visible_after := now();
  end case;

  -- Soft limit: foto di atas kuota tetap diterima dan tayang, tetapi terkunci di galeri/ZIP.
  new.over_quota := (
    select count(*) from public.photos
    where event_id = new.event_id and status in ('pending', 'approved')
  ) >= v_event.photo_quota;

  return new;
end;
$$;

create trigger photos_prepare
  before insert on public.photos
  for each row execute function public.prepare_photo();

-- Broadcast ke channel privat event:<id>. Kunci R2 tidak ikut; klien meminta signed URL ke server.
create function public.broadcast_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'status', new.status,
      'visible_after', new.visible_after,
      'is_pinned', new.is_pinned,
      'over_quota', new.over_quota,
      'uploader_name', new.uploader_name,
      'caption', new.caption,
      'width', new.width,
      'height', new.height,
      'created_at', new.created_at
    ),
    'photo',
    'event:' || new.event_id,
    true
  );
  return null;
end;
$$;

create trigger photos_broadcast_insert
  after insert on public.photos
  for each row execute function public.broadcast_photo();

create trigger photos_broadcast_update
  after update on public.photos
  for each row
  when (old.status is distinct from new.status or old.is_pinned is distinct from new.is_pinned)
  execute function public.broadcast_photo();

create function public.broadcast_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'guest_name', new.guest_name,
      'category', new.category,
      'table_number', new.table_number,
      'pax_allowed', new.pax_allowed,
      'rsvp_status', new.rsvp_status,
      'rsvp_pax', new.rsvp_pax,
      'checked_in_at', new.checked_in_at,
      'checked_in_pax', new.checked_in_pax
    ),
    'invitation',
    'event:' || new.event_id,
    true
  );
  return null;
end;
$$;

-- Impor massal tidak di-broadcast agar tidak membanjiri Realtime.
create trigger invitations_broadcast_insert
  after insert on public.invitations
  for each row
  when (new.source in ('walk_in', 'public_rsvp'))
  execute function public.broadcast_invitation();

create trigger invitations_broadcast_update
  after update on public.invitations
  for each row
  when (
    old.rsvp_status is distinct from new.rsvp_status
    or old.rsvp_pax is distinct from new.rsvp_pax
    or old.checked_in_at is distinct from new.checked_in_at
    or old.checked_in_pax is distinct from new.checked_in_pax
  )
  execute function public.broadcast_invitation();

create function public.broadcast_stage_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('stage_blackout', new.stage_blackout, 'moderation_mode', new.moderation_mode),
    'stage',
    'event:' || new.id,
    true
  );
  return null;
end;
$$;

create trigger events_broadcast_stage
  after update on public.events
  for each row
  when (
    old.stage_blackout is distinct from new.stage_blackout
    or old.moderation_mode is distinct from new.moderation_mode
  )
  execute function public.broadcast_stage_state();

create function public.create_staff_link(p_event_id uuid, p_role text, p_label text default '')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := public.random_token(32);
  v_pin text;
  v_timezone text;
  v_last_end timestamptz;
  v_expires_at timestamptz;
  v_id uuid;
begin
  if not public.is_event_manager(p_event_id) then
    raise exception 'akses ditolak' using errcode = '42501';
  end if;

  select e.timezone, max(s.ends_at)
  into v_timezone, v_last_end
  from public.events e
  left join public.event_sessions s on s.event_id = e.id
  where e.id = p_event_id and e.status = 'active' and e.package in ('complete', 'luxury')
  group by e.timezone;

  if v_last_end is null then
    raise exception 'event harus aktif (Complete/Luxury) dan punya sesi acara' using errcode = 'P0001';
  end if;

  -- Kedaluwarsa H+1 pukul 23.59.59 waktu lokal event (PRD §2.2).
  v_expires_at := (((v_last_end at time zone v_timezone)::date + 2)::timestamp at time zone v_timezone)
    - interval '1 second';

  select lpad(((get_byte(b, 0) * 65536 + get_byte(b, 1) * 256 + get_byte(b, 2)) % 1000000)::text, 6, '0')
  into v_pin
  from extensions.gen_random_bytes(3) as b;

  insert into public.staff_links (event_id, role, label, token_hash, pin_hash, expires_at)
  values (
    p_event_id,
    p_role,
    coalesce(p_label, ''),
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    extensions.crypt(v_pin, extensions.gen_salt('bf', 8)),
    v_expires_at
  )
  returning id into v_id;

  -- Token dan PIN mentah hanya dikembalikan sekali ini; database menyimpan hash-nya saja.
  return jsonb_build_object('id', v_id, 'token', v_token, 'pin', v_pin, 'expires_at', v_expires_at);
end;
$$;

-- Dipanggil perangkat staf setelah anonymous sign-in. Mengikat auth.uid() ke link staf.
create function public.claim_staff_link(p_token text, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link public.staff_links%rowtype;
begin
  if auth.uid() is null then
    raise exception 'perlu sign-in (anonim)' using errcode = '42501';
  end if;

  select * into v_link
  from public.staff_links
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or v_link.revoked_at is not null or v_link.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'link_invalid');
  end if;

  if v_link.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', v_link.locked_until);
  end if;

  -- Gagal dikembalikan sebagai hasil, bukan raise, supaya penghitung percobaan tidak ikut di-rollback.
  if v_link.pin_hash <> extensions.crypt(p_pin, v_link.pin_hash) then
    update public.staff_links
    set failed_pin_attempts = failed_pin_attempts + 1,
        locked_until = case when failed_pin_attempts + 1 >= 5 then now() + interval '15 minutes' end
    where id = v_link.id;
    return jsonb_build_object('ok', false, 'error', 'pin_invalid');
  end if;

  update public.staff_links
  set failed_pin_attempts = 0, locked_until = null
  where id = v_link.id;

  insert into public.staff_sessions (auth_user_id, staff_link_id)
  values (auth.uid(), v_link.id)
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'event_id', v_link.event_id, 'role', v_link.role, 'expires_at', v_link.expires_at);
end;
$$;

create function public.staff_event(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_event_access(p_event_id, array['moderator', 'receptionist', 'stage', 'photographer']);

  return (
    select jsonb_build_object(
      'id', e.id,
      'slug', e.slug,
      'title', e.title,
      'timezone', e.timezone,
      'package', e.package,
      'moderation_mode', e.moderation_mode,
      'stage_blackout', e.stage_blackout,
      'theme_config', e.theme_config,
      'is_manager', public.is_event_manager(e.id),
      'staff_roles', to_jsonb(public.staff_roles(e.id)),
      'sessions', coalesce((
        select jsonb_agg(
          jsonb_build_object('id', s.id, 'name', s.name, 'starts_at', s.starts_at, 'ends_at', s.ends_at)
          order by s.starts_at
        )
        from public.event_sessions s
        where s.event_id = e.id
      ), '[]'::jsonb)
    )
    from public.events e
    where e.id = p_event_id
  );
end;
$$;

-- Daftar tamu untuk cache offline scanner. Nomor HP sengaja tidak disertakan (minimisasi data).
create function public.staff_guest_list(p_event_id uuid)
returns table (
  id uuid,
  guest_name text,
  category text,
  table_number text,
  pax_allowed smallint,
  session_ids uuid[],
  rsvp_status text,
  rsvp_pax smallint,
  qr_token text,
  checked_in_at timestamptz,
  checked_in_pax smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_event_access(p_event_id, array['receptionist']);

  return query
    select i.id, i.guest_name, i.category, i.table_number, i.pax_allowed, i.session_ids,
           i.rsvp_status, i.rsvp_pax, i.qr_token, i.checked_in_at, i.checked_in_pax
    from public.invitations i
    where i.event_id = p_event_id
    order by i.guest_name;
end;
$$;

create function public.checkin_card(p_invitation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', i.id,
    'guest_name', i.guest_name,
    'category', i.category,
    'table_number', i.table_number,
    'pax_allowed', i.pax_allowed,
    'rsvp_status', i.rsvp_status,
    'rsvp_pax', i.rsvp_pax,
    'checked_in_at', i.checked_in_at,
    'checked_in_pax', i.checked_in_pax,
    'checked_in_by', l.label
  )
  from public.invitations i
  left join public.staff_links l on l.id = i.checked_in_by_staff_link_id
  where i.id = p_invitation_id;
$$;

-- Idempoten: check-in ulang (termasuk sinkronisasi antrean offline) mengembalikan already = true.
create function public.staff_check_in(
  p_event_id uuid,
  p_qr_token text default null,
  p_invitation_id uuid default null,
  p_pax integer default null,
  p_checked_in_at timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations%rowtype;
  v_staff_link_id uuid;
begin
  perform public.require_event_access(p_event_id, array['receptionist']);

  -- FOR UPDATE: dua perangkat yang memindai QR yang sama bersamaan hanya menghasilkan satu check-in.
  select * into v_invitation
  from public.invitations i
  where i.event_id = p_event_id
    and (i.qr_token = p_qr_token or i.id = p_invitation_id)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_invitation.checked_in_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'invitation', public.checkin_card(v_invitation.id));
  end if;

  v_staff_link_id := public.current_staff_link(p_event_id, 'receptionist');

  -- p_checked_in_at berasal dari antrean offline perangkat; dibatasi agar tidak di masa depan.
  update public.invitations
  set checked_in_at = least(coalesce(p_checked_in_at, now()), now()),
      checked_in_pax = coalesce(p_pax, nullif(v_invitation.rsvp_pax, 0), v_invitation.pax_allowed),
      checked_in_by_staff_link_id = v_staff_link_id,
      checked_in_by_profile_id = case when v_staff_link_id is null then auth.uid() end
  where id = v_invitation.id;

  return jsonb_build_object('ok', true, 'already', false, 'invitation', public.checkin_card(v_invitation.id));
end;
$$;

create function public.staff_add_walk_in(p_event_id uuid, p_guest_name text, p_pax integer default 1)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_staff_link_id uuid;
  v_id uuid;
begin
  perform public.require_event_access(p_event_id, array['receptionist']);
  v_staff_link_id := public.current_staff_link(p_event_id, 'receptionist');

  insert into public.invitations (
    event_id, guest_name, pax_allowed, source,
    checked_in_at, checked_in_pax, checked_in_by_staff_link_id, checked_in_by_profile_id
  )
  values (
    p_event_id, p_guest_name, greatest(p_pax, 1), 'walk_in',
    now(), p_pax, v_staff_link_id, case when v_staff_link_id is null then auth.uid() end
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'invitation', public.checkin_card(v_id));
end;
$$;

-- Pengelola dan moderator melihat semua foto; panggung dan fotografer hanya yang approved.
-- Fotografer tidak melihat foto di atas kuota karena foto itu terkunci sampai host membeli add-on.
create function public.staff_photos(p_event_id uuid, p_limit integer default 500)
returns table (
  id uuid,
  uploader_name text,
  caption text,
  key_display text,
  key_thumb text,
  width integer,
  height integer,
  status text,
  visible_after timestamptz,
  is_pinned boolean,
  over_quota boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_roles text[] := public.staff_roles(p_event_id);
  v_full_access boolean := public.is_event_manager(p_event_id) or 'moderator' = any (v_roles);
begin
  perform public.require_event_access(p_event_id, array['moderator', 'stage', 'photographer']);

  return query
    select p.id, p.uploader_name, p.caption, p.key_display, p.key_thumb, p.width, p.height,
           p.status, p.visible_after, p.is_pinned, p.over_quota, p.created_at
    from public.photos p
    where p.event_id = p_event_id
      and case
        when v_full_access then p.status <> 'deleted'
        when 'stage' = any (v_roles) then p.status = 'approved'
        else p.status = 'approved' and not p.over_quota
      end
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 1000);
end;
$$;

create function public.staff_moderate_photo(p_photo_id uuid, p_action text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_photo public.photos%rowtype;
  v_staff_link_id uuid;
begin
  if p_action not in ('approve', 'reject', 'pin', 'unpin') then
    raise exception 'aksi tidak dikenal: %', p_action using errcode = '22023';
  end if;

  select * into v_photo from public.photos where id = p_photo_id;
  if not found then
    raise exception 'akses ditolak' using errcode = '42501';
  end if;

  perform public.require_event_access(v_photo.event_id, array['moderator']);
  v_staff_link_id := public.current_staff_link(v_photo.event_id, 'moderator');

  -- Syarat di WHERE membuat aksi pertama yang menang; aksi kedua yang bentrok menjadi no_change.
  -- Reject tetap berlaku untuk foto approved, untuk menurunkannya dari layar.
  update public.photos p
  set status = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else p.status end,
      visible_after = case when p_action = 'approve' then now() else p.visible_after end,
      is_pinned = case p_action when 'pin' then true when 'unpin' then false when 'reject' then false else p.is_pinned end,
      moderated_at = now(),
      moderated_by_staff_link_id = v_staff_link_id,
      moderated_by_profile_id = case when v_staff_link_id is null then auth.uid() end
  where p.id = p_photo_id
    and case p_action
      when 'approve' then p.status = 'pending'
      when 'reject' then p.status in ('pending', 'approved')
      when 'pin' then p.status = 'approved' and not p.is_pinned
      else p.is_pinned
    end
  returning p.* into v_photo;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_change');
  end if;

  return jsonb_build_object('ok', true, 'status', v_photo.status, 'is_pinned', v_photo.is_pinned);
end;
$$;

create function public.staff_set_blackout(p_event_id uuid, p_on boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_event_access(p_event_id, array['moderator']);

  update public.events set stage_blackout = p_on where id = p_event_id;

  return jsonb_build_object('ok', true, 'stage_blackout', p_on);
end;
$$;

-- Membuka kunci foto over_quota tertua sampai kuota baru terisi.
create function public.unlock_photos_within_quota(p_event_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.photos
  set over_quota = false
  where id in (
    select id from public.photos
    where event_id = p_event_id and over_quota and status in ('pending', 'approved')
    order by created_at
    limit greatest(
      (select photo_quota from public.events where id = p_event_id)
      - (select count(*) from public.photos
         where event_id = p_event_id and not over_quota and status in ('pending', 'approved')),
      0
    )
  );
$$;

-- Dipanggil server setelah notifikasi Midtrans terverifikasi (signature_key + cek status ke API).
-- Midtrans bisa mengirim notifikasi berulang: order yang sudah paid dikembalikan tanpa efek ganda.
create function public.fulfill_order(p_order_id uuid, p_provider_ref text, p_gross_amount bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item public.catalog_items%rowtype;
  v_event public.events%rowtype;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order % tidak ditemukan', p_order_id using errcode = 'P0002';
  end if;

  if v_order.status = 'paid' then
    return jsonb_build_object('ok', true, 'already_paid', true);
  end if;
  if v_order.status <> 'pending' then
    raise exception 'order % berstatus %', p_order_id, v_order.status using errcode = 'P0001';
  end if;
  if p_gross_amount <> v_order.amount_idr then
    raise exception 'nominal % tidak cocok dengan order (%)', p_gross_amount, v_order.amount_idr using errcode = 'P0001';
  end if;

  select * into v_item from public.catalog_items where code = v_order.item_code;

  if v_item.item_type in ('token_pack', 'subscription') then
    raise exception 'item_type % belum didukung (Fase 2)', v_item.item_type using errcode = '0A000';
  end if;

  select * into v_event from public.events where id = v_order.event_id for update;
  if not found then
    raise exception 'order % tidak terhubung ke event', p_order_id using errcode = 'P0001';
  end if;

  case v_item.item_type
    when 'event_package' then
      if v_event.package is not null then
        raise exception 'event sudah punya paket %', v_event.package using errcode = 'P0001';
      end if;
      update public.events
      set package = v_item.package, photo_quota = v_item.photo_quota, status = 'active'
      where id = v_event.id;

    when 'upgrade' then
      if v_event.package is distinct from v_item.from_package then
        raise exception 'upgrade % butuh paket %, event berpaket %', v_item.code, v_item.from_package, v_event.package
          using errcode = 'P0001';
      end if;
      update public.events
      set package = v_item.package, photo_quota = greatest(photo_quota, v_item.photo_quota)
      where id = v_event.id;
      perform public.unlock_photos_within_quota(v_event.id);

    when 'addon' then
      if coalesce(v_event.package, '') not in ('complete', 'luxury') then
        raise exception 'add-on hanya untuk paket Complete/Luxury' using errcode = 'P0001';
      end if;
      -- Add-on masa simpan tidak mengubah event; job retensi menjumlahkannya dari orders berstatus paid.
      if v_item.photo_quota is not null then
        update public.events
        set photo_quota = photo_quota + v_item.photo_quota * v_order.quantity
        where id = v_event.id;
        perform public.unlock_photos_within_quota(v_event.id);
      end if;
  end case;

  update public.orders
  set status = 'paid', paid_at = now(), provider_ref = p_provider_ref
  where id = v_order.id;

  return jsonb_build_object('ok', true, 'already_paid', false);
end;
$$;

-- Hak eksekusi. Fungsi tanpa grant di bawah hanya dipanggil dari trigger atau fungsi security definer.
revoke execute on all functions in schema public from public, anon, authenticated;

-- Dipanggil oleh policy RLS, jadi role authenticated harus bisa mengeksekusinya.
grant execute on function
  public.is_admin(),
  public.is_registered_user(),
  public.is_org_member(uuid),
  public.is_org_owner(uuid),
  public.is_event_manager(uuid),
  public.staff_roles(uuid),
  public.can_view_profile(uuid),
  public.can_receive_event_channel(text)
to authenticated;

grant execute on function
  public.create_staff_link(uuid, text, text),
  public.claim_staff_link(text, text),
  public.staff_event(uuid),
  public.staff_guest_list(uuid),
  public.staff_check_in(uuid, text, uuid, integer, timestamptz),
  public.staff_add_walk_in(uuid, text, integer),
  public.staff_photos(uuid, integer),
  public.staff_moderate_photo(uuid, text),
  public.staff_set_blackout(uuid, boolean)
to authenticated;

grant execute on function public.fulfill_order(uuid, text, bigint) to service_role;
