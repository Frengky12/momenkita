-- Minggu 6: galeri bersama (passcode, laporan konten), unduhan ZIP, dan pembersihan perangkat staf.

-- Laporan konten dari tombol "Laporkan" di galeri (PRD §5.5, §9.4). Dibuat server (service role);
-- pengelola event melihat dan menandainya selesai. reporter_key = HMAC IP, mencegah laporan ganda.
create table public.photo_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  photo_id uuid not null references public.photos (id) on delete cascade,
  reason text not null check (reason in ('inappropriate', 'privacy', 'other')),
  reporter_key text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (photo_id, reporter_key)
);
create index photo_reports_event_idx on public.photo_reports (event_id, created_at);

alter table public.photo_reports enable row level security;
revoke all on public.photo_reports from anon, authenticated;
grant select on public.photo_reports to authenticated;
grant update (resolved_at) on public.photo_reports to authenticated;

create policy photo_reports_select on public.photo_reports
  for select to authenticated
  using (public.is_event_manager(event_id) or public.is_admin());

create policy photo_reports_update on public.photo_reports
  for update to authenticated
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

-- Passcode galeri disimpan sebagai hash bcrypt; kosong = galeri tanpa passcode.
create function public.set_gallery_passcode(p_event_id uuid, p_passcode text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_event_manager(p_event_id) then
    raise exception 'akses ditolak' using errcode = '42501';
  end if;
  if coalesce(p_passcode, '') <> '' and length(p_passcode) not between 4 and 32 then
    raise exception 'passcode harus 4 sampai 32 karakter' using errcode = '22023';
  end if;

  update public.events
  set passcode_hash = case
    when coalesce(p_passcode, '') = '' then null
    else extensions.crypt(p_passcode, extensions.gen_salt('bf', 8))
  end
  where id = p_event_id;
end;
$$;

-- Dipanggil server saat tamu memasukkan passcode (setelah rate limit).
create function public.check_gallery_passcode(p_event_id uuid, p_passcode text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(passcode_hash = extensions.crypt(p_passcode, passcode_hash), false)
  from public.events
  where id = p_event_id;
$$;

-- Daftar file untuk unduhan ZIP (PRD §5.5): hanya foto approved yang tidak terkunci kuota (§3.4).
-- File asli hanya untuk paket Luxury; foto tanpa file asli memakai versi display.
create function public.staff_download_manifest(
  p_event_id uuid,
  p_variant text default 'display',
  p_offset integer default 0,
  p_limit integer default 200
)
returns table (id uuid, uploader_name text, caption text, created_at timestamptz, key text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_package text;
begin
  perform public.require_event_access(p_event_id, array['photographer']);
  if p_variant not in ('display', 'original') then
    raise exception 'varian tidak dikenal: %', p_variant using errcode = '22023';
  end if;

  select e.package into v_package from public.events e where e.id = p_event_id;
  if p_variant = 'original' and v_package is distinct from 'luxury' then
    raise exception 'file asli hanya untuk paket Luxury' using errcode = 'P0001';
  end if;

  return query
    select p.id, p.uploader_name, p.caption, p.created_at,
           case when p_variant = 'original' then coalesce(p.key_original, p.key_display) else p.key_display end
    from public.photos p
    where p.event_id = p_event_id and p.status = 'approved' and not p.over_quota
    order by p.created_at, p.id
    offset greatest(p_offset, 0)
    limit least(greatest(p_limit, 1), 500);
end;
$$;

-- Ringkasan untuk halaman fotografer dan tab Galeri host.
create function public.staff_gallery_summary(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_event_access(p_event_id, array['photographer']);

  return (
    select jsonb_build_object(
      'package', e.package,
      'downloadable', count(p.id) filter (where p.status = 'approved' and not p.over_quota),
      'locked', count(p.id) filter (where p.status = 'approved' and p.over_quota),
      'originals', count(p.id) filter (where p.status = 'approved' and not p.over_quota and p.key_original is not null)
    )
    from public.events e
    left join public.photos p on p.event_id = e.id
    where e.id = p_event_id
    group by e.id, e.package
  );
end;
$$;

-- Perangkat staf (user anonim) yang tidak lagi punya link aktif, misalnya gagal PIN atau link dicabut/kedaluwarsa,
-- dihapus setelah 7 hari agar Supabase Auth tidak menumpuk user yatim.
create function public.cleanup_staff_devices()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from auth.users u
  where u.is_anonymous
    and u.created_at < now() - interval '7 days'
    and not exists (
      select 1
      from public.staff_sessions s
      join public.staff_links l on l.id = s.staff_link_id
      where s.auth_user_id = u.id and l.revoked_at is null and l.expires_at > now()
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function
  public.set_gallery_passcode(uuid, text),
  public.check_gallery_passcode(uuid, text),
  public.staff_download_manifest(uuid, text, integer, integer),
  public.staff_gallery_summary(uuid),
  public.cleanup_staff_devices()
from public, anon, authenticated;

grant execute on function
  public.set_gallery_passcode(uuid, text),
  public.staff_download_manifest(uuid, text, integer, integer),
  public.staff_gallery_summary(uuid)
to authenticated;

grant execute on function
  public.check_gallery_passcode(uuid, text),
  public.cleanup_staff_devices()
to service_role;

-- Jadwal harian 02.15 WIB lewat pg_cron bila tersedia (Supabase). Uji lokal (PGlite) tidak punya pg_cron,
-- dan kegagalan di sini tidak boleh menggagalkan migrasi: jadwal bisa dibuat ulang dari dashboard.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('cleanup-staff-devices', '15 19 * * *', 'select public.cleanup_staff_devices()');
  end if;
exception when others then
  raise warning 'pg_cron tidak bisa dipakai: %', sqlerrm;
end;
$$;
