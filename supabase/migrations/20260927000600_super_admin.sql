-- Minggu 7: Super Admin minimal (PRD §5.7).
-- Semua tindakan admin lewat RPC security definer yang memeriksa is_admin() dan mencatat alasan di admin_actions.

-- Jejak audit tindakan admin: siapa, apa, kapan, dan alasannya.
create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in (
    'activate_event', 'record_refund', 'reconcile_order', 'takedown_photo', 'adjust_credit', 'upsert_domain', 'set_domain_status'
  )),
  event_id uuid references public.events (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  photo_id uuid references public.photos (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  reason text not null check (length(trim(reason)) >= 5),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_actions_created_idx on public.admin_actions (created_at desc);
create index admin_actions_actor_idx on public.admin_actions (actor_id);
create index admin_actions_event_idx on public.admin_actions (event_id);
create index admin_actions_order_idx on public.admin_actions (order_id);
create index admin_actions_photo_idx on public.admin_actions (photo_id);
create index admin_actions_organization_idx on public.admin_actions (organization_id);

alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;
grant select on public.admin_actions to authenticated;
create policy admin_actions_select on public.admin_actions
  for select to authenticated
  using ((select public.is_admin()));

-- Kegagalan upload yang ditolak server (bukan jeda 3 detik), untuk angka "error rate upload" di monitor hari-H.
create table public.upload_errors (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events (id) on delete cascade,
  stage text not null check (stage in ('presign', 'confirm')),
  code text not null,
  created_at timestamptz not null default now()
);
create index upload_errors_event_idx on public.upload_errors (event_id, created_at);
alter table public.upload_errors enable row level security;
revoke all on public.upload_errors from anon, authenticated;

-- Detak layar panggung: dikirim tiap menit selama halaman panggung terbuka.
create table public.stage_heartbeats (
  event_id uuid not null references public.events (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  realtime_live boolean not null,
  cached_photos integer not null default 0 check (cached_photos >= 0),
  primary key (event_id, auth_user_id)
);
create index stage_heartbeats_user_idx on public.stage_heartbeats (auth_user_id);
alter table public.stage_heartbeats enable row level security;
revoke all on public.stage_heartbeats from anon, authenticated;

create function public.staff_stage_heartbeat(p_event_id uuid, p_realtime_live boolean, p_cached_photos integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_event_access(p_event_id, array['stage']);
  insert into public.stage_heartbeats (event_id, auth_user_id, last_seen_at, realtime_live, cached_photos)
  values (p_event_id, auth.uid(), now(), p_realtime_live, greatest(coalesce(p_cached_photos, 0), 0))
  on conflict (event_id, auth_user_id)
  do update set last_seen_at = now(), realtime_live = excluded.realtime_live, cached_photos = excluded.cached_photos;
end;
$$;

create function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'akses ditolak' using errcode = '42501';
  end if;
end;
$$;

create function public.log_admin_action(
  p_action text,
  p_reason text,
  p_event_id uuid default null,
  p_order_id uuid default null,
  p_photo_id uuid default null,
  p_organization_id uuid default null,
  p_details jsonb default '{}',
  p_actor_id uuid default null
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  -- p_actor_id hanya dipakai server (service role); RPC admin memakai auth.uid().
  insert into public.admin_actions (actor_id, action, reason, event_id, order_id, photo_id, organization_id, details)
  values (coalesce(p_actor_id, auth.uid()), p_action, p_reason, p_event_id, p_order_id, p_photo_id, p_organization_id, coalesce(p_details, '{}'))
  returning id;
$$;

-- Aktivasi manual: acara pilot gratis, atau pembayaran yang diterima di luar Midtrans.
-- Paket hanya boleh naik (draf → paket, atau upgrade), kuota mengikuti katalog.
create function public.admin_activate_event(p_event_id uuid, p_package text, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_quota integer;
  v_rank jsonb := '{"classic": 1, "complete": 2, "luxury": 3}';
begin
  perform public.require_admin();
  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'event tidak ditemukan' using errcode = 'P0002';
  end if;
  if p_package not in ('classic', 'complete', 'luxury') then
    raise exception 'paket tidak dikenal' using errcode = '22023';
  end if;
  if v_event.package is not null and (v_rank ->> p_package)::int <= (v_rank ->> v_event.package)::int then
    raise exception 'event sudah berpaket %; aktivasi manual hanya untuk naik paket', v_event.package using errcode = 'P0001';
  end if;

  select photo_quota into v_quota from public.catalog_items where code = p_package;
  update public.events
  set package = p_package, status = 'active', photo_quota = greatest(photo_quota, coalesce(v_quota, 0))
  where id = p_event_id;
  perform public.unlock_photos_within_quota(p_event_id);

  perform public.log_admin_action('activate_event', p_reason, p_event_id => p_event_id,
    p_details => jsonb_build_object('from_package', v_event.package, 'to_package', p_package));
  return jsonb_build_object('ok', true, 'package', p_package);
end;
$$;

-- Refund diproses manual di luar sistem (PRD §3.4); di sini hanya dicatat.
-- p_revert_event: kembalikan event ke draf bila yang direfund adalah paket utama (refund sebelum publikasi).
create function public.admin_record_refund(p_order_id uuid, p_reason text, p_revert_event boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item_type text;
begin
  perform public.require_admin();
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_order.status <> 'paid' then
    raise exception 'hanya order lunas yang bisa direfund (status: %)', v_order.status using errcode = 'P0001';
  end if;

  update public.orders set status = 'refunded' where id = p_order_id;

  select item_type into v_item_type from public.catalog_items where code = v_order.item_code;
  if p_revert_event and v_item_type = 'event_package' and v_order.event_id is not null then
    update public.events
    set package = null, status = 'draft', published_at = null, photo_quota = 0
    where id = v_order.event_id;
  end if;

  perform public.log_admin_action('record_refund', p_reason, p_event_id => v_order.event_id, p_order_id => p_order_id,
    p_details => jsonb_build_object('amount_idr', v_order.amount_idr, 'item_code', v_order.item_code, 'revert_event', p_revert_event and v_item_type = 'event_package'));
  return jsonb_build_object('ok', true);
end;
$$;

-- Takedown permanen: foto hilang dari panggung, galeri, dan ZIP; laporan terkait ditutup.
-- Mengembalikan kunci objek agar server menghapus file-nya dari R2.
create function public.admin_takedown_photo(p_photo_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_photo public.photos%rowtype;
begin
  perform public.require_admin();
  update public.photos
  set status = 'deleted', is_pinned = false, moderated_at = now(), moderated_by_profile_id = auth.uid(), moderated_by_staff_link_id = null
  where id = p_photo_id
  returning * into v_photo;
  if not found then
    raise exception 'foto tidak ditemukan' using errcode = 'P0002';
  end if;

  update public.photo_reports set resolved_at = now() where photo_id = p_photo_id and resolved_at is null;
  perform public.log_admin_action('takedown_photo', p_reason, p_event_id => v_photo.event_id, p_photo_id => p_photo_id,
    p_details => jsonb_build_object('uploader_name', v_photo.uploader_name));
  return jsonb_build_object('ok', true, 'keys', to_jsonb(array_remove(array[v_photo.key_display, v_photo.key_thumb, v_photo.key_original], null)));
end;
$$;

-- Penyesuaian saldo token organisasi (Fase 2 memakai saldo ini); alasan wajib, tercatat di credit_ledger.
create function public.admin_adjust_credit(p_organization_id uuid, p_delta integer, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_balance integer;
begin
  perform public.require_admin();
  if p_delta = 0 then
    raise exception 'jumlah penyesuaian tidak boleh 0' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'alasan wajib diisi' using errcode = '22023';
  end if;

  insert into public.credit_ledger (organization_id, delta, reason, actor_id, note)
  values (p_organization_id, p_delta, 'adjustment', auth.uid(), p_reason);
  select coalesce(sum(delta), 0)::int into v_balance from public.credit_ledger where organization_id = p_organization_id;

  perform public.log_admin_action('adjust_credit', p_reason, p_organization_id => p_organization_id,
    p_details => jsonb_build_object('delta', p_delta, 'balance', v_balance));
  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

-- Custom domain Luxury dikonfigurasi manual (PRD §9.5): admin menambahkan domain di Vercel, lalu mencatatnya di sini.
create function public.admin_upsert_domain(
  p_domain text,
  p_event_id uuid,
  p_paid_by text,
  p_registered_until date,
  p_reason text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_package text;
  v_id uuid;
  v_domain text := lower(trim(p_domain));
begin
  perform public.require_admin();
  select package into v_package from public.events where id = p_event_id;
  if v_package is distinct from 'luxury' then
    raise exception 'custom domain hanya untuk event Luxury' using errcode = 'P0001';
  end if;

  insert into public.custom_domains (domain, event_id, paid_by, registered_until)
  values (v_domain, p_event_id, p_paid_by, p_registered_until)
  on conflict (domain) do update
    set event_id = excluded.event_id, paid_by = excluded.paid_by, registered_until = excluded.registered_until
  returning id into v_id;

  perform public.log_admin_action('upsert_domain', p_reason, p_event_id => p_event_id,
    p_details => jsonb_build_object('domain', v_domain, 'paid_by', p_paid_by, 'registered_until', p_registered_until));
  return v_id;
end;
$$;

create function public.admin_set_domain_status(p_domain_id uuid, p_status text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_domain public.custom_domains%rowtype;
begin
  perform public.require_admin();
  update public.custom_domains
  set status = p_status, verified_at = case when p_status = 'active' then coalesce(verified_at, now()) else verified_at end
  where id = p_domain_id
  returning * into v_domain;
  if not found then
    raise exception 'domain tidak ditemukan' using errcode = 'P0002';
  end if;

  perform public.log_admin_action('set_domain_status', p_reason, p_event_id => v_domain.event_id,
    p_details => jsonb_build_object('domain', v_domain.domain, 'status', p_status));
end;
$$;

-- Dipakai proxy untuk mengarahkan custom domain aktif ke undangan event-nya. Data ini publik (domain menampilkan undangan).
create function public.resolve_custom_domain(p_host text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug
  from public.custom_domains d
  join public.events e on e.id = d.event_id
  where d.domain = lower(split_part(p_host, ':', 1))
    and d.status = 'active'
    and e.published_at is not null
    and e.status in ('active', 'completed');
$$;

-- Monitor acara hari ini: event aktif yang punya sesi pada tanggal hari ini (zona waktu event).
create function public.admin_today()
returns table (
  event_id uuid,
  slug text,
  title text,
  package text,
  timezone text,
  moderation_mode text,
  sessions jsonb,
  photos_today integer,
  pending integer,
  upload_errors_today integer,
  checked_in integer,
  invitations integer,
  open_reports integer,
  stage_last_seen timestamptz,
  stage_live boolean,
  stage_cached integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  return query
    with today as (
      select e.*, (date_trunc('day', now() at time zone e.timezone)) at time zone e.timezone as day_start
      from public.events e
      where e.status = 'active'
        and exists (
          select 1 from public.event_sessions s
          where s.event_id = e.id and (s.starts_at at time zone e.timezone)::date = (now() at time zone e.timezone)::date
        )
    )
    select
      t.id, t.slug, t.title, t.package, t.timezone, t.moderation_mode,
      (select jsonb_agg(jsonb_build_object('name', s.name, 'starts_at', s.starts_at, 'ends_at', s.ends_at) order by s.starts_at)
         from public.event_sessions s
         where s.event_id = t.id and (s.starts_at at time zone t.timezone)::date = (now() at time zone t.timezone)::date),
      (select count(*) from public.photos p where p.event_id = t.id and p.created_at >= t.day_start)::int,
      (select count(*) from public.photos p where p.event_id = t.id and p.status = 'pending')::int,
      (select count(*) from public.upload_errors u where u.event_id = t.id and u.created_at >= t.day_start)::int,
      (select count(*) from public.invitations i where i.event_id = t.id and i.checked_in_at is not null)::int,
      (select count(*) from public.invitations i where i.event_id = t.id)::int,
      (select count(*) from public.photo_reports r where r.event_id = t.id and r.resolved_at is null)::int,
      (select max(h.last_seen_at) from public.stage_heartbeats h where h.event_id = t.id),
      coalesce((select bool_or(h.realtime_live) from public.stage_heartbeats h where h.event_id = t.id and h.last_seen_at > now() - interval '2 minutes'), false),
      coalesce((select max(h.cached_photos) from public.stage_heartbeats h where h.event_id = t.id and h.last_seen_at > now() - interval '2 minutes'), 0)
    from today t
    order by t.title;
end;
$$;

-- Data operasional hanya disimpan 30 hari.
create function public.cleanup_ops_data()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.upload_errors where created_at < now() - interval '30 days';
  delete from public.stage_heartbeats where last_seen_at < now() - interval '30 days';
$$;

revoke execute on function
  public.staff_stage_heartbeat(uuid, boolean, integer),
  public.require_admin(),
  public.log_admin_action(text, text, uuid, uuid, uuid, uuid, jsonb, uuid),
  public.admin_activate_event(uuid, text, text),
  public.admin_record_refund(uuid, text, boolean),
  public.admin_takedown_photo(uuid, text),
  public.admin_adjust_credit(uuid, integer, text),
  public.admin_upsert_domain(text, uuid, text, date, text),
  public.admin_set_domain_status(uuid, text, text),
  public.resolve_custom_domain(text),
  public.admin_today(),
  public.cleanup_ops_data()
from public, anon, authenticated;

grant execute on function
  public.staff_stage_heartbeat(uuid, boolean, integer),
  public.admin_activate_event(uuid, text, text),
  public.admin_record_refund(uuid, text, boolean),
  public.admin_takedown_photo(uuid, text),
  public.admin_adjust_credit(uuid, integer, text),
  public.admin_upsert_domain(text, uuid, text, date, text),
  public.admin_set_domain_status(uuid, text, text),
  public.admin_today()
to authenticated;

grant execute on function public.resolve_custom_domain(text) to anon, authenticated;
-- Pengecekan cek ulang order ke Midtrans berjalan di server (service role) lalu dicatat lewat fungsi ini.
grant execute on function public.log_admin_action(text, text, uuid, uuid, uuid, uuid, jsonb, uuid) to service_role;
grant execute on function public.cleanup_ops_data() to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule('cleanup-ops-data', '30 19 * * *', 'select public.cleanup_ops_data()');
  end if;
exception when others then
  raise warning 'pg_cron tidak bisa dipakai: %', sqlerrm;
end;
$$;
