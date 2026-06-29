# OTP Authentication - Technical Flow Diagram

## Complete Flow: User Signup to Account Created

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│                                                                 │
│  AuthScreen.jsx                                                 │
│  ├─ User fills signup form                                     │
│  │  (name, email, password, phone, gym)                       │
│  │                                                              │
│  ├─ Click "Send OTP & Continue" button                        │
│  │  ↓                                                           │
│  ├─ Validates form:                                            │
│  │  ├─ All fields filled ✓                                    │
│  │  ├─ Password >= 6 chars ✓                                  │
│  │  ├─ Phone = 10 digits ✓                                    │
│  │  └─ Gym exists ✓                                           │
│  │                                                              │
│  └─ Calls: sendPhoneOTP(phone)                                │
│     (from api.js)                                              │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                   NETWORK REQUEST                               │
│                                                                 │
│  POST /api/auth/send-otp                                       │
│  {                                                              │
│    "phone": "9876543210"                                       │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                  BACKEND (Node.js/Express)                     │
│                                                                 │
│  authController.js → sendPhoneOTP()                           │
│  ├─ Validates phone (10 digits)                               │
│  │                                                              │
│  └─ Calls: sendOTP(phone)                                     │
│     (from otpService.js)                                       │
│                                                                 │
│  otpService.js → sendOTP(phone)                               │
│  ├─ Generate OTP: Math.random() → "482916"                   │
│  │                                                              │
│  ├─ Store in database:                                        │
│  │  INSERT INTO otp_verifications (                           │
│  │    phone="9876543210",                                     │
│  │    otp_code="482916",                                      │
│  │    created_at=NOW(),                                       │
│  │    expires_at=NOW()+10min                                  │
│  │  )                                                          │
│  │                                                              │
│  ├─ Check Twilio credentials:                                │
│  │  ├─ IF exists → Send real SMS via Twilio API             │
│  │  └─ IF not → Log mock OTP to console                      │
│  │                                                              │
│  └─ Return: { ok: true, message: "OTP sent" }               │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                   NETWORK RESPONSE                              │
│                                                                 │
│  {                                                              │
│    "ok": true,                                                 │
│    "message": "OTP sent successfully"                          │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│                                                                 │
│  AuthScreen.jsx                                                │
│  ├─ Display: "✓ OTP sent successfully"                       │
│  ├─ Show: "Check your SMS"                                   │
│  ├─ Start 2-minute timer for resend                          │
│  ├─ Switch to OTP input screen                               │
│  │                                                             │
│  └─ Wait for user to enter OTP from SMS                      │
│     (or from console logs if mock mode)                       │
│                                                             │
│  User receives SMS:                                           │
│  ┌───────────────────────────────┐                           │
│  │ Your Movora OTP is:      │                           │
│  │      482916                   │                           │
│  │ Valid for 10 minutes          │                           │
│  └───────────────────────────────┘                           │
│                                                             │
│  User enters "482916" in app                                │
│  Click "Verify & Create Account"                           │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                   NETWORK REQUEST                               │
│                                                                 │
│  POST /api/auth/verify-otp                                    │
│  {                                                              │
│    "phone": "9876543210",                                     │
│    "otp": "482916"                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                  BACKEND (Node.js/Express)                     │
│                                                                 │
│  authController.js → verifyPhoneOTP()                         │
│  ├─ Validate phone format                                     │
│  ├─ Validate OTP format (6 digits)                           │
│  │                                                              │
│  └─ Calls: verifyOTP(phone, otp)                            │
│     (from otpService.js)                                       │
│                                                                 │
│  otpService.js → verifyOTP(phone, otp)                       │
│  ├─ Query database:                                           │
│  │  SELECT FROM otp_verifications                            │
│  │  WHERE phone="9876543210"                                 │
│  │  AND verified_at IS NULL                                  │
│  │  ORDER BY created_at DESC LIMIT 1                         │
│  │                                                              │
│  ├─ Validations:                                              │
│  │  ├─ OTP found? ✓                                          │
│  │  ├─ Not expired? (expires_at > NOW()) ✓                   │
│  │  │  └─ If expired → "OTP has expired"                    │
│  │  ├─ Attempts < 5? ✓                                       │
│  │  │  └─ If max → "Max attempts exceeded"                  │
│  │  └─ Code matches? (482916 == 482916) ✓                   │
│  │     └─ If wrong → Increment attempts, return error       │
│  │                                                              │
│  ├─ Mark as verified:                                         │
│  │  UPDATE otp_verifications                                 │
│  │  SET verified_at = NOW()                                  │
│  │  WHERE id = ...                                           │
│  │                                                              │
│  └─ Return: { ok: true, message: "Verified" }               │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                   NETWORK RESPONSE                              │
│                                                                 │
│  {                                                              │
│    "ok": true,                                                 │
│    "message": "OTP verified successfully"                      │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
│                                                                 │
│  AuthScreen.jsx → handleVerify()                             │
│  ├─ OTP verified successfully                                 │
│  │                                                              │
│  └─ Call: signup(pendingUser)                               │
│     (Complete normal signup with all user data)              │
│                                                             │
│  Regular signup flow:                                        │
│  ├─ Create user account                                     │
│  ├─ Hash password                                           │
│  ├─ Create refresh token                                    │
│  ├─ Create access token                                     │
│  └─ Login user immediately                                  │
│                                                             │
│  ✅ Account created & user logged in!                       │
│                                                             │
│  Display user dashboard                                      │
└─────────────────────────────────────────────────────────────────┘
```

## State Flow During OTP Process

```
Initial State:
  mode: "signup"
  form: { name, email, phone, password, gymName, otp: "" }
  pendingUser: null
  otpSent: false
  otpTimer: 0

After "Send OTP" clicked:
  mode: "otp"
  pendingUser: { name, email, phone, password, gymName }
  otpSent: true
  otpTimer: 120 (counting down)
  
After OTP entered and verified:
  pendingUser is passed to signup()
  User is logged in
  pendingUser is cleared
  Component unmounts/redirects
```

## Error Handling Points

```
Frontend Errors:
├─ Form validation (missing fields, invalid format)
├─ Phone format (must be 10 digits)
├─ OTP format (must be 6 digits)
├─ Network errors
└─ Server errors

Backend Errors:
├─ Invalid phone number
├─ Twilio service not configured
├─ OTP not found
├─ OTP expired
├─ Max attempts exceeded
├─ Invalid OTP code
└─ Email/phone already exists
```

## Database Flow

```
1. INSERT OTP:
   INSERT INTO otp_verifications (phone, otp_code, expires_at)
   VALUES ('9876543210', '482916', NOW() + 10min)

2. QUERY FOR VERIFICATION:
   SELECT * FROM otp_verifications
   WHERE phone = '9876543210'
   AND verified_at IS NULL
   ORDER BY created_at DESC
   LIMIT 1

3. VERIFY AND UPDATE:
   - Check if OTP expired
   - Check if attempts exceeded
   - Check if code matches
   - UPDATE verified_at = NOW()

4. AUTO CLEANUP (hourly):
   DELETE FROM otp_verifications
   WHERE expires_at < NOW() - 1 hour
```

## Key Variables

### Frontend (AuthScreen.jsx)
```javascript
otpSent        // boolean - was OTP sent successfully?
otpLoading     // boolean - is sending/verifying?
otpTimer       // number - seconds until can resend
pendingUser    // object - user data waiting for OTP verification
```

### Backend (otpService.js)
```javascript
otp_code       // string - 6 digit code
expires_at     // timestamp - 10 minutes from creation
verified_at    // timestamp - when verified (null if not yet)
attempts       // number - failed attempts count (0-5)
```

## Security Measures

1. OTP Validation
   - 6 digits (high entropy)
   - Database verified (not client-side)
   - Time-limited (10 minutes)
   - Attempt-limited (5 max)

2. Phone Validation
   - Format: 10 digits only
   - Stored in DB during signup
   - Unique constraint (no duplicate phones)

3. Auto-Cleanup
   - Expired OTPs deleted after 1 hour
   - Prevents database bloat
   - Improves security

4. Session Safety
   - OTP only marks phone as verified
   - Account not created until full signup
   - Phone & OTP separate concerns
```

Perfect! Now let me create one final file showing example code snippets for reference:
