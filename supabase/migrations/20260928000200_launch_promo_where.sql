-- Supabase memasang pg_safeupdate untuk koneksi API: UPDATE tanpa WHERE ditolak, termasuk di dalam fungsi.
-- Tabel launch_promo hanya satu baris, tetapi WHERE tetap wajib.
create or replace function public.admin_set_launch_promo(p_active boolean, p_package text, p_per_account integer, p_ends_at timestamptz, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  update public.launch_promo
  set active = p_active, package = p_package, per_account = p_per_account, ends_at = p_ends_at, updated_at = now(), updated_by = auth.uid()
  where id;
  perform public.log_admin_action('set_launch_promo', p_reason,
    p_details => jsonb_build_object('active', p_active, 'package', p_package, 'per_account', p_per_account, 'ends_at', p_ends_at));
end;
$$;
