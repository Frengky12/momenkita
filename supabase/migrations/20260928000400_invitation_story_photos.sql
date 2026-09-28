-- Foto per bab Love Story: satu foto per bab, maksimal 6 per event (sama dengan jumlah bab). Bab menautkan fotonya
-- lewat id media di theme_config.story[].photo, jadi baris ini tidak menyimpan nomor bab.
alter table public.invitation_media drop constraint invitation_media_kind_check;
alter table public.invitation_media add constraint invitation_media_kind_check
  check (kind in ('cover', 'groom', 'bride', 'gallery', 'qris', 'music', 'story'));

drop index public.invitation_media_single_idx;
create unique index invitation_media_single_idx on public.invitation_media (event_id, kind) where kind not in ('gallery', 'story');

create or replace function public.limit_invitation_gallery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'gallery'
    and (select count(*) from public.invitation_media where event_id = new.event_id and kind = 'gallery') >= 12 then
    raise exception 'galeri maksimal 12 foto' using errcode = 'P0001';
  end if;
  if new.kind = 'story'
    and (select count(*) from public.invitation_media where event_id = new.event_id and kind = 'story') >= 6 then
    raise exception 'foto kisah maksimal 6' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
