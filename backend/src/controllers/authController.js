import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { query } from "../db/pool.js";
import { createRefreshToken, revokeRefreshToken, signAccessToken } from "../services/tokenService.js";
import { mapUser } from "../services/userMapper.js";
import { sendOTP, verifyOTP } from "../services/otpService.js";
import { env } from "../config/env.js";

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().transform(v => v.toLowerCase()),
  password: z.string().min(6),
  phone: z.string().length(10).regex(/^\d+$/, "Phone must contain only digits"),
  userType: z.enum(['personal', 'gym_member']),
  gymName: z.string().min(2).nullable().optional(),
});

const loginSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase()),
  password: z.string().min(1),
});

async function issueSession(user, req) {
  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(user, req);
  return { user: mapUser(user), accessToken, refreshToken };
}

export async function signup(req, res, next) {
  try {
    const input = signupSchema.parse(req.body);

    let officialGymName = null;

    // If gym_member mode, validate gym exists and is active
    if (input.userType === 'gym_member') {
      if (!input.gymName || input.gymName.trim().length < 2) {
        return res.status(400).json({ message: "Gym name is required for gym member signup." });
      }

      const gymCheck = await query(
        `SELECT rg.name 
         FROM registered_gyms rg
         JOIN gym_owners go ON rg.gym_owner_id = go.id
         WHERE LOWER(rg.name) = LOWER($1) AND go.status = 'active'`,
        [input.gymName.trim()]
      );
      if (gymCheck.rowCount === 0) {
        return res.status(400).json({ message: "Gym not found or is not active. Please select from the registered gyms list." });
      }
      officialGymName = gymCheck.rows[0].name;
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const { rows } = await query(
      `INSERT INTO users (name, email, phone, password_hash, gym_name, user_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, phone, role, gym_name, user_type, created_at`,
      [input.name, input.email, input.phone, passwordHash, officialGymName, input.userType],
    );
    await query("INSERT INTO user_goals (user_id, goal) VALUES ($1, 'bulking') ON CONFLICT DO NOTHING", [rows[0].id]);
    res.status(201).json(await issueSession(rows[0], req));
  } catch (err) {
    console.error('Signup error:', err);
    if (err.code === "23505") {
      // Email or phone already exists
      return res.status(409).json({ message: "Email or phone number already registered. Try logging in." });
    }
    if (err instanceof z.ZodError) {
      // Validation error
      const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(", ");
      return res.status(400).json({ message: `Invalid input: ${messages}` });
    }
    console.error('Unexpected error in signup:', err);
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const input = loginSchema.parse(req.body);
    const { rows } = await query("SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL", [input.email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    await query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
    res.json(await issueSession(user, req));
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    if (req.body?.refreshToken) await revokeRefreshToken(req.body.refreshToken);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: "Refresh token required" });

    const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const { rows: tokenRows } = await query(
      "SELECT id, user_id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()",
      [hash]
    );
    if (tokenRows.length === 0) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    const { rows: userRows } = await query("SELECT * FROM users WHERE id = $1", [tokenRows[0].user_id]);
    if (userRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const accessToken = signAccessToken(userRows[0]);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
}

export async function checkGymRegistered(req, res, next) {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ message: "Gym name required" });
    const { rows } = await query(
      `SELECT rg.name 
       FROM registered_gyms rg
       JOIN gym_owners go ON rg.gym_owner_id = go.id
       WHERE LOWER(rg.name) = LOWER($1) AND go.status = 'active'`,
      [name.trim()]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "This gym is not registered or is not active. Please enter a registered gym." });
    }
    res.json({ ok: true, gymName: rows[0].name });
  } catch (err) {
    next(err);
  }
}

export async function getRegisteredGyms(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT rg.name 
       FROM registered_gyms rg
       JOIN gym_owners go ON rg.gym_owner_id = go.id
       WHERE go.status = 'active'
       ORDER BY rg.name ASC`
    );
    res.json(rows.map(r => r.name));
  } catch (err) {
    next(err);
  }
}

export async function sendPhoneOTP(req, res, next) {
  try {
    const { phone } = req.body;
    
    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ message: "Invalid phone number. Must be 10 digits." });
    }

    const result = await sendOTP(phone);
    
    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    res.json({ ok: true, message: result.message, mockOtp: result.mockOtp, isMock: result.isMock });
  } catch (err) {
    next(err);
  }
}

export async function verifyPhoneOTP(req, res, next) {
  try {
    const { phone, otp } = req.body;
    
    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ message: "Invalid phone number." });
    }

    if (!otp || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "Invalid OTP format. Must be 6 digits." });
    }

    const result = await verifyOTP(phone, otp);
    
    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    res.json({ ok: true, message: result.message });
  } catch (err) {
    next(err);
  }
}


