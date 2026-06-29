# Complete OTP Phone Verification Implementation Guide

## 🎯 What's Been Done

### Backend Setup ✅
- ✅ Installed Twilio SDK (`twilio` package)
- ✅ Created OTP database table with expiration tracking
- ✅ Built OTP service with send/verify/cleanup functionality
- ✅ Added OTP endpoints: `/auth/send-otp` and `/auth/verify-otp`
- ✅ Implemented automatic OTP cleanup on server startup & hourly
- ✅ Added development mode (mock OTP) when Twilio not configured

### Frontend Setup ✅
- ✅ Updated AuthScreen with real OTP flow
- ✅ Added 2-minute OTP timer with resend option
- ✅ Integrated `sendPhoneOTP` and `verifyPhoneOTP` API calls
- ✅ Updated signup process to send real OTP instead of generating locally
- ✅ Added user feedback on OTP status

## 🚀 Quick Start (3 Steps)

### Step 1: Run Database Migration
```bash
cd backend
npm run migrate
```
This creates the `otp_verifications` table.

### Step 2: Add Twilio Credentials to `.env`
Create or update `backend/.env`:
```env
# Twilio SMS Configuration
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
```

### Step 3: Test the Flow
1. Start backend: `npm run dev` (in backend folder)
2. Start frontend: `npm run dev` (in frontend folder)
3. Go to signup page
4. Enter details and click "Send OTP & Continue"
5. Receive SMS with OTP
6. Enter OTP to complete signup

## 🔐 How It Works

### Sign-Up Flow
```
1. User enters: name, email, password, phone, gym
2. Click "Send OTP & Continue"
3. Backend generates 6-digit OTP → Sends via SMS → Shows success
4. User receives SMS with OTP
5. User enters OTP
6. Backend verifies OTP (max 5 attempts, 10 min validity)
7. If valid → Account created & logged in
8. If invalid → Shows error + can resend
```

### OTP Characteristics
- **Length**: 6 digits
- **Validity**: 10 minutes
- **Max Attempts**: 5
- **Resend**: Available after timer expires
- **Auto-cleanup**: After 1 hour of expiration

## 📱 Development Mode (No Twilio Needed)

If you skip Twilio setup, the system uses **mock OTP mode**:
1. OTP is generated and stored in database
2. **Check server console logs** for the OTP code
3. Use that code to complete signup
4. Appears as: `[MOCK OTP] 9876543210: 123456 (valid for 10 minutes)`

Example in terminal:
```
[MOCK OTP] 9876543210: 482916 (valid for 10 minutes)
```

## 🎫 Getting Twilio Credentials

### Create Free Twilio Account (15 min setup)
1. Go to https://www.twilio.com/try-twilio
2. Sign up with email (gets $15 free credit)
3. Verify email
4. Go to https://www.twilio.com/console
5. Copy:
   - **Account SID** (starts with AC...)
   - **Auth Token** (long alphanumeric string)
6. Get a phone number:
   - In Console → Phone Numbers → Buy a Number
   - Choose +1 (US) or your country
   - Copy the number (e.g., +12125551234)

## 📊 API Endpoints

### Send OTP
```
POST /api/auth/send-otp
Content-Type: application/json

{
  "phone": "9876543210"
}

Response:
{
  "ok": true,
  "message": "OTP sent successfully"
}
```

### Verify OTP
```
POST /api/auth/verify-otp
Content-Type: application/json

{
  "phone": "9876543210",
  "otp": "123456"
}

Response:
{
  "ok": true,
  "message": "OTP verified successfully"
}
```

## 🗄️ Database Schema

### otp_verifications Table
```sql
- id (PK): Serial
- phone: VARCHAR(20) - Phone number
- otp_code: VARCHAR(6) - 6-digit OTP
- created_at: TIMESTAMP - When OTP was created
- expires_at: TIMESTAMP - Expires in 10 minutes
- verified_at: TIMESTAMP - When verified (NULL if not yet)
- attempts: INT - Failed verification attempts
- max_attempts: INT - Max allowed (5)
```

## 🧪 Testing Scenarios

### Test Case 1: Successful Signup
- Phone: `9876543210`
- Enter valid OTP
- Expected: Account created ✓

### Test Case 2: Invalid OTP
- Phone: `9876543210`
- Enter wrong OTP
- Expected: "Invalid OTP. Please try again." (Attempt counter increases)

### Test Case 3: Max Attempts Exceeded
- Phone: `9876543210`
- Wrong OTP 5 times
- Expected: "Maximum OTP attempts exceeded. Please request a new one."

### Test Case 4: Expired OTP
- Phone: `9876543210`
- Wait 10+ minutes
- Try to verify
- Expected: "OTP has expired. Please request a new one."

### Test Case 5: Resend OTP
- Send OTP
- Wait for timer to expire (120 seconds)
- Click "Resend OTP"
- Expected: New OTP sent, new timer started

## 🐛 Troubleshooting

### "SMS service not configured"
**Solution**: Add Twilio credentials to `.env` or remove them to use mock mode

### "OTP sent" but no SMS received
**Solution**: 
- Check phone number format (must be 10 digits)
- Check Twilio account balance/credit
- Check Twilio trial mode restrictions
- Check `+91` country code is correct for your region

### Server doesn't start
**Solution**: Run migration first:
```bash
npm run migrate
```

### "Maximum OTP attempts exceeded"
**Solution**: Click "Resend OTP" to get a new code and reset attempts

## 📁 Files Modified/Created

### Created:
- `backend/migrations/007_otp_table.sql` - OTP storage table
- `backend/src/services/otpService.js` - OTP logic

### Modified:
- `backend/src/controllers/authController.js` - Added OTP endpoints
- `backend/src/routes/authRoutes.js` - Added OTP routes
- `backend/src/config/env.js` - Added Twilio config
- `backend/src/server.js` - Added OTP cleanup scheduler
- `frontend/src/services/api.js` - Added OTP API calls
- `frontend/src/components/auth/AuthScreen.jsx` - Integrated OTP flow

## 🎓 Next Steps

### Optional Enhancements
1. **Email OTP**: Add email verification as alternative
2. **Two-Factor Auth**: Add OTP as 2FA option in login
3. **Rate Limiting**: Limit OTP requests per phone/IP
4. **Branding**: Customize SMS message text
5. **Analytics**: Track OTP success/failure rates

### For Gym Owners
Add same OTP flow to gym owner signup if needed (similar implementation)

## 📞 Support

- **Twilio Docs**: https://www.twilio.com/docs
- **OTP Service**: Check `backend/src/services/otpService.js`
- **Frontend Flow**: Check `frontend/src/components/auth/AuthScreen.jsx`

---

**Status**: ✅ Ready to Deploy
**Last Updated**: 2024
**Version**: 1.0
