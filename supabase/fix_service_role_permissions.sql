-- Vidpas: repair backend permissions for the Cloudflare Pages Worker.
-- Run this file in Supabase Dashboard -> SQL Editor.
-- Access is granted ONLY to service_role; no anon/public policies are created.

GRANT USAGE ON SCHEMA public TO service_role;

-- Repair permissions for every table and sequence that already exists.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Apply equivalent permissions to future objects created by the role
-- that executes this migration (normally postgres in Supabase SQL Editor).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;

-- Explicitly cover Vidpas API tables when they exist; this remains safe
-- on databases where optional tables have not been created yet.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'pastes', 'videos', 'posters', 'site_settings',
    'admin_sessions', 'admin_activity', 'ads',
    'announcements', 'online_presence'
  ]
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',
        tbl
      );
    END IF;
  END LOOP;
END
$$;
