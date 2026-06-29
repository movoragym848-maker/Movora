-- Add user_type column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type text DEFAULT 'gym_member' CHECK (user_type IN ('personal', 'gym_member'));

-- Add index for querying by user_type
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);

-- Add compound index for gym_name and user_type (for gym owner member listing)
CREATE INDEX IF NOT EXISTS idx_users_gym_name_user_type ON users(gym_name, user_type);
