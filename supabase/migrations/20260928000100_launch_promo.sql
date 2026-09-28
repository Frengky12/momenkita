-- Promo masa peluncuran (keputusan PO 28 Sep 2026): paket diaktifkan gratis tanpa pembayaran, dibatasi per akun.
-- Diatur Super Admin tanpa deploy. Setiap klaim dicatat untuk mengukur berapa yang kemudian membeli upgrade/add-on.
create table public.launch_promo (
  id boolean primary key default true check (id),
  active boolean not null default false,
  package text not null default 'complete' check (package in ('classic', 'complete', 'luxury')),
  per_account integer not null default 1 check (per_account between 1 and 10),
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.launch_promo (id) values (true);
create index launch_promo_updated_by_idx on public.launch_promo (updated_by);

alter table public.launch_promo enable row level security;
revoke all on public.launch_promo from anon, authenticated;

-- Klaim yang dicabut tetap dihitung dalam kuota akun, agar pencabutan karena penyalahgunaan tidak bisa diklaim ulang.
create table public.promo_claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid unique references public.events (id) on delete set null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  package text not null,
  claimed_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index promo_claims_profile_idx on public.promo_claims (profile_id);

alter table public.promo_claims enable row level security;
revoke all on public.promo_claims from anon, authenticated;
grant select on public.promo_claims to authenticated;
create policy promo_claims_select on public.promo_claims
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_admin()));

alter table public.admin_actions drop constraint admin_actions_action_check;
alter table public.admin_actions add constraint admin_actions_action_check check (action in (
  'activate_event', 'record_refund', 'reconcile_order', 'takedown_photo', 'dismiss_report', 'adjust_credit',
  'upsert_domain', 'set_domain_status', 'set_launch_promo', 'revoke_promo'
));

-- Status publik (dipakai halaman depan tanpa login dan tab Publikasi).
create function public.launch_promo_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'active', p.active and (p.ends_at is null or p.ends_at > now()),
    'package', p.package,
    'per_account', p.per_account,
    'ends_at', p.ends_at
  )
  from public.launch_promo p;
$$;

create function public.claim_launch_promo(p_event_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_promo public.launch_promo%rowtype;
  v_event public.events%rowtype;
  v_used integer;
  v_quota integer;
begin
  if not public.is_registered_user() then
    raise exception 'akses ditolak' using errcode = '42501';
  end if;
  -- Satu akun diproses bergantian, agar dua klik bersamaan tidak sama-sama lolos cek kuota.
  perform pg_advisory_xact_lock(hashtext('promo:' || auth.uid()::text));

  select * into v_promo from public.launch_promo;
  if not v_promo.active or (v_promo.ends_at is not null and v_promo.ends_at <= now()) then
    raise exception 'promo peluncuran tidak aktif' using errcode = 'P0001';
  end if;

  select * into v_event from public.events where id = p_event_id and owner_id = auth.uid() for update;
  if not found then
    raise exception 'hanya pemilik event yang bisa memakai promo' using errcode = '42501';
  end if;
  if v_event.package is not null then
    raise exception 'event sudah berpaket %', v_event.package using errcode = 'P0001';
  end if;

  select count(*) into v_used from public.promo_claims where profile_id = auth.uid();
  if v_used >= v_promo.per_account then
    raise exception 'kuota promo akun ini sudah terpakai' using errcode = 'P0001';
  end if;

  select photo_quota into v_quota from public.catalog_items where code = v_promo.package;
  update public.events set package = v_promo.package, photo_quota = coalesce(v_quota, 0), status = 'active' where id = p_event_id;
  insert into public.promo_claims (event_id, profile_id, package) values (p_event_id, auth.uid(), v_promo.package);
  return jsonb_build_object('ok', true, 'package', v_promo.package);
end;
$$;

create function public.admin_set_launch_promo(p_active boolean, p_package text, p_per_account integer, p_ends_at timestamptz, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.launch_promo
  set active = p_active, package = p_package, per_account = p_per_account, ends_at = p_ends_at, updated_at = now(), updated_by = auth.uid();
  perform public.log_admin_action('set_launch_promo', p_reason,
    p_details => jsonb_build_object('active', p_active, 'package', p_package, 'per_account', p_per_account, 'ends_at', p_ends_at));
end;
$$;

-- Mencabut promo mengembalikan event ke draf. Ditolak bila event sudah punya pembayaran, karena paketnya
-- mungkin sudah di-upgrade dengan uang pelanggan; pakai catat refund untuk kasus itu.
create function public.admin_revoke_promo(p_event_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_claim public.promo_claims%rowtype;
begin
  perform public.require_admin();
  select * into v_claim from public.promo_claims where event_id = p_event_id and revoked_at is null for update;
  if not found then
    raise exception 'event ini tidak memakai promo' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.orders where event_id = p_event_id and status = 'paid') then
    raise exception 'event sudah punya pembayaran; cabut lewat catat refund' using errcode = 'P0001';
  end if;

  update public.promo_claims set revoked_at = now() where id = v_claim.id;
  update public.events set package = null, status = 'draft', published_at = null, photo_quota = 0 where id = p_event_id;
  perform public.log_admin_action('revoke_promo', p_reason, p_event_id => p_event_id,
    p_details => jsonb_build_object('package', v_claim.package));
end;
$$;

revoke execute on function public.launch_promo_status() from public;
revoke execute on function public.claim_launch_promo(uuid) from public, anon, authenticated;
revoke execute on function public.admin_set_launch_promo(boolean, text, integer, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.admin_revoke_promo(uuid, text) from public, anon, authenticated;
grant execute on function public.launch_promo_status() to anon, authenticated;
grant execute on function public.claim_launch_promo(uuid) to authenticated;
grant execute on function public.admin_set_launch_promo(boolean, text, integer, timestamptz, text) to authenticated;
grant execute on function public.admin_revoke_promo(uuid, text) to authenticated;
