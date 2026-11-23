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
 ('site_name','ePlayer'),
 ('telegram_url','https://t.me/iplayerch'),
 ('whatsapp_url','https://whatsapp.com/channel/0029Vb9Mk9PGZNCjff7KpY3F')
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
  placement text not null check (placement in ('paste_top','paste_middle','paste_bottom','home','tag')),
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
