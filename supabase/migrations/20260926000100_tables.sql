-- Skema inti MomenKita. Rujukan: docs/PRD_MomenKita.md §7.
-- Status dan jenis memakai text + check (bukan enum) supaya mudah ditambah lewat migrasi.

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  phone text,
  -- Keanggotaan WO dibaca dari org_members, bukan dari kolom ini.
  role text not null default 'host' check (role in ('host', 'admin')),
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_key text,
  brand_config jsonb not null default '{}',
  white_label boolean not null default false,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.org_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);
create index org_members_profile_idx on public.org_members (profile_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id),
  organization_id uuid references public.organizations (id) on delete set null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  title text not null check (length(title) between 1 and 150),
  event_type text not null default 'wedding' check (event_type in ('wedding', 'birthday', 'corporate')),
  -- package, status, dan photo_quota hanya diubah oleh fulfill_order() / service role.
  package text check (package in ('classic', 'complete', 'luxury')),
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'expired')),
  timezone text not null default 'Asia/Jakarta' check (timezone in ('Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura')),
  moderation_mode text not null default 'curated' check (moderation_mode in ('curated', 'delayed', 'instant')),
  photo_quota integer not null default 0 check (photo_quota >= 0),
  passcode_hash text,
  gallery_public boolean not null default false,
  stage_blackout boolean not null default false,
  theme_config jsonb not null default '{}',
  gift_config jsonb not null default '{}',
  storage_expires_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  check (status = 'draft' or package is not null),
  -- Undangan tayang di /<slug>, jadi slug tidak boleh sama dengan route aplikasi di src/app.
  constraint events_slug_not_reserved check (slug not in ('api', 'auth', 'login', 'dashboard', 'staff', 'admin'))
);
create index events_owner_idx on public.events (owner_id);
create index events_organization_idx on public.events (organization_id);

-- Co-host: pasangan pengantin, atau klien yang diundang WO ke event milik WO.
create table public.event_cohosts (
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
create index event_cohosts_profile_idx on public.event_cohosts (profile_id);

create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue_name text,
  venue_address text,
  venue_lat double precision check (venue_lat between -90 and 90),
  venue_lng double precision check (venue_lng between -180 and 180),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index event_sessions_event_idx on public.event_sessions (event_id);

create table public.staff_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  role text not null check (role in ('moderator', 'receptionist', 'stage', 'photographer')),
  label text not null default '',
  token_hash text not null unique,
  pin_hash text not null,
  failed_pin_attempts smallint not null default 0,
  locked_until timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index staff_links_event_idx on public.staff_links (event_id);

-- Perangkat staf (anonymous sign-in) yang sudah lolos token + PIN.
create table public.staff_sessions (
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  staff_link_id uuid not null references public.staff_links (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (auth_user_id, staff_link_id)
);
create index staff_sessions_link_idx on public.staff_sessions (staff_link_id);

-- Satu baris = satu tamu/rumah tangga; RSVP dan check-in relasinya 1:1 sehingga disimpan di sini.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  guest_name text not null check (length(guest_name) between 1 and 120),
  -- Kosong = dibuatkan trigger dari nama tamu + sufiks acak.
  personal_slug text not null default '' check (personal_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  phone_number text,
  category text not null default 'regular' check (category in ('vip', 'family', 'regular')),
  pax_allowed smallint not null default 1 check (pax_allowed between 1 and 20),
  table_number text,
  session_ids uuid[] not null default '{}',
  -- Disimpan mentah (bukan hash) karena halaman undangan personal harus bisa menampilkan QR-nya.
  qr_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  source text not null default 'manual' check (source in ('manual', 'import', 'public_rsvp', 'walk_in')),
  sent_at timestamptz,
  opened_at timestamptz,
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending', 'attending', 'declined', 'maybe')),
  rsvp_pax smallint check (rsvp_pax between 0 and 20),
  rsvp_at timestamptz,
  checked_in_at timestamptz,
  checked_in_pax smallint check (checked_in_pax between 0 and 50),
  checked_in_by_staff_link_id uuid references public.staff_links (id) on delete set null,
  checked_in_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, personal_slug),
  unique (id, event_id)
);

create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  invitation_id uuid,
  author_name text not null check (length(author_name) between 1 and 120),
  message text not null check (length(message) between 1 and 1000),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (invitation_id, event_id) references public.invitations (id, event_id) on delete set null (invitation_id)
);
create index wishes_event_idx on public.wishes (event_id, created_at);

create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  invitation_id uuid,
  display_name text not null check (length(display_name) between 1 and 60),
  consent_at timestamptz not null default now(),
  consent_version text not null,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (id, event_id),
  foreign key (invitation_id, event_id) references public.invitations (id, event_id) on delete set null (invitation_id)
);
create index guest_sessions_event_idx on public.guest_sessions (event_id);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  guest_session_id uuid not null,
  -- Diisi trigger dari guest_sessions.display_name.
  uploader_name text not null default '',
  caption text check (length(caption) <= 140),
  -- Kunci objek R2 wajib berawalan events/<event_id>/ agar server bisa memeriksa hak akses dari prefiksnya.
  key_display text not null,
  key_thumb text not null,
  key_original text,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  bytes_display integer not null check (bytes_display between 1 and 409600),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'deleted')),
  -- Mode jeda: foto berstatus approved tetapi baru tayang setelah visible_after.
  visible_after timestamptz,
  is_pinned boolean not null default false,
  over_quota boolean not null default false,
  moderated_by_profile_id uuid references public.profiles (id) on delete set null,
  moderated_by_staff_link_id uuid references public.staff_links (id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (guest_session_id, event_id) references public.guest_sessions (id, event_id) on delete cascade,
  check (key_display like 'events/' || event_id || '/%'),
  check (key_thumb like 'events/' || event_id || '/%'),
  check (key_original is null or key_original like 'events/' || event_id || '/%'),
  check (status <> 'approved' or visible_after is not null)
);
create index photos_event_idx on public.photos (event_id, created_at);
create index photos_session_idx on public.photos (guest_session_id, created_at);

