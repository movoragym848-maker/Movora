# WhatsApp Notification Setup for Gym Owner Approval

## Current Status
✅ WhatsApp notification feature is **already implemented** in your code
✅ Runs automatically when gym owner creates account with pending approval status

## How It Works
1. Gym owner fills registration form (gym name, phone, email, city, password)
2. Account is created with status = "pending"  
3. Admin WhatsApp receives notification with all gym details
4. Message includes: Gym Name, City, Phone, Email, Status

## Setup Instructions

### Step 1: Choose WhatsApp API Provider

#### Option A: CallMeBot (FREE - Recommended)
**Pros**: Completely free, easy setup, no credit card needed
**Cons**: Slower, less reliable than Twilio

**Steps**:
1. Visit: https://www.callmebot.com/blog/free-api-whatsapp-messages/
2. Send WhatsApp message to: **+34 644 38 88 12**
3. Message text: **CallMeBot** (exact text required)
4. Wait for response with your API key
5. Copy your API key and phone number (format: 919023987904)

#### Option B: Twilio WhatsApp (Paid - More Reliable)
**Pros**: Professional, reliable, better delivery rates
**Cons**: Requires payment

**Steps**:
1. Create account at: https://www.twilio.com/whatsapp
2. Setup WhatsApp Sandbox number
3. Get credentials from Twilio Console:
   - Account SID
   - Auth Token  
   - WhatsApp Sandbox number

### Step 2: Update .env File

**Using CallMeBot**:
```bash
# Edit backend/.env
CALLMEBOT_API_KEY=your_api_key_from_callmebot
ADMIN_WHATSAPP_NUMBER=919XXXXXXXXXX  # Replace with YOUR phone number
```

**Using Twilio**:
```bash
# Edit backend/.env
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_FROM=+1234567890  # Your Twilio WhatsApp number
ADMIN_WHATSAPP_NUMBER=919XXXXXXXXXX  # Your phone number
```

### Step 3: Test the Integration
1. Restart your backend server
2. Register a new gym owner account from frontend
3. Check your WhatsApp for the notification message

## Message Format
Admin receives:
```
*Movora Admin Alert*

New gym owner registered:
- *Gym Name*: [Name]
- *City*: [City Name]
- *Phone*: [Phone Number]
- *Email*: [Email]
- *Status*: Pending Approval
```

## Troubleshooting

**Issue**: No message received
- ✓ Check if API key/Twilio credentials are correct in .env
- ✓ Restart backend server after updating .env
- ✓ Check browser console for errors
- ✓ Check backend server logs for WhatsApp service messages

**Issue**: Wrong phone number receiving messages
- Update `ADMIN_WHATSAPP_NUMBER` in .env
- Format: 919023987904 (country code + number, no + sign)
- Restart server

**Issue**: Message sent but very slow
- Consider switching from CallMeBot to Twilio for better reliability

## Files Involved
- `backend/src/controllers/gymOwnerController.js` - Calls notification on signup
- `backend/src/services/gymOwnerNotificationService.js` - Formats & sends message
- `backend/src/services/whatsappService.js` - WhatsApp API integration
- `backend/.env` - Configuration
