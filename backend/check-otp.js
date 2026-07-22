import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '<DB_PASSWORD>',
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT ? parseInt(process.env.PG_PORT) : 5432,
  database: process.env.PG_DATABASE || 'Movora'
});

async function checkOTP() {
  try {
    const result = await pool.query(
      `SELECT phone, otp_code, created_at, expires_at, verified_at FROM otp_verifications 
       WHERE phone = '1234567890' 
       ORDER BY created_at DESC LIMIT 5`
    );
    console.log('OTP Records found:', result.rows);
    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
}

checkOTP();
