import { query } from "../db/pool.js";
import { sendWhatsappMessage } from "./whatsappService.js";

export async function notifyGymOwnerSignup(gymOwner) {
  const message = `New gym owner registered: ${gymOwner.gym_name} in ${gymOwner.city}. Contact: ${gymOwner.phone}, ${gymOwner.email}.`;
  await query(
    `INSERT INTO gym_owner_notifications (gym_owner_id, type, message, status, sent_at)
     VALUES ($1, 'gym_owner_signup', $2, 'sent', now())`,
    [gymOwner.id, message],
  );
  console.log(`[Movora Admin Notification] ${message}`);

  // Send WhatsApp alert to the admin
  const whatsappMessage = `Movora Booking Alert: A new registration request has been submitted. Details: Gym: ${gymOwner.gym_name}, Location: ${gymOwner.city}, Contact: ${gymOwner.phone}, Email: ${gymOwner.email}. Status: Pending Approval.`;
  await sendWhatsappMessage(whatsappMessage);
}
