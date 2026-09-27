-- Foto undangan dari host (PRD §5.1): sampul, foto mempelai, galeri prewedding, dan gambar QRIS amplop digital.
-- File ada di R2 (privat, dibaca lewat signed URL); tabel ini hanya menyimpan kunci objek dan ukurannya.
create table public.invitation_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('cover', 'groom', 'bride', 'gallery', 'qris')),
  key_display text not null,
  key_thumb text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  bytes_display integer not null check (bytes_display > 0),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  -- Kunci harus berada di folder undangan event ini, agar host tidak bisa menautkan file event lain.
  constraint invitation_media_key_prefix check (
    key_display like 'events/' || event_id::text || '/invitation/%'
    and key_thumb like 'events/' || event_id::text || '/invitation/%'
  )
);
create index invitation_media_event_idx on public.invitation_media (event_id, kind, created_at);
create index invitation_media_created_by_idx on public.invitation_media (created_by);
-- Sampul, foto mempelai, dan QRIS masing-masing hanya satu per event; galeri boleh banyak (dibatasi trigger).
create unique index invitation_media_single_idx on public.invitation_media (event_id, kind) where kind <> 'gallery';

create function public.limit_invitation_gallery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'gallery'
    and (select count(*) from public.invitation_media where event_id = new.event_id and kind = 'gallery') >= 12 then
    raise exception 'galeri maksimal 12 foto' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger invitation_media_gallery_limit
  before insert on public.invitation_media
  for each row execute function public.limit_invitation_gallery();

alter table public.invitation_media enable row level security;
revoke all on public.invitation_media from anon, authenticated;
grant select, delete on public.invitation_media to authenticated;
grant insert (event_id, kind, key_display, key_thumb, width, height, bytes_display) on public.invitation_media to authenticated;
-- Mengganti sampul/foto mempelai/QRIS memperbarui baris yang ada (indeks unik), bukan menghapus lalu menambah.
grant update (key_display, key_thumb, width, height, bytes_display) on public.invitation_media to authenticated;

create policy invitation_media_select on public.invitation_media
  for select to authenticated
  using (public.is_event_manager(event_id) or (select public.is_admin()));
create policy invitation_media_insert on public.invitation_media
  for insert to authenticated
  with check (public.is_registered_user() and public.is_event_manager(event_id));
create policy invitation_media_update on public.invitation_media
  for update to authenticated
  using (public.is_event_manager(event_id))
  with check (public.is_event_manager(event_id));
create policy invitation_media_delete on public.invitation_media
  for delete to authenticated
  using (public.is_event_manager(event_id));
