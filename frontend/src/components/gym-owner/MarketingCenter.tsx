import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  ImagePlus,
  LoaderCircle,
  MapPin,
  Megaphone,
  MessageCircle,
  Target,
  UploadCloud,
} from "lucide-react";
import {
  createGymCampaign,
  executeGymCampaignDemo,
  executeGymCampaign,
  getGymCampaignPaymentOptions,
  getGymCampaigns,
  uploadGymCampaignCreative,
} from "../../services/api";
import type {
  Campaign,
  CampaignCreatePayload,
  CampaignObjective,
  CampaignPaymentMode,
  CampaignPaymentOptions,
  CampaignPaymentConfirmation,
  CampaignStatus,
  RazorpayCheckoutOptions,
} from "./marketingTypes";
import "./MarketingCenter.css";

const budgetOptions = [300, 500, 1000];
const durationOptions = [3, 7, 14];
const maximumCreativeBytes = 500 * 1024 * 1024;

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-movora-razorpay="true"]');
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Razorpay checkout could not be loaded.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.movoraRazorpay = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay checkout could not be loaded."));
    document.body.appendChild(script);
  });
}

function formatMoney(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function statusLabel(status: CampaignStatus): string {
  const labels: Record<CampaignStatus, string> = {
    DRAFT: "Payment pending",
    PENDING_PAYMENT: "Payment pending",
    ACTIVE: "Active",
    PAUSED: "Paused",
    COMPLETED: "Completed",
  };
  return labels[status];
}

function MarketingCenter({ gymOwner }: { gymOwner: { id?: string; gym_id?: string; email?: string; gymName?: string; phone?: string } }) {
  const gymId = gymOwner.id || gymOwner.gym_id || "";
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsError, setCampaignsError] = useState("");
  const [objective, setObjective] = useState<CampaignObjective>("GET_MEMBERS");
  const [radius, setRadius] = useState(5);
  const [dailyBudget, setDailyBudget] = useState(500);
  const [durationDays, setDurationDays] = useState(7);
  const [campaignName, setCampaignName] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [creativeFile, setCreativeFile] = useState<File | null>(null);
  const [creativeUrl, setCreativeUrl] = useState("");
  const [creativePreview, setCreativePreview] = useState("");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentOptions, setPaymentOptions] = useState<CampaignPaymentOptions | null>(null);
  const [pendingCampaign, setPendingCampaign] = useState<CampaignCreatePayload | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  const refreshCampaigns = useCallback(async () => {
    if (!gymId) {
      setCampaignsError("Your gym-owner account is missing its gym ID. Sign in again to continue.");
      setCampaignsLoading(false);
      return;
    }
    setCampaignsLoading(true);
    setCampaignsError("");
    try {
      const result = await getGymCampaigns(gymId) as Campaign[];
      if (!Array.isArray(result)) throw new Error("The campaigns API returned an invalid response.");
      setCampaigns(result);
    } catch (error) {
      console.error("Unable to load gym campaigns.", error);
      setCampaignsError(error instanceof Error ? error.message : "Unable to load campaigns.");
    } finally {
      setCampaignsLoading(false);
    }
  }, [gymId]);

  useEffect(() => {
    void refreshCampaigns();
  }, [refreshCampaigns]);

  useEffect(() => {
    if (!creativePreview.startsWith("blob:")) return undefined;
    return () => URL.revokeObjectURL(creativePreview);
  }, [creativePreview]);

  const estimatedBudget = dailyBudget * durationDays;
  const estimatedTax = Math.round(estimatedBudget * 0.18);
  const totalAmount = estimatedBudget + estimatedTax;
  const activeCampaigns = useMemo(
    () => campaigns.filter(campaign => campaign.status === "ACTIVE" || campaign.status === "PAUSED"),
    [campaigns],
  );

  const chooseGymLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Location access is not available in this browser.");
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationLoading(false);
      },
      error => {
        setLocationLoading(false);
        setLocationError(error.code === error.PERMISSION_DENIED
          ? "Allow location access to target ads around your gym."
          : "Could not determine your location. Try again or check your device settings.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const selectCreative = async (file: File | undefined) => {
    setFormError("");
    setCreativeUrl("");
    setCreativeFile(null);
    setCreativePreview("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"].includes(file.type)) {
      setFormError("Choose a JPEG, PNG, WebP, MP4, or MOV file.");
      return;
    }
    if (file.size > maximumCreativeBytes) {
      setFormError("Choose an image or video that is 500 MB or smaller.");
      return;
    }
    setCreativeFile(file);
    setCreativePreview(URL.createObjectURL(file));
    setUploadLoading(true);
    try {
      const uploaded = await uploadGymCampaignCreative(file) as { image_url?: string };
      if (!uploaded.image_url) throw new Error("Media upload returned no public URL.");
      setCreativeUrl(uploaded.image_url);
    } catch (error) {
      console.error("Unable to upload campaign creative.", error);
      setCreativeFile(null);
      setCreativePreview("");
      setFormError(error instanceof Error ? error.message : "Media upload failed.");
    } finally {
      setUploadLoading(false);
    }
  };

  const openCheckout = async (campaign: Campaign) => {
    if (!campaign.payment_order_id || !campaign.payment_key_id) {
      throw new Error("Campaign checkout details are missing. Please contact support before retrying.");
    }
    await loadRazorpay();
    if (!window.Razorpay) throw new Error("Razorpay checkout did not initialize.");

    const options: RazorpayCheckoutOptions = {
      key: campaign.payment_key_id,
      amount: campaign.total_amount_paise,
      currency: "INR",
      name: "Movora",
      description: campaign.campaign_name,
      order_id: campaign.payment_order_id,
      prefill: { email: gymOwner.email, contact: gymOwner.phone },
      theme: { color: "#0066FF" },
      handler: async (payment: CampaignPaymentConfirmation) => {
        setSubmitting(true);
        setFormError("");
        try {
          await executeGymCampaign(campaign.id, payment);
          setNotice("Payment confirmed and campaign activated.");
          await refreshCampaigns();
        } catch (error) {
          console.error("Unable to execute paid gym campaign.", error);
          setFormError(error instanceof Error ? error.message : "Payment was received but campaign activation failed. Contact support.");
          await refreshCampaigns();
        } finally {
          setSubmitting(false);
        }
      },
      modal: {
        ondismiss: () => {
          setSubmitting(false);
          setNotice("Your campaign draft is saved. Finish payment to activate it.");
          void refreshCampaigns();
        },
      },
    };
    new window.Razorpay(options).open();
  };

  const launchCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    setNotice("");
    if (!coordinates) {
      setFormError("Set your gym location before creating a campaign.");
      return;
    }
    if (!creativeFile || !creativeUrl) {
      setFormError("Upload a campaign image or video before continuing.");
      return;
    }
    if (!gymId) {
      setFormError("Your gym-owner account is missing its gym ID. Sign in again to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: CampaignCreatePayload = {
        campaign_name: campaignName.trim(),
        objective,
        daily_budget_inr: dailyBudget,
        duration_days: durationDays,
        target_radius_km: radius,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        image_url: creativeUrl,
        primary_text: primaryText.trim(),
      };
      const options = await getGymCampaignPaymentOptions() as CampaignPaymentOptions;
      if (typeof options.razorpay_available !== "boolean" || typeof options.demo_payment_available !== "boolean") {
        throw new Error("The campaign payment options response was invalid.");
      }
      setPendingCampaign(payload);
      setPaymentOptions(options);
      setPaymentDialogOpen(true);
    } catch (error) {
      console.error("Unable to load campaign payment options.", error);
      setFormError(error instanceof Error ? error.message : "Campaign payment options could not be loaded.");
    } finally {
      setSubmitting(false);
    }
  };

  const choosePaymentMode = async (paymentMode: CampaignPaymentMode) => {
    if (!pendingCampaign || !paymentOptions) return;
    if (paymentMode === "razorpay" && !paymentOptions.razorpay_available) return;
    if (paymentMode === "demo" && !paymentOptions.demo_payment_available) return;

    setPaymentDialogOpen(false);
    setSubmitting(true);
    setFormError("");
    let waitingForCheckout = false;
    try {
      const campaign = await createGymCampaign(pendingCampaign, paymentMode) as Campaign;
      setCampaigns(current => [campaign, ...current]);
      if (paymentMode === "demo") {
        await executeGymCampaignDemo(campaign.id);
        setNotice("Sandbox test completed. No real payment was made; verify the campaign in your Meta test ad account.");
        await refreshCampaigns();
      } else {
        await openCheckout(campaign);
        waitingForCheckout = true;
      }
    } catch (error) {
      console.error(`Unable to start ${paymentMode} gym campaign.`, error);
      setFormError(error instanceof Error ? error.message : "Campaign could not be created.");
      await refreshCampaigns();
    } finally {
      if (!waitingForCheckout) setSubmitting(false);
    }
  };

  return (
    <main className="marketing-center">
      <header className="mk-header">
        <span className="mk-header-icon"><Megaphone size={21} /></span>
        <span className="mk-header-copy">
          <span className="mk-eyebrow">MOVORA GROWTH</span>
          <h1>Run Local Ads in 1-Tap.</h1>
          <p>No Meta Ad Account or Marketing Expertise Needed.</p>
        </span>
      </header>

      <div className="mk-layout">
        <section className="mk-builder-card" aria-labelledby="mk-builder-heading">
          <div className="mk-section-heading">
            <span><span className="mk-eyebrow">CAMPAIGN SETUP</span><h2 id="mk-builder-heading">Reach your neighborhood</h2></span>
            <span className="mk-owner-tag">{gymOwner.gymName || "Your gym"}</span>
          </div>

          <form onSubmit={launchCampaign}>
            <fieldset className="mk-objectives">
              <legend>What do you want to achieve?</legend>
              <div className="mk-segmented-control">
                <button type="button" aria-pressed={objective === "GET_MEMBERS"} className={objective === "GET_MEMBERS" ? "is-selected" : ""} onClick={() => setObjective("GET_MEMBERS")}>
                  <Target size={16} /><span><strong>Get New Members</strong><small>Collect lead contacts for workouts.</small></span>
                </button>
                <button type="button" aria-pressed={objective === "DIRECT_MESSAGES"} className={objective === "DIRECT_MESSAGES" ? "is-selected" : ""} onClick={() => setObjective("DIRECT_MESSAGES")}>
                  <MessageCircle size={16} /><span><strong>Get Direct Messages</strong><small>Chat directly with local prospects on WhatsApp or Movora.</small></span>
                </button>
              </div>
            </fieldset>

            <div className="mk-field-section">
              <div className="mk-control-heading"><label htmlFor="mk-radius">Target radius</label><strong>{radius} km</strong></div>
              <input id="mk-radius" className="mk-radius-slider" type="range" min="3" max="15" step="1" value={radius} onChange={event => setRadius(Number(event.target.value))} style={{ "--mk-progress": `${((radius - 3) / 12) * 100}%` } as CSSProperties} />
              <div className="mk-slider-limits"><span>3 km</span><span>15 km</span></div>
              <div className={`mk-location-preview ${coordinates ? "has-location" : ""}`}>
                <span className="mk-location-icon"><MapPin size={17} /></span>
                <span className="mk-location-copy">
                  <strong>{coordinates ? `Ads will reach people within ${radius} km of your gym` : "Set your gym’s location"}</strong>
                  <small>{coordinates ? `Location confirmed · ${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}` : "Use your current location to target nearby prospects."}</small>
                </span>
                <button type="button" className="mk-location-button" disabled={locationLoading} onClick={chooseGymLocation}>
                  {locationLoading ? <LoaderCircle size={15} className="mk-spin" /> : <MapPin size={15} />}
                  {locationLoading ? "Locating" : coordinates ? "Update" : "Set location"}
                </button>
              </div>
              {locationError && <p className="mk-inline-error">{locationError}</p>}
            </div>

            <div className="mk-budget-duration">
              <fieldset>
                <legend>Daily budget</legend>
                <div className="mk-chip-row">
                  {budgetOptions.map(budget => <button type="button" key={budget} aria-pressed={dailyBudget === budget} className={`mk-chip ${dailyBudget === budget ? "is-selected" : ""}`} onClick={() => setDailyBudget(budget)}>{formatMoney(budget)}<small>/day</small></button>)}
                </div>
              </fieldset>
              <fieldset>
                <legend>Duration</legend>
                <div className="mk-chip-row">
                  {durationOptions.map(days => <button type="button" key={days} aria-pressed={durationDays === days} className={`mk-chip ${durationDays === days ? "is-selected" : ""}`} onClick={() => setDurationDays(days)}>{days} days</button>)}
                </div>
              </fieldset>
            </div>

            <div className="mk-field-section">
              <label className="mk-field-label" htmlFor="mk-campaign-name">Campaign name</label>
              <input id="mk-campaign-name" className="mk-text-input" maxLength={120} minLength={2} required value={campaignName} onChange={event => setCampaignName(event.target.value)} placeholder="e.g. Local strength training offer" />
            </div>

            <div className="mk-creative-fields">
              <div>
                <label className="mk-field-label" htmlFor="mk-primary-text">Ad headline and message</label>
                <textarea id="mk-primary-text" required maxLength={2000} rows={4} value={primaryText} onChange={event => setPrimaryText(event.target.value)} placeholder="Tell nearby people what makes your gym a great place to train..." />
                <small className="mk-character-count">{primaryText.length}/2000</small>
              </div>
              <div>
                <span className="mk-field-label">Campaign image or video</span>
                <label className={`mk-upload-box ${creativePreview ? "has-media" : ""}`} htmlFor="mk-creative-upload">
                  {creativePreview
                    ? creativeFile?.type.startsWith("video/")
                      ? <video src={creativePreview} aria-label="Campaign video preview" controls playsInline />
                      : <img src={creativePreview} alt="Campaign image preview" />
                    : <><span className="mk-upload-icon">{uploadLoading ? <LoaderCircle size={21} className="mk-spin" /> : <UploadCloud size={21} />}</span><strong>{uploadLoading ? "Uploading your media..." : "Choose an image or video"}</strong><small>JPEG, PNG, WebP, MP4 or MOV · up to 500 MB</small></>}
                  <input id="mk-creative-upload" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" disabled={uploadLoading || submitting} onChange={event => void selectCreative(event.target.files?.[0])} />
                  {creativePreview && <span className="mk-image-replace"><ImagePlus size={14} /> Change media</span>}
                </label>
              </div>
            </div>

            <div className="mk-price-summary">
              <span><small>{formatMoney(dailyBudget)} × {durationDays} days + estimated GST</small><strong>Campaign total</strong></span>
              <strong>{formatMoney(totalAmount)}</strong>
            </div>
            {formError && <p className="mk-form-error" role="alert">{formError}</p>}
            {notice && <p className="mk-form-notice" role="status"><CheckCircle2 size={15} />{notice}</p>}
            <button type="submit" className="mk-launch-button" disabled={submitting || uploadLoading || !creativeUrl || !coordinates}>
              {submitting ? <><LoaderCircle size={17} className="mk-spin" /> Preparing secure checkout</> : <>Launch Campaign <span>• {formatMoney(totalAmount)}</span><ArrowUpRight size={17} /> </>}
            </button>
            <p className="mk-payment-note"><CheckCircle2 size={13} /> Choose Razorpay for a real payment or sandbox demo when enabled.</p>
          </form>
        </section>

        <aside className="mk-campaigns-panel" aria-labelledby="mk-campaigns-heading">
          <div className="mk-campaigns-title">
            <span><span className="mk-eyebrow">YOUR AD ACTIVITY</span><h2 id="mk-campaigns-heading">Campaigns</h2></span>
            {!campaignsLoading && <span className="mk-campaign-count">{campaigns.length}</span>}
          </div>
          {campaignsLoading ? <div className="mk-state-box"><LoaderCircle size={21} className="mk-spin" /><span>Loading your campaigns...</span></div>
            : campaignsError ? <div className="mk-state-box mk-state-error"><span>{campaignsError}</span><button type="button" onClick={() => void refreshCampaigns()}>Try again</button></div>
              : campaigns.length === 0 ? <div className="mk-state-box mk-empty-state"><span className="mk-empty-icon"><Megaphone size={22} /></span><strong>No active ad campaigns running.</strong><span>Launch your first campaign above!</span></div>
                : <div className="mk-campaign-list">
                  {activeCampaigns.length === 0 && <div className="mk-no-active"><Clock3 size={15} /> No active ad campaigns running.</div>}
                  {campaigns.map(campaign => (
                    <article className="mk-campaign-item" key={campaign.id}>
                      <span className={`mk-campaign-status mk-status-${campaign.status.toLowerCase()}`}>{statusLabel(campaign.status)}</span>
                      {campaign.payment_status === "TEST" && <span className="mk-test-payment-badge">SANDBOX TEST · NOT PAID</span>}
                      <strong>{campaign.campaign_name}</strong>
                      <span>{campaign.objective === "GET_MEMBERS" ? "Get New Members" : "Get Direct Messages"} · {campaign.target_radius_km} km · {campaign.duration_days} days</span>
                      <div><small>{formatMoney(campaign.daily_budget_inr)} / day</small><small>{new Date(campaign.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</small></div>
                    </article>
                  ))}
                </div>}
          <div className="mk-integration-note"><span className="mk-integration-mark">M</span><span><strong>Managed by Movora</strong><small>Your ads run through Movora’s parent Meta account. No ad account needed.</small></span></div>
        </aside>
      </div>
      {paymentDialogOpen && paymentOptions && (
        <div className="mk-payment-dialog-backdrop" role="presentation">
          <section className="mk-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="mk-payment-dialog-title">
            <span className="mk-payment-dialog-icon"><CreditCard size={21} /></span>
            <h2 id="mk-payment-dialog-title">Choose how to continue</h2>
            <p className="mk-payment-dialog-summary">{campaignName.trim()} · {formatMoney(totalAmount)}</p>
            <button
              type="button"
              className="mk-payment-choice"
              disabled={!paymentOptions.razorpay_available}
              onClick={() => void choosePaymentMode("razorpay")}
            >
              <strong>Pay with Razorpay</strong>
              <span>{paymentOptions.razorpay_available ? "Real payment · campaign activates after verified payment" : "Unavailable until Razorpay keys are configured"}</span>
            </button>
            <button
              type="button"
              className="mk-payment-choice mk-payment-choice-demo"
              disabled={!paymentOptions.demo_payment_available}
              onClick={() => void choosePaymentMode("demo")}
            >
              <strong>Run sandbox demo</strong>
              <span>{paymentOptions.demo_payment_available
                ? "No charge · activates only in the configured Meta sandbox ad account"
                : "Unavailable · backend sandbox mode and matching test account are required"}</span>
            </button>
            {!paymentOptions.razorpay_available && (
              <p className="mk-payment-setup-note" role="note">
                To enable real checkout later, add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the marketing service in Railway.
              </p>
            )}
            {paymentOptions.demo_payment_available && (
              <p className="mk-payment-warning" role="note">
                Test mode is not a real payment and must only be enabled with a Meta test ad account. Do not use this mode with a live ad account.
              </p>
            )}
            <button
              type="button"
              className="mk-payment-cancel"
              disabled={submitting}
              onClick={() => setPaymentDialogOpen(false)}
            >
              Cancel
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

export default MarketingCenter;
