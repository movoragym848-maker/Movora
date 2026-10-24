export type CampaignObjective = "GET_MEMBERS" | "DIRECT_MESSAGES";
export type CampaignStatus = "DRAFT" | "PENDING_PAYMENT" | "ACTIVE" | "PAUSED" | "COMPLETED";

export interface Campaign {
  id: string;
  gym_id: string;
  campaign_name: string;
  objective: CampaignObjective;
  daily_budget_inr: number;
  duration_days: number;
  target_radius_km: number;
  latitude: number;
  longitude: number;
  image_url: string;
  primary_text: string;
  status: CampaignStatus;
  payment_order_id: string | null;
  payment_key_id?: string | null;
  payment_status: string;
  total_amount_paise: number;
  created_at: string;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
}

export interface CampaignPaymentOptions {
  razorpay_available: boolean;
  razorpay_missing_variables: string[];
  demo_payment_available: boolean;
  demo_payment_reasons: string[];
}

export type CampaignPaymentMode = "razorpay" | "demo";

export interface CampaignCreatePayload {
  campaign_name: string;
  objective: CampaignObjective;
  daily_budget_inr: number;
  duration_days: number;
  target_radius_km: number;
  latitude: number;
  longitude: number;
  image_url: string;
  primary_text: string;
}

export interface CampaignPaymentConfirmation {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  order_id: string;
  prefill?: { email?: string; contact?: string };
  handler: (payment: CampaignPaymentConfirmation) => void | Promise<void>;
  modal?: { ondismiss?: () => void };
  theme?: { color: string };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}
