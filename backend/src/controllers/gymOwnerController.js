import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { query, pool } from "../db/pool.js";
import { mapGymOwner } from "../services/gymOwnerMapper.js";
import { notifyGymOwnerSignup } from "../services/gymOwnerNotificationService.js";
import { sendWhatsappMessage } from "../services/whatsappService.js";

const gymOwnerSignupSchema = z.object({
  gymName: z.string().min(2),
  phone: z.string().length(10).regex(/^\d+$/, "Phone must contain only digits"),
  email: z.string().email().transform(v => v.toLowerCase()),
  password: z.string().min(6),
  city: z.string().min(2),
});

const gymOwnerLoginSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase()),
  password: z.string().min(1),
});

function signGymOwnerAccessToken(gymOwner) {
  return jwt.sign(
    { sub: gymOwner.id, email: gymOwner.email, role: "gym_owner" },
    env.jwtAccessSecret,
    { expiresIn: env.accessTokenTtl },
  );
}

async function createGymOwnerRefreshToken(gymOwner, req) {
  const tokenId = crypto.randomUUID();
  const refreshToken = jwt.sign({ sub: gymOwner.id, jti: tokenId }, env.jwtRefreshSecret, {
    expiresIn: `${env.refreshTokenTtlDays}d`,
  });
  const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
  await query(
    `INSERT INTO gym_owner_refresh_tokens (id, gym_owner_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' days')::interval)`,
    [tokenId, gymOwner.id, hash, req.headers["user-agent"] || null, req.ip || null, env.refreshTokenTtlDays],
  );
  return refreshToken;
}

async function issueGymOwnerSession(gymOwner, req) {
  const owner = mapGymOwner(gymOwner);
  const accessToken = signGymOwnerAccessToken(gymOwner);
  const refreshToken = await createGymOwnerRefreshToken(gymOwner, req);
  return { gymOwner: owner, accessToken, refreshToken, accountType: "gym_owner" };
}

