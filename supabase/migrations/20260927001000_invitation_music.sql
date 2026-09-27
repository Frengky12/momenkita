-- Musik latar undangan (PRD §5.1): satu file audio per event (indeks unik non-galeri sudah berlaku), tanpa thumbnail
-- dan tanpa dimensi. Hak cipta lagu tanggung jawab host.
alter table public.invitation_media drop constraint invitation_media_kind_check;
alter table public.invitation_media add constraint invitation_media_kind_check
  check (kind in ('cover', 'groom', 'bride', 'gallery', 'qris', 'music'));

alter table public.invitation_media
  alter column key_thumb drop not null,
  alter column width drop not null,
  alter column height drop not null;

-- Foto wajib punya thumbnail dan dimensi; musik wajib tidak punya.
alter table public.invitation_media add constraint invitation_media_shape check (
  case
    when kind = 'music' then key_thumb is null and width is null and height is null
    else key_thumb is not null and width is not null and height is not null
  end
);
