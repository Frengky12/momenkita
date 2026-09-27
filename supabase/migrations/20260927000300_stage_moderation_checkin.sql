-- Minggu 5: RPC tambahan untuk konsol moderasi, layar panggung, dan scanner check-in.

-- staff_photos: filter p_ids (mengambil foto yang baru di-broadcast) dan guest_session_id (statistik pengunggah).
drop function public.staff_photos(uuid, integer);

create function public.staff_photos(p_event_id uuid, p_limit integer default 500, p_ids uuid[] default null)
returns table (
  id uuid,
  guest_session_id uuid,
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
    select p.id, p.guest_session_id, p.uploader_name, p.caption, p.key_display, p.key_thumb, p.width, p.height,
           p.status, p.visible_after, p.is_pinned, p.over_quota, p.created_at
    from public.photos p
    where p.event_id = p_event_id
      and (p_ids is null or p.id = any (p_ids))
      and case
        when v_full_access then p.status <> 'deleted'
        when 'stage' = any (v_roles) then p.status = 'approved'
        else p.status = 'approved' and not p.over_quota
      end
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 1000);
end;
$$;

-- "Setujui semua": hanya foto yang sedang dilihat moderator, bukan foto yang masuk sesudahnya.
create function public.staff_approve_photos(p_event_id uuid, p_photo_ids uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_staff_link_id uuid;
  v_count integer;
begin
  perform public.require_event_access(p_event_id, array['moderator']);
  if cardinality(p_photo_ids) > 500 then
    raise exception 'maksimal 500 foto sekali setujui' using errcode = '22023';
  end if;
  v_staff_link_id := public.current_staff_link(p_event_id, 'moderator');

  update public.photos p
  set status = 'approved',
      visible_after = now(),
      moderated_at = now(),
      moderated_by_staff_link_id = v_staff_link_id,
      moderated_by_profile_id = case when v_staff_link_id is null then auth.uid() end
  where p.event_id = p_event_id and p.id = any (p_photo_ids) and p.status = 'pending';
  get diagnostics v_count = row_count;

  return jsonb_build_object('ok', true, 'approved', v_count);
end;
$$;

-- Kartu ucapan yang ditayangkan bergantian dengan foto di layar panggung.
create function public.staff_wishes(p_event_id uuid, p_limit integer default 100)
returns table (id uuid, author_name text, message text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_event_access(p_event_id, array['moderator', 'stage']);

  return query
    select w.id, w.author_name, w.message, w.created_at
    from public.wishes w
    where w.event_id = p_event_id and not w.is_hidden
    order by w.created_at desc
    limit least(greatest(p_limit, 1), 300);
end;
$$;

-- staff_guest_list: label meja yang melakukan check-in, untuk peringatan scan ganda saat offline.
drop function public.staff_guest_list(uuid);

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
  checked_in_pax smallint,
  checked_in_by text
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
           i.rsvp_status, i.rsvp_pax, i.qr_token, i.checked_in_at, i.checked_in_pax, l.label
    from public.invitations i
    left join public.staff_links l on l.id = i.checked_in_by_staff_link_id
    where i.event_id = p_event_id
    order by i.guest_name;
end;
$$;

-- staff_add_walk_in: p_id dibuat perangkat agar sinkronisasi antrean offline tidak menambah tamu ganda.
drop function public.staff_add_walk_in(uuid, text, integer);

create function public.staff_add_walk_in(p_event_id uuid, p_guest_name text, p_pax integer default 1, p_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_staff_link_id uuid;
  v_id uuid;
  v_existing_event uuid;
begin
  perform public.require_event_access(p_event_id, array['receptionist']);
  v_staff_link_id := public.current_staff_link(p_event_id, 'receptionist');

  insert into public.invitations (
    id, event_id, guest_name, pax_allowed, source,
    checked_in_at, checked_in_pax, checked_in_by_staff_link_id, checked_in_by_profile_id
  )
  values (
    coalesce(p_id, gen_random_uuid()), p_event_id, p_guest_name, greatest(p_pax, 1), 'walk_in',
    now(), p_pax, v_staff_link_id, case when v_staff_link_id is null then auth.uid() end
  )
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is null then
    -- id sudah ada: kiriman ulang dari antrean. Tamu event lain tidak boleh ikut terbaca.
    select event_id into v_existing_event from public.invitations where id = p_id;
    if v_existing_event is distinct from p_event_id then
      raise exception 'akses ditolak' using errcode = '42501';
    end if;
    return jsonb_build_object('ok', true, 'already', true, 'invitation', public.checkin_card(p_id));
  end if;

  return jsonb_build_object('ok', true, 'already', false, 'invitation', public.checkin_card(v_id));
end;
$$;

revoke execute on function
  public.staff_photos(uuid, integer, uuid[]),
  public.staff_approve_photos(uuid, uuid[]),
  public.staff_wishes(uuid, integer),
  public.staff_guest_list(uuid),
  public.staff_add_walk_in(uuid, text, integer, uuid)
from public, anon;

grant execute on function
  public.staff_photos(uuid, integer, uuid[]),
  public.staff_approve_photos(uuid, uuid[]),
  public.staff_wishes(uuid, integer),
  public.staff_guest_list(uuid),
  public.staff_add_walk_in(uuid, text, integer, uuid)
to authenticated;
