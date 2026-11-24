create extension if not exists pgcrypto;

create table if not exists public.pastes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null default '',
  content text not null,
  password_hash text,
  visibility text not null default 'public' check (visibility in ('public','private')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  views bigint not null default 0
);
create index if not exists pastes_public_created_idx on public.pastes (created_at desc) where visibility='public';
create index if not exists pastes_slug_idx on public.pastes(slug);
create index if not exists pastes_tags_gin_idx on public.pastes using gin(tags);

create table if not exists public.site_settings (
  key text primary key,
  value text not null default ''
);
insert into public.site_settings(key,value) values
 ('site_name','Vidpas'),
 ('telegram_url','https://t.me/iplayerch'),
 ('whatsapp_url','https://whatsapp.com/channel/0029Vb9Mk9PGZNCjff7KpY3F'),
 ('facebook_url',''),
 ('youtube_url','')
on conflict (key) do nothing;

create table if not exists public.admin_sessions (
  id text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_sessions_expiry_idx on public.admin_sessions(expires_at);

create table if not exists public.admin_activity (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  placement text not null default 'site_all',
  ad_type text not null default 'banner',
  size text not null default 'responsive',
  script text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.pastes enable row level security;
alter table public.site_settings enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_activity enable row level security;
alter table public.ads enable row level security;

-- No public table policies are created. Access is performed by the Worker
-- using the Supabase service role key, which must remain a Worker secret.


-- Video widget content managed from the admin panel.
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text not null default '',
  embed_url text not null,
  thumbnail_url text not null default '',
  orientation text not null default 'horizontal' check (orientation in ('horizontal','vertical')),
  download_url text not null default '',
  unlock_tasks jsonb not null default '[]'::jsonb,
  published boolean not null default true,
  views bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists videos_published_created_idx on public.videos(created_at desc) where published=true;

-- Broadcast announcements remain visible in the archive until admin deletes them.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Anonymous presence heartbeat; records expire from online counts after 2 minutes.
create table if not exists public.online_presence (
  visitor_id text primary key,
  last_seen timestamptz not null default now()
);
create index if not exists online_presence_last_seen_idx on public.online_presence(last_seen desc);

alter table public.videos enable row level security;
alter table public.announcements enable row level security;
alter table public.online_presence enable row level security;

-- Compatibility migration for projects where the original ads table already exists.
alter table public.ads add column if not exists ad_type text not null default 'banner';
alter table public.ads add column if not exists size text not null default 'responsive';
alter table public.ads alter column placement drop default;
do $$ begin
  if exists (select 1 from pg_constraint where conname='ads_placement_check' and conrelid='public.ads'::regclass) then
    alter table public.ads drop constraint ads_placement_check;
  end if;
end $$;


-- Vidpas poster-link library and video engagement counters.
create table if not exists public.posters (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text not null default '',
  image_url text not null,
  target_url text not null,
  author text not null default 'Komunitas',
  published boolean not null default true,
  views bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists posters_published_created_idx on public.posters(created_at desc) where published=true;
alter table public.posters enable row level security;
alter table public.videos add column if not exists downloads bigint not null default 0;
alter table public.videos add column if not exists shares bigint not null default 0;
alter table public.videos add column if not exists likes bigint not null default 0;
