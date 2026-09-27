-- Helper otorisasi untuk policy RLS dan fungsi RPC.
-- Semuanya security definer agar pengecekan tidak memicu RLS tabel lain (dan tidak rekursif).

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Perangkat staf memakai anonymous sign-in dan tidak butuh profil.
  if new.is_anonymous then
    return new;
  end if;

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Akun terdaftar (bukan perangkat staf anonim).
create function public.is_registered_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

create function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_members
    where organization_id = p_organization_id and profile_id = auth.uid()
  );
$$;

create function public.is_org_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.org_members
    where organization_id = p_organization_id and profile_id = auth.uid() and role = 'owner'
  );
$$;

-- Pengelola event: pemilik, co-host, atau anggota organisasi WO pemilik event.
create function public.is_event_manager(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (
        e.owner_id = auth.uid()
        or exists (
          select 1 from public.event_cohosts c
          where c.event_id = e.id and c.profile_id = auth.uid()
        )
        or exists (
          select 1 from public.org_members m
          where m.organization_id = e.organization_id and m.profile_id = auth.uid()
        )
      )
  );
$$;

-- Peran staf aktif milik perangkat ini untuk satu event (link belum dicabut/kedaluwarsa).
create function public.staff_roles(p_event_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct l.role), '{}')
  from public.staff_sessions s
  join public.staff_links l on l.id = s.staff_link_id
  where s.auth_user_id = auth.uid()
    and l.event_id = p_event_id
    and l.revoked_at is null
    and l.expires_at > now();
$$;

create function public.current_staff_link(p_event_id uuid, p_role text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.id
  from public.staff_sessions s
  join public.staff_links l on l.id = s.staff_link_id
  where s.auth_user_id = auth.uid()
    and l.event_id = p_event_id
    and l.role = p_role
    and l.revoked_at is null
    and l.expires_at > now()
  order by s.created_at desc
  limit 1;
$$;

-- Pengelola event selalu lolos; staf hanya jika punya salah satu peran yang diminta.
create function public.require_event_access(p_event_id uuid, p_roles text[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_event_manager(p_event_id) or public.staff_roles(p_event_id) && p_roles) then
    raise exception 'akses ditolak' using errcode = '42501';
  end if;
end;
$$;

-- Profil boleh dilihat oleh diri sendiri, admin, rekan satu organisasi, dan sesama pengelola satu event.
create function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1
      from public.org_members me
      join public.org_members other on other.organization_id = me.organization_id
      where me.profile_id = auth.uid() and other.profile_id = p_profile_id
    )
    or exists (
      select 1
      from (
        select id as event_id from public.events where owner_id = p_profile_id
        union all
        select event_id from public.event_cohosts where profile_id = p_profile_id
      ) t
      where public.is_event_manager(t.event_id)
    );
$$;

-- Topik Realtime berformat event:<uuid>; topik lain selalu ditolak.
create function public.can_receive_event_channel(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if p_topic is null or p_topic !~ '^event:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_event_id := substr(p_topic, 7)::uuid;
  return public.is_event_manager(v_event_id) or cardinality(public.staff_roles(v_event_id)) > 0;
end;
$$;
