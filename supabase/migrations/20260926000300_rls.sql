-- Model akses:
--   anon          : hanya katalog harga. Halaman undangan dan alur tamu dilayani server (service role).
--   authenticated : host/WO lewat RLS di bawah; perangkat staf (anonim) hanya lewat RPC staff_*.
--   service_role  : server Next.js (webhook Midtrans, alur tamu, super admin); melewati RLS.
-- Default privileges Supabase memberi anon/authenticated akses penuh ke tabel baru,
-- jadi migrasi berikutnya yang menambah tabel harus mengulang pola revoke + grant ini.

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.events enable row level security;
alter table public.event_cohosts enable row level security;
alter table public.event_sessions enable row level security;
alter table public.staff_links enable row level security;
alter table public.staff_sessions enable row level security;
alter table public.invitations enable row level security;
alter table public.wishes enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.photos enable row level security;
alter table public.catalog_items enable row level security;
alter table public.orders enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.subscriptions enable row level security;
alter table public.custom_domains enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- catalog_items
grant select on public.catalog_items to anon, authenticated;

create policy catalog_items_select_active on public.catalog_items
  for select to anon, authenticated
  using (is_active);

create policy catalog_items_select_admin on public.catalog_items
  for select to authenticated
  using (public.is_admin());

-- profiles: role hanya bisa diubah service role.
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (public.can_view_profile(id));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- organizations: white_label mengikuti langganan, jadi tidak bisa diubah langsung.
grant select on public.organizations to authenticated;
grant insert (name, slug, logo_key, brand_config) on public.organizations to authenticated;
grant update (name, logo_key, brand_config) on public.organizations to authenticated;

-- created_by diperlukan agar INSERT ... RETURNING lolos sebelum trigger menambah keanggotaan owner.
create policy organizations_select on public.organizations
  for select to authenticated
  using (created_by = (select auth.uid()) or public.is_org_member(id) or public.is_admin());

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (public.is_registered_user());

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_org_owner(id))
  with check (public.is_org_owner(id));

-- org_members
grant select, delete on public.org_members to authenticated;
grant insert (organization_id, profile_id, role), update (role) on public.org_members to authenticated;

create policy org_members_select on public.org_members
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_admin());

create policy org_members_insert on public.org_members
  for insert to authenticated
  with check (public.is_org_owner(organization_id));

create policy org_members_update on public.org_members
  for update to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

create policy org_members_delete on public.org_members
  for delete to authenticated
  using (public.is_org_owner(organization_id));

-- events: package, status, photo_quota, passcode_hash, storage_expires_at sengaja tidak di-grant.
grant select, delete on public.events to authenticated;
grant insert (owner_id, organization_id, slug, title, event_type, timezone, moderation_mode,
              gallery_public, theme_config, gift_config)
  on public.events to authenticated;
grant update (slug, title, event_type, timezone, moderation_mode, gallery_public, stage_blackout,
              theme_config, gift_config, published_at)
  on public.events to authenticated;

-- owner_id dicek langsung karena is_event_manager() belum melihat baris yang sedang di-INSERT.
create policy events_select on public.events
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_event_manager(id) or public.is_admin());

create policy events_insert on public.events
  for insert to authenticated
  with check (
    public.is_registered_user()
    and owner_id = (select auth.uid())
    and (organization_id is null or public.is_org_member(organization_id))
  );

-- Event hanya boleh dipublikasikan setelah dibayar (status bukan draft).
create policy events_update on public.events
  for update to authenticated
  using (public.is_event_manager(id))
  with check (public.is_event_manager(id) and (published_at is null or status <> 'draft'));

create policy events_delete on public.events
  for delete to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft');

-- event_cohosts
grant select, delete on public.event_cohosts to authenticated;
grant insert (event_id, profile_id) on public.event_cohosts to authenticated;

create policy event_cohosts_select on public.event_cohosts
  for select to authenticated
  using (public.is_event_manager(event_id) or public.is_admin());

create policy event_cohosts_insert on public.event_cohosts
  for insert to authenticated
  with check (public.is_event_manager(event_id));

create policy event_cohosts_delete on public.event_cohosts
  for delete to authenticated
  using (public.is_event_manager(event_id));

-- event_sessions dan invitations: pengelola event punya akses penuh.
grant select, insert, update, delete on public.event_sessions to authenticated;
grant select, insert, update, delete on public.invitations to authenticated;

create policy event_sessions_manage on public.event_sessions
  for all to authenticated
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy event_sessions_select_admin on public.event_sessions
  for select to authenticated
  using (public.is_admin());

create policy invitations_manage on public.invitations
  for all to authenticated
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy invitations_select_admin on public.invitations
  for select to authenticated
  using (public.is_admin());

-- wishes: dibuat tamu lewat server; pengelola hanya menyembunyikan atau menghapus.
grant select, delete on public.wishes to authenticated;
grant update (is_hidden) on public.wishes to authenticated;

create policy wishes_select on public.wishes
  for select to authenticated
  using (public.is_event_manager(event_id) or public.is_admin());

create policy wishes_update on public.wishes
  for update to authenticated
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy wishes_delete on public.wishes
  for delete to authenticated
  using (public.is_event_manager(event_id));

-- staff_links: dibuat lewat create_staff_link() karena token dan PIN di-hash di database.
grant select on public.staff_links to authenticated;
grant update (label, revoked_at) on public.staff_links to authenticated;

create policy staff_links_select on public.staff_links
  for select to authenticated
  using (public.is_event_manager(event_id) or public.is_admin());

create policy staff_links_update on public.staff_links
  for update to authenticated
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

-- staff_sessions: tanpa grant; hanya diakses fungsi security definer.

-- guest_sessions dan photos: dibuat server; moderasi foto lewat staff_moderate_photo().
grant select on public.guest_sessions to authenticated;
grant update (is_blocked) on public.guest_sessions to authenticated;
grant select on public.photos to authenticated;

create policy guest_sessions_select on public.guest_sessions
  for select to authenticated
  using (public.is_event_manager(event_id) or public.is_admin());

create policy guest_sessions_update on public.guest_sessions
  for update to authenticated
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy photos_select on public.photos
  for select to authenticated
  using (public.is_event_manager(event_id) or public.is_admin());

-- Tabel komersial: hanya baca. Semua penulisan lewat server / fulfill_order().
grant select on public.orders to authenticated;
grant select on public.credit_ledger to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.custom_domains to authenticated;

create policy orders_select on public.orders
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (organization_id is not null and public.is_org_member(organization_id))
    or public.is_admin()
  );

create policy credit_ledger_select on public.credit_ledger
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_admin());

create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_admin());

create policy custom_domains_select on public.custom_domains
  for select to authenticated
  using (
    (event_id is not null and public.is_event_manager(event_id))
    or (organization_id is not null and public.is_org_member(organization_id))
    or public.is_admin()
  );

-- Realtime: channel privat event:<id> hanya untuk pengelola event dan staf aktif.
-- Klien tidak mengirim broadcast; semua pesan berasal dari trigger database.
create policy event_channel_receive on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.can_receive_event_channel((select realtime.topic()))
  );
