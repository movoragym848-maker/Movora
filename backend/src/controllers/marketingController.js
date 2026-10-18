import { query } from "../db/pool.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listGymCampaigns(req, res, next) {
  try {
    if (req.user?.role !== "gym_owner") {
      return res.status(403).json({ message: "Gym-owner account required." });
    }

    const gymId = req.params.gymId;
    if (!UUID_PATTERN.test(gymId) || gymId !== req.user.sub) {
      return res.status(403).json({ message: "Campaigns can only be viewed by their owning gym." });
    }

    const owner = await query(
      "SELECT 1 FROM gym_owners WHERE id = $1 AND status = 'active' AND deleted_at IS NULL",
      [gymId],
    );
    if (owner.rowCount === 0) {
      return res.status(404).json({ message: "Gym-owner account not found." });
    }

    const { rows } = await query(
      `SELECT id, gym_id, meta_campaign_id, meta_adset_id, meta_ad_id,
              campaign_name, objective, daily_budget_inr, duration_days,
              target_radius_km, latitude, longitude, image_url, primary_text,
              status, payment_order_id, payment_status, total_amount_paise, created_at
       FROM gym_campaigns
       WHERE gym_id = $1
       ORDER BY created_at DESC`,
      [gymId],
    );
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}
