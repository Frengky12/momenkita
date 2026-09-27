-- Perapian dari Supabase advisors (Minggu 6).

-- Indeks untuk foreign key: tanpa ini, ON DELETE SET NULL/CASCADE memindai seluruh tabel lintas event,
-- misalnya menghapus link staf memindai semua photos dan invitations di platform.
create index photos_guest_session_event_idx on public.photos (guest_session_id, event_id);
create index photos_moderated_by_profile_idx on public.photos (moderated_by_profile_id);
create index photos_moderated_by_staff_link_idx on public.photos (moderated_by_staff_link_id);
create index invitations_checked_in_by_profile_idx on public.invitations (checked_in_by_profile_id);
create index invitations_checked_in_by_staff_link_idx on public.invitations (checked_in_by_staff_link_id);
create index guest_sessions_invitation_idx on public.guest_sessions (invitation_id, event_id);
create index wishes_invitation_idx on public.wishes (invitation_id, event_id);
create index credit_ledger_actor_idx on public.credit_ledger (actor_id);
create index credit_ledger_event_idx on public.credit_ledger (event_id);
create index credit_ledger_order_idx on public.credit_ledger (order_id);
create index orders_item_code_idx on public.orders (item_code);
create index organizations_created_by_idx on public.organizations (created_by);

-- Satu policy SELECT per tabel (bukan dua policy permissive yang dievaluasi untuk tiap baris).
-- is_admin() dibungkus (select ...) agar dihitung sekali per query, bukan per baris.
drop policy catalog_items_select_active on public.catalog_items;
drop policy catalog_items_select_admin on public.catalog_items;

create policy catalog_items_select_anon on public.catalog_items
  for select to anon
  using (is_active);

create policy catalog_items_select on public.catalog_items
  for select to authenticated
  using (is_active or (select public.is_admin()));

drop policy event_sessions_manage on public.event_sessions;
drop policy event_sessions_select_admin on public.event_sessions;

create policy event_sessions_select on public.event_sessions
  for select to authenticated
  using (public.is_event_manager(event_id) or (select public.is_admin()));

create policy event_sessions_insert on public.event_sessions
  for insert to authenticated
  with check (public.is_event_manager(event_id));

create policy event_sessions_update on public.event_sessions
  for update to authenticated
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy event_sessions_delete on public.event_sessions
  for delete to authenticated
  using (public.is_event_manager(event_id));

drop policy invitations_manage on public.invitations;
drop policy invitations_select_admin on public.invitations;

create policy invitations_select on public.invitations
  for select to authenticated
  using (public.is_event_manager(event_id) or (select public.is_admin()));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (public.is_event_manager(event_id));

create policy invitations_update on public.invitations
  for update to authenticated
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (public.is_event_manager(event_id));
