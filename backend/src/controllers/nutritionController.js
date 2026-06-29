import { z } from "zod";
import { query } from "../db/pool.js";

const profileSchema = z.object({
  gender: z.enum(["male", "female", "other"]),
  age: z.coerce.number().int().min(5).max(120),
  heightCm: z.coerce.number().positive(),
  weightKg: z.coerce.number().positive(),
  activity: z.enum(["sedentary", "light", "moderate", "active", "very_active"]),
  targetCalories: z.coerce.number().int().positive().optional(),
});

const foodSchema = z.object({
  meal: z.enum(["Breakfast", "Lunch", "Dinner", "Snacks"]),
  name: z.string().min(1),
  unit: z.string().optional(),
  calories: z.coerce.number().int().nonnegative(),
  eatenOn: z.string().date().optional(),
});

export async function saveCalorieProfile(req, res, next) {
  try {
    const p = profileSchema.parse(req.body);
    
    // First, check if user already has a profile
    const { rows: existingRows } = await query(
      `SELECT id FROM calorie_profiles WHERE user_id = $1 LIMIT 1`,
      [req.user.sub]
    );
    
    let result;
    
    if (existingRows.length > 0) {
      // Update existing profile
      const { rows } = await query(
        `UPDATE calorie_profiles 
         SET gender = $2, age = $3, height_cm = $4, weight_kg = $5, activity = $6, target_calories = $7, created_at = now()
         WHERE user_id = $1 
         RETURNING *`,
        [req.user.sub, p.gender, p.age, p.heightCm, p.weightKg, p.activity, p.targetCalories || null]
      );
      result = rows[0];
    } else {
      // Create new profile
      const { rows } = await query(
        `INSERT INTO calorie_profiles (user_id, gender, age, height_cm, weight_kg, activity, target_calories)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.sub, p.gender, p.age, p.heightCm, p.weightKg, p.activity, p.targetCalories || null]
      );
      result = rows[0];
    }
    
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function addFoodEntry(req, res, next) {
  try {
    const f = foodSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO food_entries (user_id, meal, name, unit, calories, eaten_on)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_DATE)) RETURNING *`,
      [req.user.sub, f.meal, f.name, f.unit || null, f.calories, f.eatenOn || null],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function listFoodEntries(req, res, next) {
  try {
    const { rows } = await query("SELECT * FROM food_entries WHERE user_id = $1 ORDER BY eaten_on DESC, created_at DESC", [req.user.sub]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}
