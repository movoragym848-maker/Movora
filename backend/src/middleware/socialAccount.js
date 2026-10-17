import { query } from "../db/pool.js";

export async function ensureSocialAccount(req, res, next) {
  try {
    const accountType = req.user?.role === "gym_owner" ? "gym_owner" : "member";
    const accountTable = accountType === "gym_owner" ? "gym_owners" : "users";
    const accountStatus = accountType === "gym_owner" ? " AND status = 'active'" : "";
    const { rowCount } = await query(
      `SELECT id FROM ${accountTable} WHERE id = $1 AND deleted_at IS NULL${accountStatus}`,
      [req.user?.sub],
    );
    if (!rowCount) return res.status(403).json({ message: "This account is not available for social features." });

    await query(
      `INSERT INTO social_accounts (id, account_type) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET account_type = EXCLUDED.account_type`,
      [req.user.sub, accountType],
    );
    next();
  } catch (err) {
    next(err);
  }
}
