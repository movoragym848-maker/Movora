import { query } from './src/db/pool.js';

const result = await query("SELECT otp_code FROM otp_verifications WHERE phone = $1 ORDER BY created_at DESC LIMIT 1", ['5555555555']);
console.log('OTP:', result.rows[0]?.otp_code || 'NOT FOUND');
process.exit(0);