export async function signupGymOwner(req, res, next) {
  try {
    const input = gymOwnerSignupSchema.parse(req.body);
    
    // Verify phone number has a verified OTP
    const otpCheck = await query(
      `SELECT 1 FROM otp_verifications 
       WHERE phone = $1 AND verified_at IS NOT NULL AND verified_at >= NOW() - INTERVAL '15 minutes'
       LIMIT 1`,
      [input.phone.trim()]
    );
    if (otpCheck.rowCount === 0) {
      return res.status(400).json({ message: "Phone number is not verified. Please complete OTP verification first." });
    }
    
    // Check if gym name is already registered
    const gymExists = await query("SELECT 1 FROM registered_gyms WHERE LOWER(name) = LOWER($1)", [input.gymName.trim()]);
    if (gymExists.rowCount > 0) {
      return res.status(409).json({ message: "A gym with this name is already registered." });
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO gym_owners (gym_name, phone, email, password_hash, city)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, gym_name, phone, email, city, status, created_at`,
        [input.gymName.trim(), input.phone.trim(), input.email, passwordHash, input.city.trim()],
      );
      
      const gymOwner = rows[0];

      await client.query(
        `INSERT INTO registered_gyms (name, city, gym_owner_id)
         VALUES ($1, $2, $3)`,
        [gymOwner.gym_name, gymOwner.city, gymOwner.id]
      );

      await client.query("COMMIT");

      await notifyGymOwnerSignup(gymOwner);
      res.status(201).json({
        ok: true,
        accountType: "gym_owner",
        status: "pending",
        message: "Approval pending. You will get a call within 24 hours from our team.",
        gymOwner: mapGymOwner(gymOwner),
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Gym owner account already exists with this email or phone." });
    if (err instanceof z.ZodError) {
      // Validation error from schema
      const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(", ");
      return res.status(400).json({ message: `Invalid input: ${messages}` });
    }
    next(err);
  }
}

export async function loginGymOwner(req, res, next) {
  try {
    const input = gymOwnerLoginSchema.parse(req.body);
    const { rows } = await query("SELECT * FROM gym_owners WHERE email = $1 AND deleted_at IS NULL", [input.email]);
    const gymOwner = rows[0];
    if (!gymOwner || !(await bcrypt.compare(input.password, gymOwner.password_hash))) {
      return res.status(401).json({ message: "Invalid gym owner email or password." });
    }

    if (gymOwner.status === "pending") {
      return res.status(403).json({
        message: "Your gym owner account is pending approval. You will get a call within 24 hours from our team."
      });
    }

    if (gymOwner.status !== "active") {
      return res.status(403).json({ message: "This gym owner account is not active. Please contact Movora support." });
    }
    await query("UPDATE gym_owners SET last_login_at = now() WHERE id = $1", [gymOwner.id]);

    res.json(await issueGymOwnerSession(gymOwner, req));
  } catch (err) {
    next(err);
  }
}

export async function getGymMembers(req, res, next) {
  try {
    if (req.user.role !== "gym_owner") {
      return res.status(403).json({ message: "Access forbidden. Gym owner role required." });
    }
    const gymOwnerId = req.user.sub;
    const { rows: ownerRows } = await query("SELECT gym_name FROM gym_owners WHERE id = $1", [gymOwnerId]);
    if (ownerRows.length === 0) {
      return res.status(404).json({ message: "Gym owner not found." });
    }
    const gymName = ownerRows[0].gym_name;

    const { rows: memberRows } = await query(
      `SELECT 
        u.id as user_id,
        u.name,
        u.phone,
        COALESCE(m.plan_label, 'No Plan') as plan,
        m.start_date,
        m.expiry_date,
        COALESCE(m.status, 'inactive') as status,
        COALESCE(GREATEST(0, m.expiry_date - CURRENT_DATE), 0) as days_remaining,
        CASE 
          WHEN m.user_id IS NULL THEN 'no_membership'
          WHEN m.expiry_date < CURRENT_DATE THEN 'expired'
          WHEN m.status = 'active' AND m.start_date <= CURRENT_DATE AND m.expiry_date >= CURRENT_DATE THEN 'active'
          ELSE 'inactive'
        END as membership_type
       FROM users u
       LEFT JOIN (
         SELECT DISTINCT ON (user_id) user_id, plan_label, start_date, expiry_date, status
         FROM memberships
         WHERE gym_name = $1
         ORDER BY user_id, expiry_date DESC
       ) m ON u.id = m.user_id
       WHERE u.gym_name = $1 AND u.user_type = 'gym_member'
       ORDER BY 
         CASE 
           WHEN m.expiry_date IS NULL THEN 0
           WHEN m.expiry_date < CURRENT_DATE THEN 1
           ELSE 2
         END DESC,
         m.expiry_date DESC NULLS LAST, 
         u.name ASC`,
      [gymName]
    );
    res.json(memberRows);
  } catch (err) {
    next(err);
  }
}

export async function getGymAttendance(req, res, next) {
  try {
    if (req.user.role !== "gym_owner") {
      return res.status(403).json({ message: "Access forbidden. Gym owner role required." });
    }

    const requestedDate = req.query.date || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return res.status(400).json({ message: "date must use YYYY-MM-DD format" });
    }

    const { rows } = await query(
      `SELECT
        a.id,
        a.timestamp as check_in_at,
        a.status,
        u.id as user_id,
        u.name,
        u.phone,
        s.id IS NOT NULL as is_staff,
        s.role as staff_role,
        COALESCE(m.plan_label, 'No Plan') as plan
       FROM attendance a
       JOIN registered_gyms g ON g.gym_id = a.gym_id AND g.gym_owner_id = $1
       JOIN users u ON u.id = a.user_id
       LEFT JOIN gym_staff s
         ON s.gym_owner_id = g.gym_owner_id
        AND (LOWER(s.email::text) = LOWER(u.email) OR s.phone = u.phone)
       LEFT JOIN LATERAL (
         SELECT plan_label
         FROM memberships
         WHERE user_id = u.id AND gym_name = g.name
         ORDER BY expiry_date DESC NULLS LAST
         LIMIT 1
       ) m ON true
       WHERE (a.timestamp AT TIME ZONE 'UTC')::date = $2::date
      ORDER BY CASE WHEN s.id IS NOT NULL THEN 0 ELSE 1 END, a.timestamp DESC`,
      [req.user.sub, requestedDate]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function logoutGymOwner(req, res, next) {
  try {
    if (req.body?.refreshToken) {
      const hash = crypto.createHash("sha256").update(req.body.refreshToken).digest("hex");
      await query("UPDATE gym_owner_refresh_tokens SET revoked_at = now() WHERE token_hash = $1", [hash]);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function refreshGymOwnerToken(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: "Refresh token required" });

    const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const { rows: tokenRows } = await query(
      "SELECT id, gym_owner_id FROM gym_owner_refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()",
      [hash]
    );
    if (tokenRows.length === 0) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    const { rows: gymOwnerRows } = await query("SELECT * FROM gym_owners WHERE id = $1", [tokenRows[0].gym_owner_id]);
    if (gymOwnerRows.length === 0) {
      return res.status(404).json({ message: "Gym owner not found" });
    }

    const accessToken = signGymOwnerAccessToken(gymOwnerRows[0]);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
}

export async function getGymRevenue(req, res, next) {
  try {
    if (req.user.role !== "gym_owner") {
      return res.status(403).json({ message: "Access forbidden. Gym owner role required." });
    }
    const gymOwnerId = req.user.sub;
    const { rows: ownerRows } = await query("SELECT gym_name FROM gym_owners WHERE id = $1", [gymOwnerId]);
    if (ownerRows.length === 0) {
      return res.status(404).json({ message: "Gym owner not found." });
    }
    const gymName = ownerRows[0].gym_name;

    // Revenue today
    const { rows: todayRow } = await query(
      `SELECT COALESCE(SUM(pt.amount_paise), 0) as total FROM payment_transactions pt
       JOIN memberships m ON pt.membership_id = m.id
       WHERE m.gym_name = $1 AND pt.status = 'paid' AND DATE(pt.paid_at) = CURRENT_DATE`,
      [gymName]
    );

    // Revenue this month
    const { rows: monthRow } = await query(
      `SELECT COALESCE(SUM(pt.amount_paise), 0) as total FROM payment_transactions pt
       JOIN memberships m ON pt.membership_id = m.id
       WHERE m.gym_name = $1 AND pt.status = 'paid' 
       AND EXTRACT(YEAR FROM pt.paid_at) = EXTRACT(YEAR FROM now())
       AND EXTRACT(MONTH FROM pt.paid_at) = EXTRACT(MONTH FROM now())`,
      [gymName]
    );

    // Revenue this year
    const { rows: yearRow } = await query(
      `SELECT COALESCE(SUM(pt.amount_paise), 0) as total FROM payment_transactions pt
       JOIN memberships m ON pt.membership_id = m.id
       WHERE m.gym_name = $1 AND pt.status = 'paid'
       AND EXTRACT(YEAR FROM pt.paid_at) = EXTRACT(YEAR FROM now())`,
      [gymName]
    );

    res.json({
      today: parseInt(todayRow[0].total || 0),
      thisMonth: parseInt(monthRow[0].total || 0),
      thisYear: parseInt(yearRow[0].total || 0)
    });
  } catch (err) {
    next(err);
  }
}

export async function sendMemberReminder(req, res, next) {
  try {
    if (req.user.role !== "gym_owner") {
      return res.status(403).json({ message: "Access forbidden. Gym owner role required." });
    }

    const { userId, memberName, gymName } = req.body;
    if (!userId || !memberName || !gymName) {
      return res.status(400).json({ message: "userId, memberName, and gymName are required" });
    }

    // Get user phone number
    const { rows: userRows } = await query("SELECT phone FROM users WHERE id = $1", [userId]);
    if (userRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const phone = userRows[0].phone;
    if (!phone) {
      return res.status(400).json({ 
        message: "User phone number not available",
        errorCode: "PHONE_MISSING"
      });
    }

    // Validate phone format - Indian number: 10 digits starting with 6-9
    const cleanPhone = phone.replace(/\D/g, '');
    const isValidPhone = /^[6-9]\d{9}$/.test(cleanPhone);
    if (!isValidPhone) {
      return res.status(400).json({ 
        message: `Invalid phone number format: ${phone}. Please ensure the phone number is a valid Indian mobile number (10 digits starting with 6-9).`,
        errorCode: "INVALID_PHONE_FORMAT",
        phone: phone
      });
    }

    // Craft reminder message
    const message = `Hi ${memberName}, 👋\n\nYour scheduled booking at ${gymName} is expiring soon! 🏋️\n\nPlease update your access schedule at the counter.\n\nThank you!`;

    // Send message via WhatsApp
    const success = await sendWhatsappMessage(message, `+91${cleanPhone}`);

    if (success) {
      res.json({ ok: true, message: "Reminder sent successfully" });
    } else {
      res.status(500).json({ 
        ok: false, 
        message: "WhatsApp service is temporarily unavailable. Please try again in a few moments.",
        errorCode: "WHATSAPP_SERVICE_FAILED",
        phone: phone
      });
    }
  } catch (err) {
    next(err);
  }
}

export async function getPaymentsByMonth(req, res, next) {
  try {
    if (req.user.role !== "gym_owner") {
      return res.status(403).json({ message: "Access forbidden. Gym owner role required." });
    }
    const gymOwnerId = req.user.sub;
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ message: "Year and month are required" });
    }

    const { rows: ownerRows } = await query("SELECT gym_name FROM gym_owners WHERE id = $1", [gymOwnerId]);
    if (ownerRows.length === 0) {
      return res.status(404).json({ message: "Gym owner not found." });
    }
    const gymName = ownerRows[0].gym_name;

    // Get all payments for the specified month with user and membership details
    const { rows: payments } = await query(
      `SELECT 
        pt.id,
        pt.amount_paise,
        pt.paid_at,
        pt.status,
        m.plan_label as plan_name,
        m.amount_paise as plan_amount,
        u.name,
        u.email,
        u.phone
       FROM payment_transactions pt
       JOIN memberships m ON pt.membership_id = m.id
       JOIN users u ON m.user_id = u.id
       WHERE m.gym_name = $1 
       AND pt.status = 'paid'
       AND EXTRACT(YEAR FROM pt.paid_at) = $2
       AND EXTRACT(MONTH FROM pt.paid_at) = $3
       ORDER BY pt.paid_at DESC`,
      [gymName, parseInt(year), parseInt(month)]
    );

    res.json({ 
      ok: true,
      payments: payments.map(p => ({
        id: p.id,
        amount: parseInt(p.amount_paise || 0),
        paidAt: p.paid_at,
        status: p.status,
        planName: p.plan_name,
        userName: p.name,
        userEmail: p.email,
        userPhone: p.phone
      }))
    });
  } catch (err) {
    next(err);
  }
}

export async function renewGymMember(req, res, next) {
  try {
    if (req.user.role !== "gym_owner") {
      return res.status(403).json({ message: "Access forbidden. Gym owner role required." });
    }
    const gymOwnerId = req.user.sub;
    const { userId, planId, planLabel, months, amount } = req.body;

    if (!userId || !planId || !planLabel || !months || !amount) {
      return res.status(400).json({ message: "Missing required fields: userId, planId, planLabel, months, amount" });
    }

    // Get gym name from gym owner
    const { rows: ownerRows } = await query("SELECT gym_name FROM gym_owners WHERE id = $1", [gymOwnerId]);
    if (ownerRows.length === 0) {
      return res.status(404).json({ message: "Gym owner not found." });
    }
    const gymName = ownerRows[0].gym_name;

    // Check if user exists in the database and is a valid UUID
    let userExists = false;
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(userId);
    if (isUuid) {
      const { rowCount } = await query("SELECT 1 FROM users WHERE id = $1", [userId]);
      userExists = rowCount > 0;
    }

    const today = new Date();
    const expiryDate = new Date(today);
    expiryDate.setMonth(expiryDate.getMonth() + parseInt(months));
    const startDateStr = today.toISOString().split('T')[0];
    const expiryDateStr = expiryDate.toISOString().split('T')[0];

    if (!userExists) {
      // Graceful success for demo/mock users
      return res.json({
        ok: true,
        message: "Membership renewed successfully (Demo Mode)",
        membership: {
          start_date: startDateStr,
          expiry_date: expiryDateStr,
          plan: planLabel,
          status: "active"
        }
      });
    }

    // Start a transaction to insert membership and payment
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const amountPaise = parseInt(amount) * 100;

      // Deactivate any existing active memberships for this user in this gym
      await client.query(
        "UPDATE memberships SET status = 'expired' WHERE user_id = $1 AND gym_name = $2 AND status = 'active'",
        [userId, gymName]
      );

      // Insert new active membership
      const { rows: membershipRows } = await client.query(
        `INSERT INTO memberships (user_id, gym_name, plan_id, plan_label, months, amount_paise, status, start_date, expiry_date)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8)
         RETURNING id`,
        [userId, gymName, planId, planLabel, parseInt(months), amountPaise, startDateStr, expiryDateStr]
      );
      const membershipId = membershipRows[0].id;

      // Insert payment transaction (cash provider)
      const receiptId = `receipt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      await client.query(
        `INSERT INTO payment_transactions (user_id, membership_id, receipt_id, provider, amount_paise, status, paid_at)
         VALUES ($1, $2, $3, 'cash', $4, 'paid', now())`,
        [userId, membershipId, receiptId, amountPaise]
      );

      await client.query("COMMIT");

      res.json({
        ok: true,
        message: "Membership renewed successfully",
        membership: {
          start_date: startDateStr,
          expiry_date: expiryDateStr,
          plan: planLabel,
          status: "active"
        }
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

export async function getGymStaff(req, res, next) {
  try {
    if (req.user.role !== "gym_owner") {
      return res.status(403).json({ message: "Access forbidden. Gym owner role required." });
    }

    const { rows } = await query(
      `SELECT id, name, email, phone, role, created_at
       FROM gym_staff
       WHERE gym_owner_id = $1
       ORDER BY created_at DESC, name ASC`,
      [req.user.sub]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function addGymStaff(req, res, next) {
  try {
    if (req.user.role !== "gym_owner") {
      return res.status(403).json({ message: "Access forbidden. Gym owner role required." });
    }

    const { memberId, name, email, phone, role } = req.body;
    const cleanName = name?.trim();
    const cleanEmail = email?.trim().toLowerCase();
    const cleanPhone = phone?.replace(/\D/g, "");
    const cleanRole = role?.trim();

    if (memberId) {
      const { rows: ownerRows } = await query("SELECT gym_name FROM gym_owners WHERE id = $1", [req.user.sub]);
      if (ownerRows.length === 0) return res.status(404).json({ message: "Gym owner not found." });

      const { rows: memberRows } = await query(
        `SELECT id, name, email, phone
         FROM users
         WHERE id = $1 AND gym_name = $2 AND user_type = 'gym_member'`,
        [memberId, ownerRows[0].gym_name]
      );
      if (memberRows.length === 0) return res.status(404).json({ message: "Selected member was not found in your gym." });

      const member = memberRows[0];
      if (!cleanRole) return res.status(400).json({ message: "A staff role is required." });
      const { rows } = await query(
        `INSERT INTO gym_staff (gym_owner_id, name, email, phone, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, phone, role, created_at`,
        [req.user.sub, member.name, member.email, member.phone, cleanRole]
      );
      return res.status(201).json(rows[0]);
    }

    if (!cleanName || !cleanEmail || !cleanPhone || !cleanRole) {
      return res.status(400).json({ message: "Name, email, phone number, and role are required." });
    }
    if (cleanName.length < 2 || cleanName.length > 100) {
      return res.status(400).json({ message: "Name must be between 2 and 100 characters." });
    }
    if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ message: "Invalid Indian phone number. Must be exactly 10 digits starting with 6-9." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    const { rows } = await query(
      `INSERT INTO gym_staff (gym_owner_id, name, email, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, phone, role, created_at`,
      [req.user.sub, cleanName, cleanEmail, cleanPhone, cleanRole]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "A staff member with this email or phone already exists." });
    }
    next(err);
  }
}

export async function deleteGymStaff(req, res, next) {
  try {
    if (req.user.role !== "gym_owner") {
      return res.status(403).json({ message: "Access forbidden. Gym owner role required." });
    }
    const { rowCount } = await query(
      "DELETE FROM gym_staff WHERE id = $1 AND gym_owner_id = $2",
      [req.params.staffId, req.user.sub]
    );
    if (rowCount === 0) return res.status(404).json({ message: "Staff member not found." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function addGymMember(req, res, next) {
  try {
    if (req.user.role !== "gym_owner") {
      return res.status(403).json({ message: "Access forbidden. Gym owner role required." });
    }
    const gymOwnerId = req.user.sub;
    const { rows: ownerRows } = await query("SELECT gym_name FROM gym_owners WHERE id = $1", [gymOwnerId]);
    if (ownerRows.length === 0) {
      return res.status(404).json({ message: "Gym owner not found." });
    }
    const gymName = ownerRows[0].gym_name;

    const { firstName, lastName, email, phone } = req.body;
    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({ message: "First name, last name, email, and phone number are required." });
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Basic phone validation
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ message: "Invalid Indian phone number. Must be 10 digits starting with 6-9." });
    }

    // Check if email or phone is already registered
    const userCheck = await query(
      "SELECT 1 FROM users WHERE email = $1 OR phone = $2",
      [email.toLowerCase().trim(), cleanPhone]
    );
    if (userCheck.rowCount > 0) {
      return res.status(409).json({ message: "Email or phone number is already registered." });
    }

    // Hash a default password
    const passwordHash = await bcrypt.hash("RsGymMember123!", 12);

    // Insert new user
    const { rows } = await query(
      `INSERT INTO users (name, email, phone, password_hash, gym_name, user_type)
       VALUES ($1, $2, $3, $4, $5, 'gym_member')
       RETURNING id, name, email, phone`,
      [fullName, email.toLowerCase().trim(), cleanPhone, passwordHash, gymName]
    );

    const newUser = rows[0];

    // Initialize user goal to bulking as in standard signup
    await query("INSERT INTO user_goals (user_id, goal) VALUES ($1, 'bulking') ON CONFLICT DO NOTHING", [newUser.id]);

    res.status(201).json({
      message: "Member added successfully.",
      member: {
        user_id: newUser.id,
        name: newUser.name,
        phone: newUser.phone,
        email: newUser.email,
        plan: "No Plan",
        status: "inactive",
        days_remaining: 0,
        membership_type: "no_membership"
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function updateGymMember(req, res, next) {
  try {
    if (req.user.role !== "gym_owner") {
      return res.status(403).json({ message: "Access forbidden. Gym owner role required." });
    }
    const { userId, firstName, lastName, email, phone } = req.body;
    if (!userId || !firstName?.trim() || !lastName?.trim() || !email?.trim() || !phone?.trim()) {
      return res.status(400).json({ message: "All member profile fields are required." });
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ message: "Invalid Indian phone number. Must be 10 digits starting with 6-9." });
    }
    const { rows: ownerRows } = await query("SELECT gym_name FROM gym_owners WHERE id = $1", [req.user.sub]);
    if (ownerRows.length === 0) return res.status(404).json({ message: "Gym owner not found." });
    const duplicate = await query(
      "SELECT 1 FROM users WHERE (email = $1 OR phone = $2) AND id <> $3",
      [email.trim().toLowerCase(), cleanPhone, userId]
    );
    if (duplicate.rowCount > 0) return res.status(409).json({ message: "Email or phone number is already registered." });
    const updated = await query(
      `UPDATE users SET name = $1, email = $2, phone = $3
       WHERE id = $4 AND gym_name = $5 AND user_type = 'gym_member'
       RETURNING id AS user_id, name, email, phone`,
      [`${firstName.trim()} ${lastName.trim()}`, email.trim().toLowerCase(), cleanPhone, userId, ownerRows[0].gym_name]
    );
    if (updated.rowCount === 0) return res.status(404).json({ message: "Member not found in your gym." });
    return res.json(updated.rows[0]);
  } catch (err) {
    next(err);
  }
}

export async function cancelGymMember(req, res, next) {
  try {
    if (req.user.role !== "gym_owner") {
      return res.status(403).json({ message: "Access forbidden. Gym owner role required." });
    }
    const gymOwnerId = req.user.sub;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    // Get gym name from gym owner
    const { rows: ownerRows } = await query("SELECT gym_name FROM gym_owners WHERE id = $1", [gymOwnerId]);
    if (ownerRows.length === 0) {
      return res.status(404).json({ message: "Gym owner not found." });
    }
    const gymName = ownerRows[0].gym_name;

    // Check if user exists in the database
    let userExists = false;
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(userId);
    if (isUuid) {
      const { rowCount } = await query("SELECT 1 FROM users WHERE id = $1", [userId]);
      userExists = rowCount > 0;
    }

    if (!userExists) {
      return res.json({ ok: true, message: "Membership cancelled successfully (Demo Mode)" });
    }

    // Set membership status to expired and expiry_date to yesterday
    await query(
      "UPDATE memberships SET status = 'expired', expiry_date = CURRENT_DATE - INTERVAL '1 day' WHERE user_id = $1 AND gym_name = $2 AND status = 'active'",
      [userId, gymName]
    );

    res.json({ ok: true, message: "Membership cancelled successfully" });
  } catch (err) {
    next(err);
  }
}



