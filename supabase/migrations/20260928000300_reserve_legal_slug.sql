-- Halaman Syarat & Ketentuan dan Kebijakan Privasi ada di /legal/*, jadi "legal" tidak boleh dipakai sebagai alamat undangan.
alter table public.events drop constraint events_slug_not_reserved;
alter table public.events add constraint events_slug_not_reserved
  check (slug not in ('api', 'auth', 'login', 'dashboard', 'staff', 'admin', 'legal'));
