export function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    userType: row.user_type,
    gymName: row.gym_name,
    joinedAt: row.created_at,
  };
}
