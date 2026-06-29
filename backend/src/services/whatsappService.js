import { env } from "../config/env.js";

// Helper to detect if a message pattern matches an approved Meta template.
// If it matches, we send the template payload, otherwise we send a plain text message payload.
function detectTemplatePayload(message, to) {
  // 1. Check for OTP Template (Booking Confirmation)
  const otpMatch = message.match(/Your Movora booking confirmation ID is (\d{6})/);
  if (otpMatch) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "template",
      template: {
        name: "movora_booking",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: otpMatch[1] }
            ]
          }
        ]
      }
    };
  }

  // 2. Check for Expiry Reminder Template
  const reminderMatch = message.match(/Hi (.*?), 👋\n\nYour scheduled booking at (.*?) is expiring soon! 🏋️\n\nPlease update your access schedule at the counter\.\n\nThank you!/);
  if (reminderMatch) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "template",
      template: {
        name: "movora_reminder",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: reminderMatch[1] },
              { type: "text", text: reminderMatch[2] }
            ]
          }
        ]
      }
    };
  }

  // 3. Check for New Registration Alert Template (for Admin)
  const regMatch = message.match(/Movora Booking Alert: A new registration request has been submitted\. Details: Gym: (.*?), Location: (.*?), Contact: (.*?), Email: (.*?)\. Status: Pending Approval\./);
  if (regMatch) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to,
      type: "template",
      template: {
        name: "movora_registration_alert",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: regMatch[1] },
              { type: "text", text: regMatch[2] },
              { type: "text", text: regMatch[3] },
              { type: "text", text: regMatch[4] }
            ]
          }
        ]
      }
    };
  }

  // Fallback: Plain text message
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "text",
    text: {
      preview_url: false,
      body: message
    }
  };
}

export async function sendWhatsappMessage(message, toPhoneNumber = null) {
  const { whatsappAccessToken, whatsappPhoneNumberId, twilioAccountSid, twilioAuthToken, twilioWhatsappFrom, adminWhatsappNumber, callmebotApiKey } = env;

  // Use provided phone number or fall back to admin number
  let to = (toPhoneNumber || adminWhatsappNumber || "+919023987904").trim();
  if (!to.startsWith("+")) {
    to = to.length === 10 ? `+91${to}` : `+${to}`;
  }

  // Clean format for Meta API (expects only digits, no '+')
  const cleanTo = to.replace("+", "");

  // 1. Try Direct Meta WhatsApp Cloud API first if configured
  if (whatsappAccessToken && whatsappPhoneNumberId) {
    console.log(`[WhatsApp Service] Attempting to send message via Meta Cloud API to ${to}...`);
    const metaUrl = `https://graph.facebook.com/v25.0/${whatsappPhoneNumberId}/messages`;
    const payload = detectTemplatePayload(message, cleanTo);

    try {
      const response = await fetch(metaUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${whatsappAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("[Meta WhatsApp Cloud API] Error response:", data);
        // Do not return false; try to fall back to other configured channels
      } else {
        console.log(`[Meta WhatsApp Cloud API] Message successfully sent to ${to}. ID: ${data.messages?.[0]?.id}`);
        return true;
      }
    } catch (error) {
      console.error("[Meta WhatsApp Cloud API] Connection error:", error);
    }
  }

  // 2. Try CallMeBot first if the API key is configured (completely free)
  if (callmebotApiKey) {
    console.log(`[WhatsApp Service] Attempting to send message via CallMeBot to ${to}...`);
    const encodedMessage = encodeURIComponent(message);
    const callmebotUrl = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(to)}&text=${encodedMessage}&apikey=${callmebotApiKey}`;

    try {
      const response = await fetch(callmebotUrl);
      const text = await response.text();
      if (!response.ok) {
        console.error("[CallMeBot WhatsApp Service] Failed to send message:", text);
        // Do not return false yet; we might fall back to Twilio if those keys exist
      } else {
        console.log(`[CallMeBot WhatsApp Service] Message successfully dispatched: ${text}`);
        return true;
      }
    } catch (error) {
      console.error("[CallMeBot WhatsApp Service] Error sending message:", error);
      // Fall through to Twilio
    }
  }

  // 3. Fall back to Twilio WhatsApp API
  if (twilioAccountSid && twilioAuthToken) {
    console.log(`[WhatsApp Service] Attempting to send message via Twilio to ${to}...`);
    let from = (twilioWhatsappFrom || "+14155238886").trim();
    if (!from.startsWith("+")) {
      from = `+${from}`;
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;

    const bodyParams = new URLSearchParams();
    bodyParams.append("To", `whatsapp:${to}`);
    bodyParams.append("From", `whatsapp:${from}`);
    bodyParams.append("Body", message);

    try {
      const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64");
      const response = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: bodyParams.toString()
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("[Twilio WhatsApp Service] Failed to send message:", data);
        return false;
      }

      console.log(`[Twilio WhatsApp Service] Message successfully sent to ${to}. SID: ${data.sid}`);
      return true;
    } catch (error) {
      console.error("[Twilio WhatsApp Service] Error sending message via Twilio:", error);
      return false;
    }
  }

  console.warn("[WhatsApp Service] No WhatsApp credentials configured. Message logged to console.");
  console.log(`[Pending WhatsApp Notification] To: ${to}, Message: "${message}"`);
  return false;
}
