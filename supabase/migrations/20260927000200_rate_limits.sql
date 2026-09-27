-- Batas kecepatan untuk aksi publik tanpa login (RSVP). Disimpan di database karena server berjalan
-- di banyak instance serverless yang tidak berbagi memori.
create table public.rate_limit_hits (
  key text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_hits_key_idx on public.rate_limit_hits (key, created_at);
create index rate_limit_hits_created_idx on public.rate_limit_hits (created_at);

alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

-- true = diizinkan dan dicatat; false = melewati batas.
-- Advisory lock per kunci membuat hitung-lalu-catat atomik saat permintaan datang bersamaan.
create function public.hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));

  delete from public.rate_limit_hits
  where key = p_key and created_at < now() - make_interval(secs => p_window_seconds);

  -- Sesekali membuang catatan lama dari kunci lain agar tabel tidak tumbuh tanpa batas.
  if random() < 0.01 then
    delete from public.rate_limit_hits where created_at < now() - interval '1 day';
  end if;

  select count(*) into v_count from public.rate_limit_hits where key = p_key;
  if v_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_hits (key) values (p_key);
  return true;
end;
$$;

revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
