-- METIS Aurora PostgreSQL starter schema
-- Use this on Amazon Aurora PostgreSQL.
-- This creates users, council_sessions, and council_messages.
-- It also seeds one initial admin account row placeholder for future DB-backed login.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metis_user_role') THEN
    CREATE TYPE metis_user_role AS ENUM ('admin', 'user');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metis_session_status') THEN
    CREATE TYPE metis_session_status AS ENUM ('active', 'archived');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metis_message_role') THEN
    CREATE TYPE metis_message_role AS ENUM ('user', 'agent', 'synthesis');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metis_agent_name') THEN
    CREATE TYPE metis_agent_name AS ENUM ('Metis', 'Athena', 'Argus', 'Loki');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'metis_recommended_action') THEN
    CREATE TYPE metis_recommended_action AS ENUM ('proceed', 'revise', 'defer', 'escalate', 'request_clarification');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) NOT NULL,
  email VARCHAR(320),
  password_hash TEXT NOT NULL,
  role metis_user_role NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_signed_in_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (LOWER(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS council_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  status metis_session_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS council_sessions_user_id_idx ON council_sessions (user_id);
CREATE INDEX IF NOT EXISTS council_sessions_last_message_at_idx ON council_sessions (last_message_at DESC);

CREATE TABLE IF NOT EXISTS council_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES council_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sequence_order INTEGER NOT NULL,
  role metis_message_role NOT NULL,
  agent_name metis_agent_name,
  content TEXT NOT NULL,
  confidence NUMERIC(4,2),
  recommended_action metis_recommended_action,
  summary_rationale TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT council_messages_sequence_order_positive CHECK (sequence_order > 0),
  CONSTRAINT council_messages_confidence_range CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT council_messages_agent_role_check CHECK (
    (role = 'user' AND agent_name IS NULL)
    OR (role IN ('agent', 'synthesis'))
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS council_messages_session_sequence_unique_idx
  ON council_messages (session_id, sequence_order);
CREATE INDEX IF NOT EXISTS council_messages_session_id_idx ON council_messages (session_id);
CREATE INDEX IF NOT EXISTS council_messages_created_at_idx ON council_messages (created_at);
CREATE INDEX IF NOT EXISTS council_messages_agent_name_idx ON council_messages (agent_name) WHERE agent_name IS NOT NULL;

-- Replace the password_hash value below with a real scrypt or bcrypt/argon2 hash before using DB-backed login.
-- For the current app version, login still uses environment variables, not this table yet.
INSERT INTO users (username, email, password_hash, role)
VALUES ('orion', 'orion@example.com', 'REPLACE_WITH_REAL_PASSWORD_HASH', 'admin')
ON CONFLICT DO NOTHING;

COMMIT;
