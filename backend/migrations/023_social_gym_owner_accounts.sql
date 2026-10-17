CREATE TABLE IF NOT EXISTS social_accounts (
  id uuid PRIMARY KEY,
  account_type text NOT NULL CHECK (account_type IN ('member', 'gym_owner')),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO social_accounts (id, account_type)
SELECT id, 'member' FROM users
ON CONFLICT (id) DO UPDATE SET account_type = EXCLUDED.account_type;

INSERT INTO social_accounts (id, account_type)
SELECT id, 'gym_owner' FROM gym_owners
ON CONFLICT (id) DO UPDATE SET account_type = EXCLUDED.account_type;

DO $$
DECLARE
  existing_fk record;
  identity_column record;
  constraint_name text;
BEGIN
  FOR existing_fk IN
    SELECT c.conrelid::regclass AS table_name, c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.contype = 'f'
      AND c.confrelid = 'users'::regclass
      AND t.relname LIKE 'social\_%' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', existing_fk.table_name, existing_fk.conname);
  END LOOP;

  FOR identity_column IN
    SELECT * FROM (VALUES
      ('social_profiles', 'user_id'),
      ('social_follows', 'follower_id'),
      ('social_follows', 'following_id'),
      ('social_reels', 'creator_id'),
      ('social_conversations', 'participant_a'),
      ('social_conversations', 'participant_b'),
      ('social_messages', 'sender_id'),
      ('social_call_signals', 'sender_id'),
      ('social_call_signals', 'recipient_id'),
      ('social_friend_requests', 'requester_id'),
      ('social_friend_requests', 'recipient_id'),
      ('social_notes', 'user_id'),
      ('social_reel_likes', 'user_id'),
      ('social_reel_comments', 'user_id'),
      ('social_reel_saves', 'user_id'),
      ('social_reel_analytics_events', 'actor_id'),
      ('social_typing_status', 'user_id')
    ) AS identity_columns(table_name, column_name)
  LOOP
    constraint_name := format('social_%s_%s_account_fkey', identity_column.table_name, identity_column.column_name);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = constraint_name
        AND conrelid = to_regclass(identity_column.table_name)
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES social_accounts(id) ON DELETE CASCADE',
        identity_column.table_name,
        constraint_name,
        identity_column.column_name
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION remove_social_account() RETURNS trigger AS $$
BEGIN
  DELETE FROM social_accounts WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_remove_social_account ON users;
CREATE TRIGGER users_remove_social_account
AFTER DELETE ON users
FOR EACH ROW EXECUTE FUNCTION remove_social_account();

DROP TRIGGER IF EXISTS gym_owners_remove_social_account ON gym_owners;
CREATE TRIGGER gym_owners_remove_social_account
AFTER DELETE ON gym_owners
FOR EACH ROW EXECUTE FUNCTION remove_social_account();
