-- Penghapusan akun (misalnya permintaan hapus data, UU PDP) tidak boleh terhalang riwayat pembayaran.
-- Catatan transaksi tetap disimpan untuk pembukuan; hanya kaitannya ke profil yang dilepas.
alter table public.orders alter column profile_id drop not null;
alter table public.orders drop constraint orders_profile_id_fkey;
alter table public.orders
  add constraint orders_profile_id_fkey foreign key (profile_id) references public.profiles (id) on delete set null;
