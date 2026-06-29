import twilio from 'twilio';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { sendWhatsappMessage } from './whatsappService.js';

const twilioClient = twilio(env.twilioAccountSid, env.twilioAuthToken);

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP via MSG91 (Primary for India)
async function sendViaMsg91(phoneNumber, otp) {
  try {
    if (!env.msg91Token) {
      console.warn('⚠️  MSG91 token not configured');
      return null;
    }

    console.log('📤 Attempting MSG91 API call...');

    // Try MSG91's control subdomain with X-Auth-Key header
    const formData = new URLSearchParams();
    formData.append('mobile', `91${phoneNumber}`);
    formData.append('otp', otp);

    console.log('📨 MSG91 Endpoint: https://control.msg91.com/api/sendotp');

    const response = await fetch('https://control.msg91.com/api/sendotp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Auth-Key': env.msg91Token
      },
      body: formData.toString()
    });

    const responseText = await response.text();
    console.log('📥 MSG91 Status:', response.status);
    console.log('📥 MSG91 Response:', responseText.substring(0, 500));

    // Check for success
    if (response.ok || responseText.includes('success') || responseText.includes('1801')) {
      console.log(`✓ OTP sent via MSG91 to ${phoneNumber}`);
      return { success: true, provider: 'MSG91' };
    } else {
      console.warn('❌ MSG91 Error:', responseText.substring(0, 300));
      return null;
    }
  } catch (err) {
    console.error('❌ MSG91 Network Error:', err.message);
    return null;
  }
}

// Send OTP via Twilio (Fallback)
async function sendViaTwilio(phoneNumber, otp) {
  try {
    if (!env.twilioAccountSid || !env.twilioAuthToken) {
      return null;
    }

    // Add country code (91 for India) if not already present
    let toNumber = phoneNumber;
    if (!toNumber.startsWith('+')) {
      toNumber = `+91${toNumber}`; // Prepend +91 for Indian numbers
    }

    if (env.twilioPhoneNumber) {
      const message = await twilioClient.messages.create({
        body: `Your Movora OTP is: ${otp}. Valid for 10 minutes. Do not share this code.`,
        from: env.twilioPhoneNumber,
        to: toNumber
      });

      console.log(`✓ OTP sent via Twilio SMS to ${phoneNumber}, Message SID: ${message.sid}`);
      return { success: true, provider: 'Twilio_SMS', messageId: message.sid };
    } else if (env.twilioWhatsappFrom) {
      const from = env.twilioWhatsappFrom.startsWith('whatsapp:') ? env.twilioWhatsappFrom : `whatsapp:${env.twilioWhatsappFrom.trim()}`;
      const to = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`;

      const message = await twilioClient.messages.create({
        body: `Your Movora OTP is: ${otp}. Valid for 10 minutes. Do not share this code.`,
        from: from,
        to: to
      });

      console.log(`✓ OTP sent via Twilio WhatsApp to ${phoneNumber}, Message SID: ${message.sid}`);
      return { success: true, provider: 'Twilio_WhatsApp', messageId: message.sid };
    }

    return null;
  } catch (err) {
    console.error('Twilio Error:', err.message);
    return null;
  }
}

// Send OTP via SMS/WhatsApp
export async function sendOTP(phoneNumber) {
  try {
    const otp = generateOTP();

    // Store OTP in database
    await query(
      `INSERT INTO otp_verifications (phone, otp_code, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [phoneNumber, otp]
    );

    const whatsappMessage = `Your Movora booking confirmation ID is ${otp}.`;

    // 1. Try WhatsApp first
    console.log(`📤 Attempting to send OTP via WhatsApp to ${phoneNumber}...`);
    const whatsappSuccess = await sendWhatsappMessage(whatsappMessage, phoneNumber);
    if (whatsappSuccess) {
      return { 
        success: true, 
        message: `✅ OTP sent via WhatsApp to ${phoneNumber}.`,
        isMock: false
      };
    }

    // 2. Default: Mock Mode Fallback when WhatsApp is unavailable/failed
    console.log(`✅ [MOCK OTP MODE] Phone: ${phoneNumber} | OTP: ${otp} (valid for 10 minutes)`);
    return { 
      success: true, 
      message: `✅ WhatsApp delivery unavailable. OTP generated in Mock Mode.`,
      mockOtp: otp,
      isMock: true
    };
  } catch (err) {
    console.error('Error in sendOTP:', err);
    return { success: false, message: err.message };
  }
}

// Verify OTP
export async function verifyOTP(phoneNumber, otpCode) {
  try {
    // Get the latest OTP for this phone
    const { rows } = await query(
      `SELECT id, otp_code, expires_at, attempts, max_attempts, verified_at 
       FROM otp_verifications 
       WHERE phone = $1 AND verified_at IS NULL
       ORDER BY created_at DESC 
       LIMIT 1`,
      [phoneNumber]
    );

    if (rows.length === 0) {
      return { success: false, message: 'No OTP found for this phone number' };
    }

    const otpRecord = rows[0];

    // Check if OTP is expired
    if (new Date(otpRecord.expires_at) < new Date()) {
      return { success: false, message: 'OTP has expired. Please request a new one.' };
    }

    // Check attempts
    if (otpRecord.attempts >= otpRecord.max_attempts) {
      return { success: false, message: 'Maximum OTP attempts exceeded. Please request a new one.' };
    }

    // Check if OTP matches
    if (otpRecord.otp_code !== otpCode.trim()) {
      // Increment attempts
      await query(
        `UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1`,
        [otpRecord.id]
      );
      return { success: false, message: 'Invalid OTP. Please try again.' };
    }

    // Mark OTP as verified
    await query(
      `UPDATE otp_verifications SET verified_at = NOW() WHERE id = $1`,
      [otpRecord.id]
    );

    return { success: true, message: 'OTP verified successfully' };
  } catch (err) {
    console.error('Error verifying OTP:', err);
    return { success: false, message: err.message };
  }
}

// Clean up old OTPs (run periodically)
export async function cleanupExpiredOTPs() {
  try {
    const { rowCount } = await query(
      `DELETE FROM otp_verifications 
       WHERE expires_at < NOW() - INTERVAL '1 hour'`
    );
    console.log(`Cleaned up ${rowCount} expired OTPs`);
  } catch (err) {
    console.error('Error cleaning up OTPs:', err);
  }
}
