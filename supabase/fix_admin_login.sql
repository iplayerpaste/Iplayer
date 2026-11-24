-- Vidpas: repair admin login/session storage.
-- Run in Supabase SQL Editor as project owner (postgres).

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Older installations may have created id as UUID. The Worker generates
-- 24-character opaque session IDs, so the column must be TEXT.
DO $$
DECLARE
  id_type text;
BEGIN
  SELECT data_type INTO id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'admin_sessions'
    AND column_name = 'id';

  IF id_type IS DISTINCT FROM 'text' THEN
    ALTER TABLE public.admin_sessions
      ALTER COLUMN id TYPE text USING id::text;
  END IF;
END $$;

ALTER TABLE public.admin_sessions
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.admin_sessions
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx
  ON public.admin_sessions (expires_at);

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.admin_sessions TO service_role;

-- Admin activity is best-effort, but ensure the expected table exists.
CREATE TABLE IF NOT EXISTS public.admin_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_activity ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.admin_activity TO service_role;