-- Harga masih hipotesis (PRD §3), jadi disimpan di tabel agar bisa diubah tanpa deploy.
create table public.catalog_items (
  code text primary key,
  item_type text not null check (item_type in ('event_package', 'upgrade', 'addon', 'token_pack', 'subscription')),
  name text not null,
  price_idr bigint not null check (price_idr > 0),
  package text check (package in ('classic', 'complete', 'luxury')),
  from_package text check (from_package in ('classic', 'complete', 'luxury')),
  -- Kuota paket, atau tambahan kuota untuk add-on.
  photo_quota integer check (photo_quota >= 0),
  -- null pada paket berfoto = simpan selamanya.
  retention_months integer check (retention_months > 0),
  token_count integer check (token_count > 0),
  events_per_month integer check (events_per_month > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (item_type not in ('event_package', 'upgrade') or package is not null),
  check (item_type <> 'upgrade' or from_package is not null)
);

insert into public.catalog_items (code, item_type, name, price_idr, package, from_package, photo_quota, retention_months, token_count, events_per_month) values
  ('classic',                  'event_package', 'Classic',                      149000,  'classic',  null,       0,     null, null, null),
  ('complete',                 'event_package', 'Complete Experience',          399000,  'complete', null,       1000,  6,    null, null),
  ('luxury',                   'event_package', 'Unlimited Luxury',             699000,  'luxury',   null,       10000, null, null, null),
  ('upgrade_classic_complete', 'upgrade',       'Upgrade Classic ke Complete',  250000,  'complete', 'classic',  1000,  6,    null, null),
  ('upgrade_classic_luxury',   'upgrade',       'Upgrade Classic ke Luxury',    550000,  'luxury',   'classic',  10000, null, null, null),
  ('upgrade_complete_luxury',  'upgrade',       'Upgrade Complete ke Luxury',   300000,  'luxury',   'complete', 10000, null, null, null),
  ('addon_photos_500',         'addon',         'Tambahan 500 foto',            79000,   null,       null,       500,   null, null, null),
  ('addon_album_12m',          'addon',         'Perpanjangan album 12 bulan',  49000,   null,       null,       null,  12,   null, null),
  ('token_5',                  'token_pack',    'Paket 5 Event Token',          1395000, null,       null,       null,  null, 5,    null),
  ('token_15',                 'token_pack',    'Paket 15 Event Token',         3285000, null,       null,       null,  null, 15,   null),
  ('wo_pro_monthly',           'subscription',  'WO Pro Agency (bulanan)',      1490000, null,       null,       null,  null, null, 5);

create table public.orders (
  -- id dipakai sebagai order_id di Midtrans.
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  organization_id uuid references public.organizations (id),
  event_id uuid references public.events (id) on delete set null,
  item_code text not null references public.catalog_items (code),
  quantity integer not null default 1 check (quantity between 1 and 100),
  -- Snapshot harga saat checkout; harga katalog boleh berubah setelahnya.
  amount_idr bigint not null check (amount_idr > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  provider text not null default 'midtrans' check (provider = 'midtrans'),
  -- transaction_id dari notifikasi Midtrans.
  provider_ref text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check (status not in ('paid', 'refunded') or paid_at is not null)
);
create index orders_profile_idx on public.orders (profile_id);
create index orders_event_idx on public.orders (event_id);
create index orders_organization_idx on public.orders (organization_id);

-- Saldo token = SUM(delta); tidak ada kolom saldo supaya setiap perubahan bisa diaudit.
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('purchase', 'redeem', 'refund', 'expire', 'adjustment')),
  order_id uuid references public.orders (id),
  event_id uuid references public.events (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  note text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (reason <> 'adjustment' or (actor_id is not null and note is not null))
);
create index credit_ledger_organization_idx on public.credit_ledger (organization_id);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan text not null default 'wo_pro' check (plan in ('wo_pro')),
  status text not null check (status in ('active', 'past_due', 'canceled')),
  events_quota integer not null check (events_quota >= 0),
  events_used integer not null default 0 check (events_used >= 0),
  period_start timestamptz not null,
  period_end timestamptz not null,
  created_at timestamptz not null default now(),
  check (period_end > period_start)
);
create unique index subscriptions_one_live_per_org on public.subscriptions (organization_id)
  where status in ('active', 'past_due');

create table public.custom_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique check (domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  event_id uuid references public.events (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  status text not null default 'pending_dns' check (status in ('pending_dns', 'active', 'failed', 'expired')),
  paid_by text not null check (paid_by in ('platform', 'customer')),
  registered_until date,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(event_id, organization_id) = 1)
);
create index custom_domains_event_idx on public.custom_domains (event_id);
create index custom_domains_organization_idx on public.custom_domains (organization_id);
